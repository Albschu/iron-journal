import SwiftUI

struct ActiveSessionView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State var session: Session

    var body: some View {
        NavigationStack {
            List {
                ForEach($session.exercises) { $exercise in
                    Section {
                        ForEach($exercise.sets) { $set in
                            SetRow(set: $set)
                        }
                        Button {
                            let base = exercise.sets.last(where: { !$0.isWarmup })
                            $exercise.sets.wrappedValue.append(LoggedSet(reps: base?.reps ?? 8,
                                                                         weight: base?.weight ?? 0))
                        } label: {
                            Label("Satz hinzufügen", systemImage: "plus.circle")
                                .font(.subheadline)
                        }

                        Button {
                            // Aufwärm-Rampe aus dem schwersten Arbeitssatz voranstellen.
                            // Spätere Übung derselben Einheit → nur 1 Einpendel-Satz.
                            let later = exercise.id != session.exercises.first?.id
                            let generated = WarmUp.loggedSets(workingWeight: exercise.topWeight, later: later)
                            guard !generated.isEmpty else { return }
                            let working = exercise.sets.filter { !$0.isWarmup }
                            $exercise.sets.wrappedValue = generated + working
                        } label: {
                            Label("Aufwärmen", systemImage: "flame")
                                .font(.subheadline)
                        }
                        .tint(.orange)
                        .disabled(exercise.topWeight <= 0)
                    } header: {
                        ExerciseHeader(exercise: exercise)
                    }
                }
            }
            .navigationTitle(session.routineName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") {
                        store.save(session: session)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .keyboardDoneToolbar()
        }
    }
}

private struct ExerciseHeader: View {
    @EnvironmentObject var store: AppStore
    let exercise: LoggedExercise

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(exercise.name).font(.headline).textCase(nil)
                Spacer()
                if let ex = store.exercise(with: exercise.exerciseId) {
                    let status = store.progressionStatus(for: ex)
                    if status != .noData {
                        TappableStatusPill(status: status, exercise: ex)
                    }
                }
            }
            if let last = store.lastSession(for: exercise.exerciseId) {
                let summary = last.logged.sets
                    .filter { !$0.isWarmup }
                    .map { "\($0.reps)×\(Fmt.weightShort($0.weight))" }
                    .joined(separator: "  ")
                let inc = store.exercise(with: exercise.exerciseId)
                    .map { store.autoIncrement(for: $0) } ?? 0
                HStack(spacing: 8) {
                    Text("Zuletzt: \(summary)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if inc > 0 {
                        Text("↑ automatisch +\(Fmt.weightShort(inc)) kg")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.green)
                    }
                }
                .textCase(nil)
            }
        }
    }
}

private struct SetRow: View {
    @Binding var set: LoggedSet
    @FocusState private var focused: Field?
    private enum Field { case reps, weight }

    var body: some View {
        HStack(spacing: 12) {
            Button {
                set.completed.toggle()
            } label: {
                Image(systemName: set.completed ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(set.completed ? Color.green : Color.secondary)
            }
            .buttonStyle(.plain)

            if set.isWarmup {
                Text("Aufwärmen")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .frame(width: 78, alignment: .leading)
            } else {
                Spacer().frame(width: 78)
            }

            Spacer()

            HStack(spacing: 4) {
                TextField("Wdh", value: $set.reps, format: .number)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 44)
                    .focused($focused, equals: .reps)
                Text("×").foregroundStyle(.secondary)
                TextField("kg", value: $set.weight, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 60)
                    .focused($focused, equals: .weight)
                Text("kg").foregroundStyle(.secondary).font(.subheadline)
            }
            .textFieldStyle(.roundedBorder)
        }
        .opacity(set.completed ? 1 : 0.95)
    }
}
