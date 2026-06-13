import SwiftUI
import Charts

struct ExerciseProgressView: View {
    @EnvironmentObject var store: AppStore
    let routine: Routine
    let exercise: Exercise

    @State private var draftWeight: Double = 0
    @State private var showWeightEditor = false

    private var history: [ExerciseHistoryEntry] {
        store.history(for: exercise.id)
    }

    /// Aktuelle Vorgabe der Übung (frisch aus dem Store, falls geändert).
    private var current: Exercise {
        store.routines.first(where: { $0.id == routine.id })?
            .exercises.first(where: { $0.id == exercise.id }) ?? exercise
    }

    private var status: ProgressionStatus { store.progressionStatus(for: current) }

    var body: some View {
        List {
            // Aktuelle Vorgabe + Progressive Overload
            Section("Aktuelle Vorgabe") {
                ForEach(current.targets) { target in
                    HStack {
                        if target.isWarmup {
                            Text("Aufwärmen").font(.caption).foregroundStyle(.orange)
                        }
                        Spacer()
                        Text("\(target.reps) × \(Fmt.weight(target.weight))")
                            .monospacedDigit()
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    ProgressionStatusPill(status: status)
                    Text(status.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 2)

                if case .readyToIncrease(let suggested) = status {
                    Button {
                        store.applySuggestedIncrease(routineId: routine.id, exerciseId: exercise.id)
                    } label: {
                        Label("Auf \(Fmt.weight(suggested)) erhöhen", systemImage: "arrow.up.circle.fill")
                            .fontWeight(.semibold)
                    }
                    .foregroundStyle(.green)
                }

                Button {
                    draftWeight = current.targets.first(where: { !$0.isWarmup })?.weight ?? 0
                    showWeightEditor = true
                } label: {
                    Label("Arbeitsgewicht anpassen", systemImage: "slider.horizontal.3")
                }
            }

            // Chart: Top-Gewicht über Zeit
            if history.count >= 2 {
                Section("Top-Gewicht") {
                    Chart(history) { entry in
                        LineMark(
                            x: .value("Datum", entry.date),
                            y: .value("kg", entry.topWeight)
                        )
                        .symbol(.circle)
                        .interpolationMethod(.monotone)
                    }
                    .frame(height: 180)
                }

                Section("Volumen (Wdh × kg)") {
                    Chart(history) { entry in
                        BarMark(
                            x: .value("Datum", entry.date),
                            y: .value("Volumen", entry.volume)
                        )
                    }
                    .frame(height: 160)
                }
            }

            // Tabellarischer Verlauf
            if !history.isEmpty {
                Section("Verlauf") {
                    ForEach(history.reversed()) { entry in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Fmt.date(entry.date)).font(.subheadline.weight(.semibold))
                            Text(entry.logged.sets.filter { !$0.isWarmup }
                                .map { "\($0.reps)×\(Fmt.weightShort($0.weight))" }
                                .joined(separator: "  "))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle(exercise.name)
        .navigationBarTitleDisplayMode(.inline)
        .alert("Arbeitsgewicht", isPresented: $showWeightEditor) {
            TextField("kg", value: $draftWeight, format: .number)
                .keyboardType(.decimalPad)
            Button("Setzen") {
                store.setTargetWeight(draftWeight, routineId: routine.id, exerciseId: exercise.id)
            }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Setzt das Gewicht aller Arbeitssätze dieser Übung.")
        }
    }
}
