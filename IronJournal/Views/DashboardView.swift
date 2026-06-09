import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        NavigationStack {
            List {
                if store.sessions.isEmpty {
                    Section {
                        Text("Sobald du trainierst, erscheinen hier deine Fortschritte und Steigerungs-Vorschläge.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                ForEach(store.routines) { routine in
                    Section(routine.name) {
                        ForEach(routine.exercises) { exercise in
                            NavigationLink {
                                ExerciseProgressView(routine: routine, exercise: exercise)
                            } label: {
                                ExerciseDashboardRow(exercise: exercise)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Dashboard")
        }
    }
}

private struct ExerciseDashboardRow: View {
    @EnvironmentObject var store: AppStore
    let exercise: Exercise

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(exercise.name).font(.headline)
                if let last = store.lastSession(for: exercise.id) {
                    Text("Top \(Fmt.weight(last.topWeight)) · \(Fmt.relativeDate(last.date))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Vorgabe \(Fmt.weight(exercise.topTargetWeight))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            if store.hasPendingIncrease(exercise) {
                Label("Ziel \(Fmt.weight(exercise.topTargetWeight))", systemImage: "arrow.up.circle.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.green)
                    .labelStyle(.titleAndIcon)
            }
        }
        .padding(.vertical, 2)
    }
}
