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

    /// Schwerstes Arbeitssatz-Gewicht (ohne Aufwärmsätze) – Basis für die Aufwärm-Rampe.
    var topWorkingWeight: Double { targets.filter { !$0.isWarmup }.map(\.weight).max() ?? 0 }
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

    /// Geschätztes 1RM (Epley: Gewicht × (1 + Wdh/30)) – ein einzelnes
    /// Fortschrittssignal, das steigt, egal ob man Gewicht ODER Wdh erhöht.
    /// Für Körpergewicht (Gewicht 0) zählen die Wiederholungen selbst.
    var estimatedOneRepMax: Double {
        guard reps > 0 else { return 0 }
        if weight == 0 { return Double(reps) }
        return weight * (1 + Double(reps) / 30)
    }
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

    /// Bestes geschätztes 1RM über die Arbeitssätze – Fortschrittssignal je Einheit.
    var bestE1RM: Double {
        sets.filter { !$0.isWarmup }.map(\.estimatedOneRepMax).max() ?? 0
    }

    /// Der Arbeitssatz, der das Fortschrittssignal liefert (höchstes e1RM bzw.
    /// meiste Wiederholungen bei Körpergewicht). nil ohne Arbeitssätze.
    var bestWorkingSet: LoggedSet? {
        sets.filter { !$0.isWarmup }
            .max { $0.estimatedOneRepMax < $1.estimatedOneRepMax }
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
    var e1RM: Double { logged.bestE1RM }
}

// MARK: - „Warum?“-Vergleich (Erklärung hinter der Status-Pille)

/// Kennzahlen einer geloggten Einheit für den „Warum bin ich stärker?“-Vergleich.
struct SessionMetrics {
    let date: Date
    let best: LoggedSet?    // Satz mit dem höchsten Fortschrittssignal
    let e1RM: Double
    let topWeight: Double
    let totalReps: Int
    let volume: Double
    let setCount: Int
}

/// Vergleicht die letzten beiden Einheiten einer Übung Metrik für Metrik und
/// benennt in einem Satz, WARUM der Tracker „stärker“ sagt: mehr Gewicht,
/// mehr Wiederholungen oder die Kombination (bewertet über das e1RM des
/// besten Arbeitssatzes).
struct ProgressComparison {
    let prev: SessionMetrics
    let last: SessionMetrics

    /// Delta des Fortschrittssignals (e1RM bzw. Wdh bei Körpergewicht).
    var signalDelta: Double { last.e1RM - prev.e1RM }

    /// Beide Einheiten ohne Zusatzgewicht → Wiederholungen sind der Maßstab.
    var isBodyweight: Bool { prev.best?.weight == 0 && last.best?.weight == 0 }

    var headline: String {
        guard let a = prev.best, let b = last.best else {
            return "Zu wenige Arbeitssätze für einen direkten Vergleich."
        }
        let d = signalDelta
        if d > 0.01 {
            if isBodyweight {
                return "Du bist stärker, weil du mehr Wiederholungen geschafft hast: \(a.reps) → \(b.reps)."
            }
            if b.weight > a.weight && b.reps > a.reps {
                return "Du bist stärker, weil du mehr Gewicht (\(Fmt.weight(a.weight)) → \(Fmt.weight(b.weight))) UND mehr Wiederholungen (\(a.reps) → \(b.reps)) geschafft hast."
            }
            if b.weight > a.weight && b.reps >= a.reps {
                return "Du bist stärker, weil du mehr Gewicht bewegt hast: \(Fmt.weight(a.weight)) → \(Fmt.weight(b.weight)) bei \(b.reps) Wiederholungen."
            }
            if b.weight == a.weight && b.reps > a.reps {
                return "Du bist stärker, weil du bei \(Fmt.weight(b.weight)) mehr Wiederholungen geschafft hast: \(a.reps) → \(b.reps)."
            }
            if b.weight > a.weight {
                return "Du bist stärker: mehr Gewicht (\(Fmt.weight(a.weight)) → \(Fmt.weight(b.weight))) trotz weniger Wiederholungen (\(a.reps) → \(b.reps)) – unterm Strich +\(Fmt.number(d)) kg e1RM."
            }
            return "Du bist stärker: weniger Gewicht, aber deutlich mehr Wiederholungen (\(a.reps) → \(b.reps)) – unterm Strich +\(Fmt.number(d)) kg e1RM."
        }
        if d < -0.01 {
            let delta = isBodyweight ? "\(a.reps) → \(b.reps) Wdh" : "−\(Fmt.number(abs(d))) kg e1RM"
            return "Dein bester Satz war etwas schwächer als zuletzt (\(delta))."
        }
        return "Dein bester Satz war genauso stark wie beim letzten Mal."
    }
}

// MARK: - Steigerungs-Status (Tracker)

