import Foundation

// MARK: - Plan / Vorgaben

/// Eine geplante Satz-Vorgabe einer Übung (Zielwiederholungen × Zielgewicht).
struct SetTarget: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var reps: Int
    var weight: Double      // kg (0 = Körpergewicht / ohne Zusatzgewicht)
    var isWarmup: Bool = false
}

/// Eine Übung mit ihren aktuellen Gewichtsvorgaben.
struct Exercise: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var name: String
    var note: String = ""
    var targets: [SetTarget] = []
    /// Schrittweite für Progressive Overload (kg), z. B. 2.5 an der Hantel, 1.25 am Block.
    var increment: Double = 2.5

    /// Anzahl echter Arbeitssätze (ohne Aufwärmsätze).
    var workingSetCount: Int { targets.filter { !$0.isWarmup }.count }

    /// Schwerstes Vorgabe-Gewicht (Top-Set).
    var topTargetWeight: Double { targets.map(\.weight).max() ?? 0 }
}

/// Ein Workout / eine Trainingseinheit als Vorlage (z. B. "Push", "Rücken").
struct Routine: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var name: String
    var exercises: [Exercise] = []
}

// MARK: - Verlauf / geloggte Einheiten

/// Ein tatsächlich ausgeführter Satz.
struct LoggedSet: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var reps: Int
    var weight: Double
    var isWarmup: Bool = false
    var completed: Bool = false
}

/// Eine Übung innerhalb einer geloggten Einheit.
struct LoggedExercise: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var exerciseId: UUID
    var name: String
    var sets: [LoggedSet] = []

    /// Gesamtvolumen (Σ Wdh × Gewicht) über die Arbeitssätze.
    var volume: Double {
        sets.filter { !$0.isWarmup }.reduce(0) { $0 + Double($1.reps) * $1.weight }
    }

    /// Schwerstes bewegtes Gewicht (Top-Set) der Arbeitssätze.
    var topWeight: Double {
        sets.filter { !$0.isWarmup }.map(\.weight).max() ?? 0
    }

    /// Wurden alle (geplanten, abgehakten) Arbeitssätze erledigt?
    var allWorkingSetsCompleted: Bool {
        let working = sets.filter { !$0.isWarmup }
        return !working.isEmpty && working.allSatisfy { $0.completed }
    }
}

/// Eine abgeschlossene Trainingseinheit.
struct Session: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var routineId: UUID?
    var routineName: String
    var date: Date = Date()
    var exercises: [LoggedExercise] = []

    var totalVolume: Double { exercises.reduce(0) { $0 + $1.volume } }
    var completedSetCount: Int { exercises.reduce(0) { $0 + $1.sets.filter { $0.completed && !$0.isWarmup }.count } }
}

/// Ein Punkt im Verlauf einer einzelnen Übung – Identifiable für Charts/ForEach.
struct ExerciseHistoryEntry: Identifiable, Hashable {
    let id: UUID            // = Session-ID
    let date: Date
    let logged: LoggedExercise

    var topWeight: Double { logged.topWeight }
    var volume: Double { logged.volume }
}
