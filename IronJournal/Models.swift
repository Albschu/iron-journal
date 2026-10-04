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

// MARK: - Erhöhungsvorschlag (wie viel mehr Gewicht?)
//
// Datenbasis (siehe README „Steigerungsvorschlag“):
// • ACSM Position Stand 2009 (Med Sci Sports Exerc 41:687–708, Evidenz B):
//   +2–10 % Last, wenn die Ziel-Wdh in zwei Einheiten in Folge geschafft (bzw.
//   1–2 Wdh übertroffen) werden – kleiner Prozentsatz für kleine, größerer für
//   große Muskelgruppen.
// • NSCA (Essentials of S&C, „2-for-2“): Oberkörper ≈ +1–4 kg, Unterkörper
//   ≈ +2–7 kg je nach Trainingsstand.
// • Epley (1RM = w·(1 + Wdh/30)): Jede Wdh über dem Ziel ≈ +3 % Reserve – so
//   skaliert der Vorschlag mit deiner tatsächlichen Leistung.
// • Plotkin et al. 2022 (PeerJ 10:e14142): Wdh-Steigerung bringt praktisch
//   gleich viel wie Last-Steigerung → ist der kleinste Gewichtssprung zu groß,
//   lieber erst Wdh steigern (Doppelprogression).

/// Übungsklasse mit Steigerungsspanne (Anteil vom Arbeitsgewicht, ACSM) und
/// absoluter Obergrenze je Sprung (`maxKg`, an NSCA angelehnt).
enum LiftClass: String {
    case lower, upper, small

    var label: String {
        switch self {
        case .lower: return "Unterkörper-Grundübung"
        case .upper: return "Oberkörper-Grundübung"
        case .small: return "Isolationsübung"
        }
    }
    var lo: Double { switch self { case .lower: return 0.05; case .upper: return 0.025; case .small: return 0.02 } }
    var hi: Double { switch self { case .lower: return 0.10; case .upper, .small: return 0.05 } }
    var maxKg: Double { switch self { case .lower: return 7.5; case .upper: return 5; case .small: return 2.5 } }

    private static let smallKeys = ["curl", "seitheb", "frontheb", "lateral", "raise", "fly", "flys", "butterfly",
        "extension", "strecker", "beuger", "trizeps", "bizeps", "triceps", "biceps", "waden", "calf",
        "kickback", "face pull", "facepull", "shrug", "abduktor", "adduktor", "abduct", "adduct",
        "pushdown", "crunch", "reverse", "unterarm", "wrist"]
    private static let lowerKeys = ["kniebeug", "squat", "kreuzheb", "deadlift", "beinpresse", "leg press",
        "hip thrust", "hipthrust", "ausfallschritt", "lunge", "rumän", "rdl", "good morning",
        "hackenschmidt", "glute bridge", "step up", "step-up"]

    /// Ordnet eine Übung grob über ihren Namen ein (Standard: Oberkörper-Grundübung).
    init(name: String) {
        let n = name.lowercased()
        if Self.smallKeys.contains(where: { n.contains($0) }) { self = .small }
        else if Self.lowerKeys.contains(where: { n.contains($0) }) { self = .lower }
        else { self = .upper }
    }
}

/// Konkreter Erhöhungsvorschlag ausgehend von der letzten Einheit.
struct IncreaseSuggestion: Equatable {
    let from: Double
    let to: Double
    let delta: Double
    let pct: Double            // tatsächlicher Sprung relativ zum Arbeitsgewicht
    let liftClass: LiftClass
    let surplus: Int           // Wdh, die der schwächste Satz über dem Ziel lag
    let dataPct: Double        // Reserve laut Epley aus diesem Überschuss
    /// Schon der kleinste Schritt liegt über der empfohlenen Spanne.
    var bigStep: Bool { pct > liftClass.hi + 1e-9 }

