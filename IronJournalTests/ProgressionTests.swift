import XCTest
@testable import IronJournal

/// Tests des Progressive-Overload-**Trackers**: geschätztes 1RM (Epley),
/// die Statuslogik (`progressionStatus`), das *manuelle* Übernehmen eines
/// Vorschlags (`applySuggestedIncrease`), `setTargetWeight` sowie die
/// automatische **Vorbefüllung** neuer Einheiten (`makeSession`): letzte
/// Ist-Sätze, bei erreichtem Wiederholungsziel +Schrittweite.
///
/// Wichtig: `save(session:)` verändert die Vorgaben (targets) NICHT –
/// automatisch erhöht wird nur die Vorbefüllung der nächsten Einheit.
///
/// Hinweis: `AppStore` persistiert in den Documents-Ordner (Test-Sandbox).
/// Jeder Test überschreibt `routines`/`sessions` direkt nach der Initialisierung
/// und ist damit unabhängig von vorhandenen JSON-Dateien.
final class ProgressionTests: XCTestCase {

    // MARK: - Helfer

    private func makeStore(_ routines: [Routine]) -> AppStore {
        let store = AppStore()
        store.sessions = []
        store.routines = routines
        return store
    }

    private func singleExerciseRoutine(
        targets: [SetTarget],
        increment: Double = 2.5
    ) -> Routine {
        Routine(name: "Push", exercises: [
            Exercise(name: "Bankdrücken", targets: targets, increment: increment)
        ])
    }

    private func weight(of store: AppStore, set index: Int = 0) -> Double {
        store.routines[0].exercises[0].targets[index].weight
    }

    private func exercise(_ store: AppStore) -> Exercise {
        store.routines[0].exercises[0]
    }

    /// Loggt eine Einheit mit explizit gesetzten Arbeitssätzen.
    private func logSession(
        _ store: AppStore,
        routine: Routine,
        secondsSinceEpoch: TimeInterval,
        sets: [(reps: Int, weight: Double, completed: Bool)]
    ) {
        var s = store.makeSession(from: routine)
        s.date = Date(timeIntervalSince1970: secondsSinceEpoch)
        s.exercises[0].sets = sets.map {
            LoggedSet(reps: $0.reps, weight: $0.weight, completed: $0.completed)
        }
        store.save(session: s)
    }

    private func completeAllWorkingSets(_ session: inout Session) {
        for ei in session.exercises.indices {
            for si in session.exercises[ei].sets.indices
            where !session.exercises[ei].sets[si].isWarmup {
                session.exercises[ei].sets[si].completed = true
            }
        }
    }

    // MARK: - Geschätztes 1RM (Epley)

    func testEpleyEstimatedOneRepMax() {
        XCTAssertEqual(LoggedSet(reps: 5, weight: 100).estimatedOneRepMax,
                       116.6667, accuracy: 0.001)
    }

    func testBodyweightUsesRepsAsSignal() {
        // Ohne Zusatzgewicht zählen die Wiederholungen als Fortschrittssignal.
        XCTAssertEqual(LoggedSet(reps: 12, weight: 0).estimatedOneRepMax, 12, accuracy: 0.0001)
    }

    func testZeroRepsHasNoEstimate() {
        XCTAssertEqual(LoggedSet(reps: 0, weight: 100).estimatedOneRepMax, 0, accuracy: 0.0001)
    }

    // MARK: - Vorbefüllung der nächsten Einheit (Auto-Steigerung)

    func testPrefillUsesTargetsWithoutHistory() {
        let routine = singleExerciseRoutine(targets: [
            SetTarget(reps: 8, weight: 15, isWarmup: true),
            SetTarget(reps: 8, weight: 20),
        ])
        let store = makeStore([routine])

        let session = store.makeSession(from: routine)

        XCTAssertEqual(session.exercises[0].sets.count, 2)
        XCTAssertEqual(session.exercises[0].sets[1].weight, 20, accuracy: 0.0001)
    }

