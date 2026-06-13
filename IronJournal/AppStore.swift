import Foundation
import Combine

/// Zentraler Datenspeicher der App. Hält Routinen (Vorlagen mit Vorgaben) und
/// den Trainingsverlauf, persistiert beides als JSON im Documents-Ordner.
final class AppStore: ObservableObject {
    @Published var routines: [Routine] {
        didSet { save() }
    }
    @Published var sessions: [Session] {
        didSet { save() }
    }

    private let routinesFile = "routines.json"
    private let sessionsFile = "sessions.json"

    init() {
        let loadedRoutines: [Routine]? = Self.load(Self.url(for: "routines.json"))
        let loadedSessions: [Session]? = Self.load(Self.url(for: "sessions.json"))
        self.routines = loadedRoutines ?? AppStore.seedRoutines()
        self.sessions = loadedSessions ?? []
    }

    // MARK: - Verlauf nach Übung

    /// Alle geloggten Vorkommen einer Übung, chronologisch (älteste zuerst).
    func history(for exerciseId: UUID) -> [ExerciseHistoryEntry] {
        sessions
            .sorted { $0.date < $1.date }
            .compactMap { session in
                session.exercises.first(where: { $0.exerciseId == exerciseId })
                    .map { ExerciseHistoryEntry(id: session.id, date: session.date, logged: $0) }
            }
    }

    func lastSession(for exerciseId: UUID) -> ExerciseHistoryEntry? {
        history(for: exerciseId).last
    }

    /// Findet eine Übungs-Vorlage anhand ihrer ID über alle Routinen.
    func exercise(with id: UUID) -> Exercise? {
        routines.flatMap(\.exercises).first { $0.id == id }
    }

    // MARK: - Eine Einheit starten

    /// Erzeugt eine neue Session aus einer Routine. Die Sätze werden mit den
    /// aktuellen (ggf. bereits fortgeschriebenen) Vorgaben vorbefüllt.
    func makeSession(from routine: Routine) -> Session {
        let logged = routine.exercises.map { exercise in
            let sets = exercise.targets.map {
                LoggedSet(reps: $0.reps, weight: $0.weight, isWarmup: $0.isWarmup, completed: false)
            }
            return LoggedExercise(exerciseId: exercise.id, name: exercise.name, sets: sets)
        }
        return Session(routineId: routine.id, routineName: routine.name, exercises: logged)
    }

    func save(session: Session) {
        if let idx = sessions.firstIndex(where: { $0.id == session.id }) {
            sessions[idx] = session
        } else {
            sessions.insert(session, at: 0)
        }
        // Bewusst KEINE automatische Gewichtserhöhung mehr: Die App prüft den
        // Fortschritt (siehe `progressionStatus`) und schlägt vor – erhöhen tut
        // der Nutzer selbst per `applySuggestedIncrease`.
    }

    func deleteSession(_ session: Session) {
        sessions.removeAll { $0.id == session.id }
    }

    // MARK: - Progressive-Overload-Tracker

    /// Wurden in der geloggten Übung alle Arbeitssätze mit Ziel-Wdh UND
    /// mindestens dem Ziel-Gewicht abgehakt?
    private func hitAllTargets(_ logged: LoggedExercise, targets: [SetTarget]) -> Bool {
        let workingTargets = targets.filter { !$0.isWarmup }
        let workingSets = logged.sets.filter { !$0.isWarmup }
        guard !workingTargets.isEmpty, workingSets.count >= workingTargets.count else { return false }
        for (i, target) in workingTargets.enumerated() {
            let set = workingSets[i]
            if !set.completed || set.reps < target.reps || set.weight < target.weight {
                return false
            }
        }
        return true
    }

    /// Index der (frühesten) Einheit mit dem höchsten e1RM. Gleichstände zählen
    /// NICHT als neuer Bestwert – nur ein echtes Übertreffen verschiebt den Index.
    private func bestE1RMIndex(_ values: [Double]) -> Int {
        guard !values.isEmpty else { return 0 }
        var best = 0
        for i in values.indices where values[i] > values[best] { best = i }
        return best
    }

    /// Prüft, ob sich der Nutzer bei einer Übung selbst steigert, und leitet
    /// daraus einen Status mit Handlungsempfehlung ab. Erhöht NICHTS automatisch.
    func progressionStatus(for exercise: Exercise) -> ProgressionStatus {
        let entries = history(for: exercise.id)
        guard let last = entries.last else { return .noData }

        // 1) Bereit für mehr Gewicht? Ziel-Wdh in den letzten zwei Einheiten erreicht.
        if exercise.increment > 0, entries.count >= 2,
           entries.suffix(2).allSatisfy({ hitAllTargets($0.logged, targets: exercise.targets) }) {
            let base = exercise.targets.first(where: { !$0.isWarmup })?.weight ?? last.topWeight
            return .readyToIncrease(suggested: base + exercise.increment)
        }

        // 2) Festgefahren? Wie viele Einheiten ist der letzte Bestwert her?
        let e1rms = entries.map(\.e1RM)
        let sinceBest = (entries.count - 1) - bestE1RMIndex(e1rms)
        if sinceBest >= 5 { return .deloadSuggested(sessions: sinceBest) }
        if sinceBest >= 3 { return .stalled(sessions: sinceBest) }

        // 3) Fortschritt gegenüber der vorletzten Einheit?
        guard entries.count >= 2 else { return .progressing(delta: 0) }
        let delta = last.e1RM - entries[entries.count - 2].e1RM
        return delta > 0.01 ? .progressing(delta: delta) : .maintaining
    }

    /// Übernimmt den vorgeschlagenen Gewichtssprung (Arbeitssätze + Schrittweite).
    /// Wird ausschließlich auf ausdrückliche Nutzeraktion aufgerufen.
    func applySuggestedIncrease(routineId: UUID, exerciseId: UUID) {
        guard let rIdx = routines.firstIndex(where: { $0.id == routineId }),
              let eIdx = routines[rIdx].exercises.firstIndex(where: { $0.id == exerciseId })
        else { return }
        let inc = routines[rIdx].exercises[eIdx].increment
        guard inc > 0 else { return }
        routines[rIdx].exercises[eIdx].targets = routines[rIdx].exercises[eIdx].targets.map { target in
            var t = target
            if !t.isWarmup { t.weight += inc }
            return t
        }
    }

    /// Setzt das Gewicht aller Arbeitssätze einer Übung manuell.
    func setTargetWeight(_ weight: Double, routineId: UUID, exerciseId: UUID) {
        guard let rIdx = routines.firstIndex(where: { $0.id == routineId }),
              let eIdx = routines[rIdx].exercises.firstIndex(where: { $0.id == exerciseId })
        else { return }
        routines[rIdx].exercises[eIdx].targets = routines[rIdx].exercises[eIdx].targets.map { target in
            var t = target
            if !t.isWarmup { t.weight = weight }
            return t
        }
    }

    // MARK: - Persistenz

    private func save() {
        Self.write(routines, to: Self.url(for: routinesFile))
        Self.write(sessions, to: Self.url(for: sessionsFile))
    }

    private static func url(for file: String) -> URL {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent(file)
    }

    private static func load<T: Decodable>(_ url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private static func write<T: Encodable>(_ value: T, to url: URL) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