    /// Wie viele Wdh lag der schwächste Arbeitssatz über seinem Ziel? (≥ 0)
    static func repSurplus(_ logged: LoggedExercise, targets: [SetTarget]) -> Int {
        let goals = targets.filter { !$0.isWarmup }
        let sets = logged.sets.filter { !$0.isWarmup && $0.reps > 0 }
        guard !goals.isEmpty, !sets.isEmpty else { return 0 }
        let diffs = sets.enumerated().map { i, s in s.reps - goals[min(i, goals.count - 1)].reps }
        return max(0, diffs.min() ?? 0)
    }

    /// Laststeigerung laut Epley, damit die Ziel-Wdh bei gleicher Reserve bleiben.
    static func epleyLoadPct(targetReps: Int, surplus: Int) -> Double {
        (1 + Double(targetReps + surplus) / 30) / (1 + Double(targetReps) / 30) - 1
    }

    /// nil bei Körpergewicht bzw. ohne Schrittweite (→ Wdh steigern statt Gewicht).
    init?(exercise: Exercise, last: LoggedExercise) {
        let step = exercise.increment
        let from = last.topWeight
        guard step > 0, from > 0 else { return nil }
        let goals = exercise.targets.filter { !$0.isWarmup }
        let targetReps = goals.map(\.reps).max() ?? 8
        let cls = LiftClass(name: exercise.name)
        let surplus = Self.repSurplus(last, targets: exercise.targets)
        let dataPct = Self.epleyLoadPct(targetReps: targetReps, surplus: surplus)
        let pct = min(cls.hi, max(cls.lo, dataPct))
        // Auf die Schrittweite runden, mindestens ein Schritt, aber nicht über
        // die Obergrenzen (% und kg) hinaus, wenn das mehr als ein Schritt wäre.
        let cap = min(from * cls.hi, cls.maxKg) + 1e-9
        var steps = max(1, Int((from * pct / step).rounded()))
        while steps > 1 && Double(steps) * step > cap { steps -= 1 }
        let delta = Double(steps) * step
        self.from = from
        self.to = from + delta
        self.delta = delta
        self.pct = delta / from
        self.liftClass = cls
        self.surplus = surplus
        self.dataPct = dataPct
    }
}

/// Vorschlag plus Bereitschaft: `ready` = Ziel in 2 Einheiten in Folge erreicht
/// (ACSM/NSCA „2-for-2“), `streak` = wie viele davon (0–2).
/// `suggestion` ist nil bei Körpergewicht (dann Wdh steigern).
struct IncreasePlan: Equatable {
    let suggestion: IncreaseSuggestion?
    let streak: Int
    var ready: Bool { streak >= 2 }
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

// MARK: - Statistik je Workout-Art (Push, Pull, Beine …)

extension Session {
    /// Kraft-Index einer Einheit: Summe der besten e1RM je Übung. Anders als das
    /// Volumen wächst er nicht durch zusätzliche Sätze, sondern nur durch
    /// stärkere Sätze – ein Maß dafür, wie stark die Einheit war, nicht wie lang.
    var strengthIndex: Double { exercises.reduce(0) { $0 + $1.bestE1RM } }
}

/// Auswertbare Metrik je Einheit für die Workout-Statistik.
enum WorkoutMetric: String, CaseIterable, Identifiable {
    case volume, strength, sets

    var id: String { rawValue }

    var label: String {
        switch self {
        case .volume:   return "Volumen"
        case .strength: return "Kraft-Index"
        case .sets:     return "Sätze"
        }
    }

    /// Erklärung, was die Metrik misst (Fußnote unter den Kacheln).
    var explanation: String {
        switch self {
        case .volume:
            return "Volumen = Σ Wiederholungen × Gewicht aller Arbeitssätze der Einheit. Wächst auch durch mehr Sätze."
        case .strength:
            return "Kraft-Index = Summe der besten e1RM je Übung. Steigt nur durch stärkere Sätze, nicht durch mehr Sätze."
        case .sets:
            return "Sätze = abgehakte Arbeitssätze der Einheit (ohne Aufwärmsätze)."
        }
    }

