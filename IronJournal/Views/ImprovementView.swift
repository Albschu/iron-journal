import SwiftUI
import Charts

/// Tab "Steigerung": prüft je Übung, ob du dich selbst steigerst, und sortiert
/// nach Handlungsbedarf (festgefahren zuerst). Die App erhöht nichts automatisch
/// – sie zeigt nur, wo es hakt, und wo du bereit für mehr Gewicht bist.
struct ImprovementView: View {
    @EnvironmentObject var store: AppStore

    private struct Item: Identifiable {
        let routine: Routine
        let exercise: Exercise
        let status: ProgressionStatus
        var id: UUID { exercise.id }
    }

    private var items: [Item] {
        store.routines
            .flatMap { routine in
                routine.exercises.map {
                    Item(routine: routine, exercise: $0, status: store.progressionStatus(for: $0))
                }
            }
            .sorted {
                ($0.status.sortPriority, $0.exercise.name) < ($1.status.sortPriority, $1.exercise.name)
            }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(items) { item in
                    NavigationLink {
                        ExerciseProgressView(routine: item.routine, exercise: item.exercise)
                    } label: {
                        ImprovementRow(item: item)
                    }
                    .swipeActions(edge: .trailing) {
                        if case .readyToIncrease = item.status {
                            Button {
                                store.applySuggestedIncrease(routineId: item.routine.id,
                                                             exerciseId: item.exercise.id)
                            } label: { Label("Erhöhen", systemImage: "arrow.up") }
                            .tint(.green)
                        }
                    }
                }
            }
            .navigationTitle("Steigerung")
            .overlay {
                if store.sessions.isEmpty {
                    ContentUnavailableView("Noch keine Daten",
                                           systemImage: "chart.line.uptrend.xyaxis",
                                           description: Text("Sobald du trainierst, prüft die App hier, ob du dich Einheit für Einheit steigerst."))
                }
            }
        }
    }

    private struct ImprovementRow: View {
        @EnvironmentObject var store: AppStore
        let item: Item

        private var history: [ExerciseHistoryEntry] { store.history(for: item.exercise.id) }

        var body: some View {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(item.exercise.name).font(.headline)
                    Spacer()
                    ProgressionStatusPill(status: item.status)
                }
                Text(item.routine.name)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)

                if history.count >= 2 {
                    Chart(history) { entry in
                        LineMark(x: .value("Datum", entry.date),
                                 y: .value("e1RM", entry.e1RM))
                        .interpolationMethod(.monotone)
                        .foregroundStyle(item.status.tint)
                    }
                    .chartXAxis(.hidden)
                    .chartYAxis(.hidden)
                    .frame(height: 36)
                }

                Text(item.status.detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
    }
}
