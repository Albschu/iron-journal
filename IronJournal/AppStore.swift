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
        // Progressive Overload: Vorgaben nach einer erfolgreichen Einheit erhöhen.
        applyProgression(from: session)
    }

    func deleteSession(_ session: Session) {
        sessions.removeAll { $0.id == session.id }
    }

    // MARK: - Progressive Overload

    /// Wurden in der geloggten Übung alle Arbeitssätze mit Ziel-Wdh UND
    /// mindestens dem Ziel-Gewicht abgehakt?
    private func metAllTargets(_ logged: LoggedExercise, targets: [SetTarget]) -> Bool {
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

    /// Schreibt nach einer erfolgreichen Einheit die Vorgaben der Routine fort
    /// (Arbeitssätze + Schrittweite). Aufwärmsätze bleiben unverändert.
    private func applyProgression(from session: Session) {
        guard let routineId = session.routineId,
              let rIdx = routines.firstIndex(where: { $0.id == routineId }) else { return }
        for logged in session.exercises {
            guard let eIdx = routines[rIdx].exercises.firstIndex(where: { $0.id == logged.exerciseId })
            else { continue }
            let exercise = routines[rIdx].exercises[eIdx]
            guard exercise.increment > 0, metAllTargets(logged, targets: exercise.targets) else { continue }
            routines[rIdx].exercises[eIdx].targets = exercise.targets.map { target in
                var t = target
                if !t.isWarmup { t.weight += exercise.increment }
                return t
            }
        }
    }

    /// True, wenn die Vorgabe seit der letzten Einheit erhöht wurde – also beim
    /// nächsten Mal mehr Gewicht ansteht. Treibt den Steigerungs-Indikator.
    func hasPendingIncrease(_ exercise: Exercise) -> Bool {
        guard let last = lastSession(for: exercise.id) else { return false }
        return exercise.topTargetWeight > last.topWeight
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