/// Bewertung, ob bei einer Übung Progressive Overload stattfindet.
/// Die App *prüft* nur und schlägt vor – sie erhöht das Gewicht nie selbst.
enum ProgressionStatus: Equatable {
    case noData                              // noch nicht trainiert
    case progressing(delta: Double)          // e1RM gegenüber letzter Einheit gestiegen
    case maintaining                         // gehalten, kein klarer Fortschritt
    case readyToIncrease(suggested: Double)  // Ziel-Wdh zweimal erreicht → Gewicht erhöhen
    case stalled(sessions: Int)              // ≥3 Einheiten ohne neuen Bestwert
    case deloadSuggested(sessions: Int)      // länger festgefahren → Deload

    /// Kurzbezeichnung für die Status-Pille.
    var label: String {
        switch self {
        case .noData:          return "Noch keine Daten"
        case .progressing:     return "Fortschritt"
        case .maintaining:     return "Gehalten"
        case .readyToIncrease: return "Bereit für mehr"
        case .stalled:         return "Stagniert"
        case .deloadSuggested: return "Deload sinnvoll"
        }
    }

    /// Ausführliche, motivierende Erklärung mit Handlungsempfehlung.
    var detail: String {
        switch self {
        case .noData:
            return "Sobald du diese Übung trainierst, prüft die App, ob du dich steigerst."
        case .progressing(let delta):
            return delta > 0.01
                ? "Stärker als zuletzt (+\(Fmt.weight(delta)) e1RM). Weiter so 💪"
                : "Basis erfasst – ab jetzt zählt jede Steigerung."
        case .maintaining:
            return "Gehalten – kein klarer Fortschritt. Versuch nächstes Mal +1 Wiederholung."
        case .readyToIncrease(let suggested):
            return "Ziel-Wiederholungen zweimal erreicht. Zeit für mehr Gewicht: \(Fmt.weight(suggested))."
        case .stalled(let n):
            return "Seit \(n) Einheiten kein neuer Bestwert. Variiere Wdh/Tempo oder leg einen Deload ein."
        case .deloadSuggested(let n):
            return "Seit \(n) Einheiten festgefahren. Plane eine leichtere Woche (~50 % Volumen) und greif dann frisch an."
        }
    }

    /// Sortier-Priorität für die Verbesserungs-Liste (kleiner = mehr Aufmerksamkeit).
    var sortPriority: Int {
        switch self {
        case .deloadSuggested: return 0
        case .stalled:         return 1
        case .readyToIncrease: return 2
        case .maintaining:     return 3
        case .progressing:     return 4
        case .noData:          return 5
        }
    }
}

// MARK: - Aufwärmsätze (Rampe zum Arbeitsgewicht)

/// Erzeugt Aufwärmsätze (isWarmup) als aufsteigende Rampe zum Arbeitsgewicht.
/// Forschungsbasiertes Standard-Schema: 40/60/80 % des Arbeitsgewichts mit
/// absteigenden Wiederholungen (8/5/3) – der schwere Satz bahnt, ohne zu
/// ermüden. Körpergewicht (Gewicht 0) → keine prozentualen Aufwärmsätze.
/// `later` = true: Für spätere Übungen derselben Einheit (Muskulatur schon
/// warm) reicht laut Evidenz ein einzelner „Einpendel“-Satz zum Finden der
/// neuen Bewegungsbahn – Standard dann 1× 60 % × 5.
enum WarmUp {
    static let defaultScheme: [Double] = [0.4, 0.6, 0.8]
    static let defaultReps: [Int] = [8, 5, 3]
    static let laterScheme: [Double] = [0.6]
    static let laterReps: [Int] = [5]

    /// Rundet auf die nächste Schrittweite (Standard 2,5 kg – gängige Hantelstufe).
    static func roundToStep(_ value: Double, step: Double = 2.5) -> Double {
        guard step > 0 else { return value }
        return (value / step).rounded() * step
    }

    /// Aufwärm-Vorgaben (SetTarget) für den Workout-Editor.
    static func targets(workingWeight: Double,
                        later: Bool = false,
                        scheme: [Double]? = nil,
                        reps: [Int]? = nil,
                        step: Double = 2.5) -> [SetTarget] {
        guard workingWeight > 0 else { return [] }
        let s = scheme ?? (later ? laterScheme : defaultScheme)
        let r = reps ?? (later ? laterReps : defaultReps)
        return s.enumerated().map { (i, pct) in
            SetTarget(reps: r[min(i, r.count - 1)],
                      weight: roundToStep(workingWeight * pct, step: step),
                      isWarmup: true)
        }
    }

    /// Aufwärm-Sätze (LoggedSet) für eine laufende Einheit.
    static func loggedSets(workingWeight: Double,
                           later: Bool = false,
                           scheme: [Double]? = nil,
                           reps: [Int]? = nil,
                           step: Double = 2.5) -> [LoggedSet] {
        targets(workingWeight: workingWeight, later: later, scheme: scheme, reps: reps, step: step)
            .map { LoggedSet(reps: $0.reps, weight: $0.weight, isWarmup: true, completed: false) }
    }
}
