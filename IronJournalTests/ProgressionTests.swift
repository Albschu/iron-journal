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
