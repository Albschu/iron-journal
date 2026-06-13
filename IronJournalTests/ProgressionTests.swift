import XCTest
@testable import IronJournal

/// Tests des Progressive-Overload-**Trackers**: geschätztes 1RM (Epley),
/// die Statuslogik (`progressionStatus`), das *manuelle* Übernehmen eines
/// Vorschlags (`applySuggestedIncrease`) sowie `setTargetWeight`.
///
/// Wichtig: Seit der Umstellung erhöht `save(session:)` das Gewicht NICHT mehr
/// automatisch – die App prüft nur und schlägt vor.
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