    func testPrefillAutoIncrementsAfterHittingRepGoals() {
        let routine = singleExerciseRoutine(targets: [
            SetTarget(reps: 8, weight: 15, isWarmup: true),
            SetTarget(reps: 8, weight: 20),
        ], increment: 2.5)
        let store = makeStore([routine])

        var session = store.makeSession(from: routine)
        session.exercises[0].sets[1].completed = true // Aufwärmen zählt nicht
        store.save(session: session)

        let next = store.makeSession(from: routine)
        XCTAssertEqual(next.exercises[0].sets[0].weight, 15, accuracy: 0.0001,
                       "Aufwärmsatz bleibt bei Auto-Steigerung unverändert.")
        XCTAssertEqual(next.exercises[0].sets[1].weight, 22.5, accuracy: 0.0001,
                       "Arbeitssatz wird automatisch um increment erhöht vorbefüllt.")
        XCTAssertFalse(next.exercises[0].sets[1].completed, "Vorbefüllte Sätze sind nicht abgehakt.")
        XCTAssertEqual(store.autoIncrement(for: exercise(store)), 2.5, accuracy: 0.0001,
                       "autoIncrement liefert die Schrittweite für den Hinweis.")
    }

    func testPrefillNoIncrementWhenSetNotCompleted() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])
        logSession(store, routine: routine, secondsSinceEpoch: 1_000, sets: [(8, 20, false)])

        let next = store.makeSession(from: routine)
        XCTAssertEqual(next.exercises[0].sets[0].weight, 20, accuracy: 0.0001)
        XCTAssertEqual(store.autoIncrement(for: exercise(store)), 0, accuracy: 0.0001)
    }

    func testPrefillNoIncrementWhenRepsBelowGoal() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])
        logSession(store, routine: routine, secondsSinceEpoch: 1_000, sets: [(6, 20, true)])

        let next = store.makeSession(from: routine)
        XCTAssertEqual(next.exercises[0].sets[0].weight, 20, accuracy: 0.0001)
    }

    func testPrefillUsesLastActualSetsIncludingExtraSet() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])
        // Letztes Mal schwerer als die Vorgabe und ein Satz mehr.
        logSession(store, routine: routine, secondsSinceEpoch: 1_000,
                   sets: [(8, 25, true), (10, 25, true)])

        let next = store.makeSession(from: routine)
        XCTAssertEqual(next.exercises[0].sets.count, 2, "Extra-Satz vom letzten Mal wird übernommen.")
        XCTAssertEqual(next.exercises[0].sets[0].weight, 27.5, accuracy: 0.0001,
                       "Steigerung basiert auf dem letzten Ist-Gewicht.")
        XCTAssertEqual(next.exercises[0].sets[1].reps, 10, "Wdh vom letzten Mal übernommen.")
    }

    func testPrefillAutoIncrementsAfterDeloadBelowTargetWeight() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])
        logSession(store, routine: routine, secondsSinceEpoch: 1_000, sets: [(8, 15, true)])

        let next = store.makeSession(from: routine)
        XCTAssertEqual(next.exercises[0].sets[0].weight, 17.5, accuracy: 0.0001,
                       "Nach einem Deload greift die Steigerung wieder (Gewicht egal, Wdh zählen).")
    }

    func testPrefillNoIncrementForBodyweight() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 25, weight: 0)], increment: 0)
        let store = makeStore([routine])
        logSession(store, routine: routine, secondsSinceEpoch: 1_000, sets: [(30, 0, true)])

        let next = store.makeSession(from: routine)
        XCTAssertEqual(next.exercises[0].sets[0].weight, 0, accuracy: 0.0001)
        XCTAssertEqual(next.exercises[0].sets[0].reps, 30, "Letzte Wdh werden vorbefüllt.")
    }

    // MARK: - Statuslogik

    func testNoDataWithoutHistory() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])
        XCTAssertEqual(store.progressionStatus(for: exercise(store)), .noData)
    }

    func testProgressingWhenE1RMRises() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])
        // Reps (5) bewusst unter Ziel (8), damit NICHT „bereit für mehr“ greift.
        logSession(store, routine: routine, secondsSinceEpoch: 1_000,
                   sets: [(5, 100, true)])
        logSession(store, routine: routine, secondsSinceEpoch: 2_000,
                   sets: [(5, 105, true)])

        guard case .progressing(let delta) = store.progressionStatus(for: exercise(store)) else {
            return XCTFail("Erwartet: progressing")
        }
        XCTAssertEqual(delta, 5.8333, accuracy: 0.001)
    }

    func testMaintainingWhenFlat() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])
        logSession(store, routine: routine, secondsSinceEpoch: 1_000, sets: [(5, 100, true)])
        logSession(store, routine: routine, secondsSinceEpoch: 2_000, sets: [(5, 100, true)])

        XCTAssertEqual(store.progressionStatus(for: exercise(store)), .maintaining)
    }

    func testStalledAfterThreeSessionsWithoutNewBest() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])
        logSession(store, routine: routine, secondsSinceEpoch: 1_000, sets: [(5, 100, true)])
        logSession(store, routine: routine, secondsSinceEpoch: 2_000, sets: [(5, 95, true)])
        logSession(store, routine: routine, secondsSinceEpoch: 3_000, sets: [(5, 95, true)])
        logSession(store, routine: routine, secondsSinceEpoch: 4_000, sets: [(5, 95, true)])

        XCTAssertEqual(store.progressionStatus(for: exercise(store)), .stalled(sessions: 3))
    }

    func testDeloadSuggestedAfterFiveSessionsWithoutNewBest() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])
        logSession(store, routine: routine, secondsSinceEpoch: 1_000, sets: [(5, 100, true)])
        for i in 1...5 {
            logSession(store, routine: routine,
                       secondsSinceEpoch: 1_000 + Double(i) * 1_000, sets: [(5, 95, true)])
        }
        XCTAssertEqual(store.progressionStatus(for: exercise(store)), .deloadSuggested(sessions: 5))
    }

    func testReadyToIncreaseWhenTargetsHitTwice() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)], increment: 2.5)
        let store = makeStore([routine])
        logSession(store, routine: routine, secondsSinceEpoch: 1_000, sets: [(8, 20, true)])
        logSession(store, routine: routine, secondsSinceEpoch: 2_000, sets: [(8, 20, true)])

        XCTAssertEqual(store.progressionStatus(for: exercise(store)), .readyToIncrease(suggested: 22.5))
    }

    func testReadyToIncreaseSkippedForBodyweight() {
        // increment 0 (Körpergewicht): kein Gewichtsvorschlag, obwohl Ziel erreicht.
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 25, weight: 0)], increment: 0)
        let store = makeStore([routine])
        logSession(store, routine: routine, secondsSinceEpoch: 1_000, sets: [(25, 0, true)])
        logSession(store, routine: routine, secondsSinceEpoch: 2_000, sets: [(25, 0, true)])

        XCTAssertEqual(store.progressionStatus(for: exercise(store)), .maintaining)
    }

    // MARK: - Kein Auto-Increase mehr beim Speichern

    func testSaveDoesNotAutoIncreaseWeight() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])

        var session = store.makeSession(from: routine)
        completeAllWorkingSets(&session)
        store.save(session: session)

        XCTAssertEqual(weight(of: store), 20, accuracy: 0.0001,
                       "Die App darf das Gewicht nicht mehr automatisch erhöhen.")
    }

    // MARK: - Manuelles Übernehmen des Vorschlags

    func testApplySuggestedIncreaseRaisesWorkingSetsOnly() {
        let routine = singleExerciseRoutine(targets: [
            SetTarget(reps: 8, weight: 15, isWarmup: true),
            SetTarget(reps: 8, weight: 20),
        ], increment: 2.5)
        let store = makeStore([routine])

        store.applySuggestedIncrease(routineId: store.routines[0].id,
                                     exerciseId: store.routines[0].exercises[0].id)

        XCTAssertEqual(weight(of: store, set: 0), 15, accuracy: 0.0001, "Aufwärmsatz bleibt.")
        XCTAssertEqual(weight(of: store, set: 1), 22.5, accuracy: 0.0001, "Arbeitssatz steigt um increment.")
    }

    func testApplySuggestedIncreaseNoOpWhenIncrementZero() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 25, weight: 0)], increment: 0)
        let store = makeStore([routine])

        store.applySuggestedIncrease(routineId: store.routines[0].id,
                                     exerciseId: store.routines[0].exercises[0].id)

        XCTAssertEqual(weight(of: store), 0, accuracy: 0.0001)
    }

    // MARK: - Manuelles Setzen

    func testSetTargetWeightOnlyAffectsWorkingSets() {
        let routine = singleExerciseRoutine(targets: [
            SetTarget(reps: 8, weight: 15, isWarmup: true),
            SetTarget(reps: 8, weight: 20),
            SetTarget(reps: 8, weight: 20),
        ])
        let store = makeStore([routine])

        store.setTargetWeight(30,
                              routineId: store.routines[0].id,
                              exerciseId: store.routines[0].exercises[0].id)

        XCTAssertEqual(weight(of: store, set: 0), 15, accuracy: 0.0001, "Aufwärmsatz bleibt unverändert.")
        XCTAssertEqual(weight(of: store, set: 1), 30, accuracy: 0.0001)
        XCTAssertEqual(weight(of: store, set: 2), 30, accuracy: 0.0001)
    }

    // MARK: - „Warum?“-Vergleich (Datenbasis der Status-Pille)

    func testBestWorkingSetPicksHighestE1RMIgnoringWarmups() {
        let logged = LoggedExercise(exerciseId: UUID(), name: "Bank", sets: [
            LoggedSet(reps: 12, weight: 40, isWarmup: true, completed: true),
            LoggedSet(reps: 8, weight: 20, completed: true),
            LoggedSet(reps: 5, weight: 25, completed: true),
        ])
        XCTAssertEqual(logged.bestWorkingSet?.weight ?? 0, 25, accuracy: 0.0001,
                       "Höchstes e1RM zählt, Aufwärmsätze werden ignoriert.")
    }

    func testBestWorkingSetBodyweightPicksMostReps() {
        let logged = LoggedExercise(exerciseId: UUID(), name: "Liegestütze", sets: [
            LoggedSet(reps: 10, weight: 0, completed: true),
            LoggedSet(reps: 14, weight: 0, completed: true),
        ])
        XCTAssertEqual(logged.bestWorkingSet?.reps, 14)
    }

    func testBestWorkingSetNilWithoutSets() {
        XCTAssertNil(LoggedExercise(exerciseId: UUID(), name: "Bank", sets: []).bestWorkingSet)
    }

    func testProgressComparisonNeedsTwoSessions() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])
        XCTAssertNil(store.progressComparison(for: exercise(store).id))
        logSession(store, routine: routine, secondsSinceEpoch: 1_000, sets: [(8, 80, true)])
        XCTAssertNil(store.progressComparison(for: exercise(store).id))
    }

    func testProgressComparisonMetrics() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])
        logSession(store, routine: routine, secondsSinceEpoch: 1_000, sets: [(8, 80, true)])
        logSession(store, routine: routine, secondsSinceEpoch: 2_000,
                   sets: [(8, 80, true), (9, 82.5, true)])

        guard let cmp = store.progressComparison(for: exercise(store).id) else {
            return XCTFail("Erwartet: Vergleich vorhanden")
        }
        XCTAssertEqual(cmp.prev.topWeight, 80, accuracy: 0.0001)
        XCTAssertEqual(cmp.last.topWeight, 82.5, accuracy: 0.0001)
        XCTAssertEqual(cmp.last.best?.reps, 9, "Bester Satz = höchstes e1RM der letzten Einheit.")
        XCTAssertEqual(cmp.last.setCount, 2)
        XCTAssertEqual(cmp.last.totalReps, 17)
        XCTAssertEqual(cmp.last.volume, 8 * 80 + 9 * 82.5, accuracy: 0.0001)
        let expectedDelta = LoggedSet(reps: 9, weight: 82.5).estimatedOneRepMax
            - LoggedSet(reps: 8, weight: 80).estimatedOneRepMax
        XCTAssertEqual(cmp.signalDelta, expectedDelta, accuracy: 0.0001,
                       "Signal-Delta = e1RM-Delta des besten Satzes.")
        XCTAssertFalse(cmp.isBodyweight)
        XCTAssertTrue(cmp.headline.contains("mehr Gewicht"),
                      "Headline benennt den Grund (mehr Gewicht).")
        XCTAssertTrue(cmp.headline.contains("mehr Wiederholungen"),
                      "Headline benennt den Grund (mehr Wiederholungen).")
    }

    func testProgressComparisonBodyweightHeadlineUsesReps() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 25, weight: 0)], increment: 0)
        let store = makeStore([routine])
        logSession(store, routine: routine, secondsSinceEpoch: 1_000, sets: [(25, 0, true)])
        logSession(store, routine: routine, secondsSinceEpoch: 2_000, sets: [(28, 0, true)])

        guard let cmp = store.progressComparison(for: exercise(store).id) else {
            return XCTFail("Erwartet: Vergleich vorhanden")
        }
        XCTAssertTrue(cmp.isBodyweight)
        XCTAssertTrue(cmp.headline.contains("25 → 28"),
                      "Körpergewicht: Headline vergleicht Wiederholungen.")
    }

    func testProgressComparisonMaintainingHeadline() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])
        logSession(store, routine: routine, secondsSinceEpoch: 1_000, sets: [(5, 100, true)])
        logSession(store, routine: routine, secondsSinceEpoch: 2_000, sets: [(5, 100, true)])

        guard let cmp = store.progressComparison(for: exercise(store).id) else {
            return XCTFail("Erwartet: Vergleich vorhanden")
        }
        XCTAssertEqual(cmp.signalDelta, 0, accuracy: 0.0001)
        XCTAssertTrue(cmp.headline.contains("genauso stark"),
                      "Ohne Delta erklärt die Headline den Gleichstand.")
    }

    // MARK: - Aufwärmsätze (Rampe zum Arbeitsgewicht)

    func testRoundToStep() {
        XCTAssertEqual(WarmUp.roundToStep(34), 35, accuracy: 0.0001)
        XCTAssertEqual(WarmUp.roundToStep(25.5), 25, accuracy: 0.0001)
        XCTAssertEqual(WarmUp.roundToStep(17, step: 0), 17, accuracy: 0.0001, "step 0 → unverändert")
    }

    func testWarmUpTargetsRamp() {
        let w = WarmUp.targets(workingWeight: 42.5)
        XCTAssertEqual(w.count, 3, "Standard-Rampe hat 3 Aufwärmsätze")
        XCTAssertTrue(w.allSatisfy { $0.isWarmup }, "alle erzeugten Sätze sind Aufwärmsätze")
        XCTAssertEqual(w[0].weight, WarmUp.roundToStep(42.5 * 0.4), accuracy: 0.0001, "40 %")
        XCTAssertEqual(w[1].weight, WarmUp.roundToStep(42.5 * 0.6), accuracy: 0.0001, "60 %")
        XCTAssertEqual(w[2].weight, WarmUp.roundToStep(42.5 * 0.8), accuracy: 0.0001, "80 %")
        XCTAssertTrue(w[0].reps >= w[1].reps && w[1].reps >= w[2].reps, "Wiederholungen steigen ab")
    }

    func testWarmUpEmptyForBodyweight() {
        XCTAssertTrue(WarmUp.targets(workingWeight: 0).isEmpty,
                      "Körpergewicht (0 kg) → keine prozentualen Aufwärmsätze")
        XCTAssertTrue(WarmUp.loggedSets(workingWeight: 0).isEmpty)
    }

    func testWarmUpLaterExerciseSingleFeelerSet() {
        let w = WarmUp.targets(workingWeight: 42.5, later: true)
        XCTAssertEqual(w.count, 1, "spätere Übung: nur 1 Einpendel-Satz")
        XCTAssertEqual(w[0].weight, WarmUp.roundToStep(42.5 * 0.6), accuracy: 0.0001, "60 %")
        XCTAssertTrue(w[0].isWarmup)
        XCTAssertTrue(WarmUp.targets(workingWeight: 0, later: true).isEmpty,
                      "Körpergewicht auch später → keine Sätze")
    }

    func testWarmUpLoggedSetsMatchTargets() {
        let logged = WarmUp.loggedSets(workingWeight: 100)
        XCTAssertEqual(logged.count, 3)
        XCTAssertTrue(logged.allSatisfy { $0.isWarmup && !$0.completed })
        XCTAssertEqual(logged[2].weight, 80, accuracy: 0.0001, "80 % von 100 kg")
    }

    func testTopWorkingWeightIgnoresWarmups() {
        let ex = Exercise(name: "Rudern", targets: [
            SetTarget(reps: 8, weight: 15, isWarmup: true),
            SetTarget(reps: 8, weight: 42.5),
            SetTarget(reps: 8, weight: 40),
        ])
        XCTAssertEqual(ex.topWorkingWeight, 42.5, accuracy: 0.0001)
    }

    // MARK: - Statistik je Workout-Art

    /// Legt eine Einheit einer Routine mit genau einem Arbeitssatz an.
    private func session(_ store: AppStore, _ routine: Routine, day: Int,
                         reps: Int, weight: Double) -> Session {
        var s = store.makeSession(from: routine)
        s.date = Date(timeIntervalSince1970: Double(day) * 86400)
        s.exercises[0].sets = [LoggedSet(reps: reps, weight: weight, completed: true)]
        return s
    }

    func testWorkoutStatsGroupsByWorkoutType() {
        let push = Routine(name: "Push", exercises: [Exercise(name: "Bank", targets: [SetTarget(reps: 10, weight: 50)])])
        let pull = Routine(name: "Pull", exercises: [Exercise(name: "Rudern", targets: [SetTarget(reps: 10, weight: 40)])])
        let store = makeStore([push, pull])
        store.sessions = [
            session(store, push, day: 0, reps: 10, weight: 50),   // Volumen 500
            session(store, push, day: 7, reps: 10, weight: 60),   // 600
            session(store, push, day: 14, reps: 10, weight: 70),  // 700
            session(store, pull, day: 1, reps: 10, weight: 40),   // 400
        ]

        let stats = workoutStats(store.sessions)
        XCTAssertEqual(stats.count, 2, "eine Zeile je Workout-Art")
        XCTAssertEqual(stats[0].name, "Push", "meist-trainiertes Workout zuerst")
        XCTAssertEqual(stats[0].count, 3)
        XCTAssertEqual(stats[0].average, 600, accuracy: 0.001, "Ø Volumen")
        XCTAssertEqual(stats[0].last, 700, accuracy: 0.001, "letztes Volumen")
        XCTAssertEqual(stats[0].best, 700, accuracy: 0.001, "bestes Volumen")
        XCTAssertEqual(stats[0].perWeek ?? 0, 100, accuracy: 0.5, "Trend ≈ +100 kg/Woche")
        XCTAssertEqual(stats[1].count, 1)
        XCTAssertNil(stats[1].perWeek, "kein Trend bei einer einzelnen Einheit")
    }

    func testWorkoutStatsStrengthIndexAndRange() {
        let push = Routine(name: "Push", exercises: [Exercise(name: "Bank", targets: [SetTarget(reps: 10, weight: 50)])])
        let store = makeStore([push])
        store.sessions = [
            session(store, push, day: 0, reps: 10, weight: 50),
            session(store, push, day: 14, reps: 10, weight: 70),
        ]

        let strength = workoutStats(store.sessions, metric: .strength)
        XCTAssertEqual(strength[0].last,
                       LoggedSet(reps: 10, weight: 70).estimatedOneRepMax,
                       accuracy: 0.001, "Kraft-Index = e1RM des besten Satzes")

        // Zeitraum-Filter schneidet die ältere Einheit ab.
        let recent = workoutStats(store.sessions, since: Date(timeIntervalSince1970: 10 * 86400))
        XCTAssertEqual(recent.count, 1)
        XCTAssertEqual(recent[0].count, 1, "nur die jüngere Einheit im Zeitraum")
    }

    func testWorkoutStatsKeepsHistoryWhenRenamed() {
        let push = Routine(name: "Push", exercises: [Exercise(name: "Bank", targets: [SetTarget(reps: 10, weight: 50)])])
        let store = makeStore([push])
        store.sessions = [
            session(store, push, day: 0, reps: 10, weight: 50),
            session(store, push, day: 7, reps: 10, weight: 60),
        ]
        // Umbenennen: gruppiert wird über die routineId, der jüngste Name gewinnt.
        store.sessions[1].routineName = "Push A"

        let stats = workoutStats(store.sessions)
        XCTAssertEqual(stats.count, 1, "umbenanntes Workout bleibt eine Gruppe")
        XCTAssertEqual(stats[0].name, "Push A", "jüngster Name gewinnt")
        XCTAssertEqual(stats[0].count, 2, "Verlauf bleibt vollständig")
    }

    func testVolumeFormatting() {
        XCTAssertEqual(Fmt.volume(12500), "12,5 t", "großes Volumen kompakt in Tonnen")
        XCTAssertEqual(Fmt.volume(700), "700 kg", "kleines Volumen in kg")
        XCTAssertEqual(WorkoutMetric.sets.format(3), "3", "Sätze ohne Einheit")
    }

    // MARK: - Verlauf

    func testHistoryIsChronologicalAndPerExercise() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])
        let exerciseId = store.routines[0].exercises[0].id

        var older = store.makeSession(from: routine)
        older.date = Date(timeIntervalSince1970: 1_000)
        var newer = store.makeSession(from: routine)
        newer.date = Date(timeIntervalSince1970: 2_000)

        store.save(session: newer)
        store.save(session: older)

        let history = store.history(for: exerciseId)
        XCTAssertEqual(history.count, 2)
        XCTAssertEqual(history.first?.date, older.date, "Älteste Einheit zuerst.")
        XCTAssertEqual(history.last?.date, newer.date)
        XCTAssertEqual(store.lastSession(for: exerciseId)?.date, newer.date)
    }
}
