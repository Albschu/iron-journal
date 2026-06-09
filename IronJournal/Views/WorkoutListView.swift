import SwiftUI

struct WorkoutListView: View {
    @EnvironmentObject var store: AppStore
    @State private var activeSession: Session?
    @State private var editingRoutine: Routine?
    @State private var showingNewRoutine = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.routines) { routine in
                    Button {
                        activeSession = store.makeSession(from: routine)
                    } label: {
                        RoutineRow(routine: routine)
                    }
                    .swipeActions(edge: .trailing) {
                        Button {
                            editingRoutine = routine
                        } label: { Label("Bearbeiten", systemImage: "slider.horizontal.3") }
                        .tint(.indigo)
                    }
                }
                .onDelete { store.routines.remove(atOffsets: $0) }
            }
            .navigationTitle("Training")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingNewRoutine = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .overlay {
                if store.routines.isEmpty {
                    ContentUnavailableView("Keine Workouts",
                                           systemImage: "dumbbell",
                                           description: Text("Lege oben rechts ein neues Workout an."))
                }
            }
            .fullScreenCover(item: $activeSession) { session in
                ActiveSessionView(session: session)
            }
            .sheet(item: $editingRoutine) { routine in
                RoutineEditView(routine: routine)
            }
            .sheet(isPresented: $showingNewRoutine) {
                RoutineEditView(routine: Routine(name: "Neues Workout"), isNew: true)
            }
        }
    }
}

private struct RoutineRow: View {
    @EnvironmentObject var store: AppStore
    let routine: Routine

    private var lastTrained: Date? {
        store.sessions.filter { $0.routineId == routine.id }.map(\.date).max()
    }

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(routine.name)
                    .font(.headline)
                Text("\(routine.exercises.count) Übungen")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let last = lastTrained {
                    Text("Zuletzt \(Fmt.relativeDate(last))")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer()
            Image(systemName: "play.circle.fill")
                .font(.title2)
                .foregroundStyle(.tint)
        }
        .padding(.vertical, 4)
    }
}
