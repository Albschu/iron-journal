import SwiftUI

struct RoutineEditView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State var routine: Routine
    var isNew: Bool = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Workout") {
                    TextField("Name", text: $routine.name)
                }

                ForEach($routine.exercises) { $exercise in
                    Section {
                        TextField("Übungsname", text: $exercise.name)
                            .font(.headline)

                        ForEach($exercise.targets) { $target in
                            TargetRow(target: $target)
                        }
                        .onDelete { $exercise.targets.wrappedValue.remove(atOffsets: $0) }

                        Button {
                            let last = exercise.targets.last(where: { !$0.isWarmup })
                            $exercise.targets.wrappedValue.append(SetTarget(reps: last?.reps ?? 8,
                                                                            weight: last?.weight ?? 0))
                        } label: {
                            Label("Arbeitssatz", systemImage: "plus")
                        }
                        .font(.subheadline)

                        Button {
                            // Aufwärm-Rampe aus dem Arbeitsgewicht erzeugen; vorhandene
                            // Aufwärmsätze ersetzen (idempotent), Rampe vor die Arbeitssätze.
                            // Spätere Übung derselben Einheit → nur 1 Einpendel-Satz.
                            let later = exercise.id != routine.exercises.first?.id
                            let generated = WarmUp.targets(workingWeight: exercise.topWorkingWeight, later: later)
                            guard !generated.isEmpty else { return }
                            let working = exercise.targets.filter { !$0.isWarmup }
                            $exercise.targets.wrappedValue = generated + working
                        } label: {
                            Label("Aufwärmsätze", systemImage: "flame")
                        }
                        .font(.subheadline)
                        .tint(.orange)
                        .disabled(exercise.topWorkingWeight <= 0)

                        HStack {
                            Text("Steigerung")
                                .foregroundStyle(.secondary)
                            Spacer()
                            TextField("kg", value: $exercise.increment, format: .number)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 60)
                            Text("kg / Stufe").foregroundStyle(.secondary).font(.subheadline)
                        }
                    } header: {
                        Text(exercise.name.isEmpty ? "Übung" : exercise.name)
                    } footer: {
                        Text(exercise.id == routine.exercises.first?.id
                             ? "🔥 Aufwärmsatz zählt nicht zum Fortschritt. „Aufwärmsätze“ erzeugt die volle Rampe (40·60·80 %) für die erste Übung; danach frei anpassbar."
                             : "🔥 Aufwärmsatz zählt nicht zum Fortschritt. „Aufwärmsätze“ erzeugt 1 Einpendel-Satz (60 %) – spätere Übung, Muskulatur schon warm; danach frei anpassbar.")
                    }
                }
                .onDelete { routine.exercises.remove(atOffsets: $0) }

                Section {
                    Button {
                        routine.exercises.append(Exercise(name: "", targets: [SetTarget(reps: 8, weight: 0)]))
                    } label: {
                        Label("Übung hinzufügen", systemImage: "plus.circle")
                    }
                }
            }
            .navigationTitle(isNew ? "Neues Workout" : "Bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .keyboardDoneToolbar()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Sichern") {
                        if let idx = store.routines.firstIndex(where: { $0.id == routine.id }) {
                            store.routines[idx] = routine
                        } else {
                            store.routines.append(routine)
                        }
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }
}

private struct TargetRow: View {
    @Binding var target: SetTarget

    var body: some View {
        HStack(spacing: 8) {
            Toggle(isOn: $target.isWarmup) {
                Image(systemName: "flame")
            }
            .toggleStyle(.button)
            .tint(.orange)

            Spacer()

            TextField("Wdh", value: $target.reps, format: .number)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 44)
                .textFieldStyle(.roundedBorder)
            Text("×").foregroundStyle(.secondary)
            TextField("kg", value: $target.weight, format: .number)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 64)
                .textFieldStyle(.roundedBorder)
            Text("kg").foregroundStyle(.secondary).font(.subheadline)
        }
    }
}
