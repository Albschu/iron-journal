import XCTest
@testable import IronJournal

/// Tests der Progressive-Overload-Logik (`applyProgression`/`metAllTargets`,
/// erreichbar über die öffentliche API `save(session:)`) sowie `setTargetWeight`.
///
/// Hinweis: `AppStore` persistiert in den Documents-Ordner. In Tests ist das die
/// Sandbox des Test-Runners; jeder Test überschreibt `routines`/`sessions` direkt
/// nach der Initialisierung, daher sind die Tests unabhängig von eventuell
/// vorhandenen JSON-Dateien.
final class ProgressionTests: XCTestCase {

    // MARK: - Helfer

    /// Frischer Store mit definierten Routinen und leerem Verlauf.
    private func makeStore(_ routines: [Routine]) -> AppStore {
        let store = AppStore()
        store.sessions = []
        store.routines = routines
        return store
    }

    /// Markiert in einer Session alle Arbeitssätze als abgehakt
    /// (Wdh/Gewicht aus `makeSession` erfüllen die Vorgabe bereits).
    private func completeAllWorkingSets(_ session: inout Session) {
        for ei in session.exercises.indices {
            for si in session.exercises[ei].sets.indices
            where !session.exercises[ei].sets[si].isWarmup {
                session.exercises[ei].sets[si].completed = true
            }
        }
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

    // MARK: - Progression greift

    func testProgressionRaisesWeightWhenAllTargetsMet() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])

        var session = store.makeSession(from: routine)
        completeAllWorkingSets(&session)
        store.save(session: session)

        XCTAssertEqual(weight(of: store), 22.5, accuracy: 0.0001,
                       "Bei erreichten Vorgaben muss das Arbeitsgewicht um increment steigen.")
    }

    func testProgressionUsesPerExerciseIncrement() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 21.25)],
                                            increment: 1.25)
        let store = makeStore([routine])

        var session = store.makeSession(from: routine)
        completeAllWorkingSets(&session)
        store.save(session: session)

        XCTAssertEqual(weight(of: store), 22.5, accuracy: 0.0001)
    }

    // MARK: - Progression greift NICHT

    func testNoProgressionWhenSetNotCompleted() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])

        // Session ohne Abhaken speichern.
        let session = store.makeSession(from: routine)
        store.save(session: session)

        XCTAssertEqual(weight(of: store), 20, accuracy: 0.0001,
                       "Ohne abgehakte Sätze darf sich nichts erhöhen.")
    }

    func testNoProgressionWhenRepsBelowTarget() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])

        var session = store.makeSession(from: routine)
        completeAllWorkingSets(&session)
        session.exercises[0].sets[0].reps = 6   // unter Ziel-Wdh
        store.save(session: session)

        XCTAssertEqual(weight(of: store), 20, accuracy: 0.0001,
                       "Zu wenige Wiederholungen dürfen keine Steigerung auslösen.")
    }

    func testNoProgressionWhenWeightBelowTarget() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 8, weight: 20)])
        let store = makeStore([routine])

        var session = store.makeSession(from: routine)
        completeAllWorkingSets(&session)
        session.exercises[0].sets[0].weight = 17.5   // unter Ziel-Gewicht
        store.save(session: session)

        XCTAssertEqual(weight(of: store), 20, accuracy: 0.0001)
    }

    func testNoProgressionWhenIncrementZero() {
        let routine = singleExerciseRoutine(targets: [SetTarget(reps: 25, weight: 0)],
                                            increment: 0)
        let store = makeStore([routine])

        var session = store.makeSession(from: routine)
        completeAllWorkingSets(&session)
        store.save(session: session)

        XCTAssertEqual(weight(of: store), 0, accuracy: 0.0001,
                       "Bei increment 0 (z. B. Körpergewicht) bleibt die Vorgabe gleich.")
    }

    // MARK: - Aufwärmsätze

    func testWarmupSetsStayWhileWorkingSetsRise() {
        let routine = singleExerciseRoutine(targets: [
            SetTarget(reps: 8, weight: 15, isWarmup: true),
            SetTarget(reps: 8, weight: 20),
        ])
        let store = makeStore([routine])

        var session = store.makeSession(from: routine)
        completeAllWorkingSets(&session)   // Aufwärmsatz bleibt unangetastet
        store.save(session: session)

        XCTAssertEqual(weight(of: store, set: 0), 15, accuracy: 0.0001,
                       "Aufwärmsätze dürfen sich nicht erhöhen.")
        XCTAssertEqual(weight(of: store, set: 1), 22.5, accuracy: 0.0001,
                       "Arbeitssatz muss steigen.")
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

        XCTAssertEqual(weight(of: store, set: 0), 15, accuracy: 0.0001,
                       "Aufwärmsatz bleibt unverändert.")
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