    func value(of session: Session) -> Double {
        switch self {
        case .volume:   return session.totalVolume
        case .strength: return session.strengthIndex
        case .sets:     return Double(session.completedSetCount)
        }
    }

    /// Formatierter Wert: Volumen ab 1 t kompakt, Kraft-Index in kg, Sätze als Zahl.
    func format(_ value: Double) -> String {
        switch self {
        case .volume:   return Fmt.volume(value)
        case .strength: return Fmt.number(value.rounded()) + " kg"
        case .sets:     return Fmt.number(value.rounded())
        }
    }
}

/// Kennzahlen einer Workout-Art über einen Zeitraum.
struct WorkoutStat: Identifiable {
    let id: String              // routineId als String, sonst der Name
    let routineId: UUID?
    let name: String
    let points: [(date: Date, value: Double)]

    var count: Int { points.count }
    var average: Double { points.isEmpty ? 0 : points.reduce(0) { $0 + $1.value } / Double(count) }
    var last: Double { points.last?.value ?? 0 }
    var lastDate: Date? { points.last?.date }
    var best: Double { points.map(\.value).max() ?? 0 }

    /// Trend als Änderung pro Woche (lineare Regression). nil, wenn es weniger
    /// als 3 Einheiten sind oder die Spanne unter einer Woche liegt – dann wäre
    /// eine Trendaussage nicht belastbar.
    var perWeek: Double? {
        guard count >= 3, let first = points.first, let last = points.last else { return nil }
        let span = last.date.timeIntervalSince(first.date)
        guard span >= 7 * 86400 else { return nil }
        let xs = points.map { $0.date.timeIntervalSince(first.date) }
        let ys = points.map(\.value)
        let n = Double(count)
        let sx = xs.reduce(0, +), sy = ys.reduce(0, +)
        let sxx = zip(xs, xs).reduce(0) { $0 + $1.0 * $1.1 }
        let sxy = zip(xs, ys).reduce(0) { $0 + $1.0 * $1.1 }
        let denom = n * sxx - sx * sx
        guard denom != 0 else { return nil }
        return ((n * sxy - sx * sy) / denom) * 7 * 86400
    }

    /// Relativer Trend in Prozent pro Woche (bezogen auf den Mittelwert).
    var percentPerWeek: Double? {
        guard let pw = perWeek, average > 0 else { return nil }
        return pw / average * 100
    }
}

/// Gruppiert Einheiten nach Workout-Art und liefert je Art die Kennzahlen der
/// gewählten Metrik, meist-trainiertes Workout zuerst. Gruppiert über routineId,
/// damit umbenannte Routinen ihren Verlauf behalten; der Name der jüngsten
/// Einheit gewinnt, sodass auch gelöschte Routinen im Verlauf sichtbar bleiben.
func workoutStats(_ sessions: [Session],
                  metric: WorkoutMetric = .volume,
                  since: Date? = nil) -> [WorkoutStat] {
    var order: [String] = []
    var byKey: [String: (routineId: UUID?, name: String, pts: [(date: Date, value: Double)])] = [:]
    for s in sessions.sorted(by: { $0.date < $1.date }) {
        if let since, s.date < since { continue }
        let key = s.routineId?.uuidString ?? "name:\(s.routineName)"
        if byKey[key] == nil {
            byKey[key] = (s.routineId, s.routineName, [])
            order.append(key)
        }
        byKey[key]!.name = s.routineName
        byKey[key]!.pts.append((s.date, metric.value(of: s)))
    }
    return order.compactMap { key -> WorkoutStat? in
        guard let g = byKey[key], !g.pts.isEmpty else { return nil }
        return WorkoutStat(id: key, routineId: g.routineId, name: g.name, points: g.pts)
    }
    .sorted { $0.count > $1.count }
}
