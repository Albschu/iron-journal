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
        }
    }
}

private struct ExerciseHeader: View {
    @EnvironmentObject var store: AppStore
    let exercise: LoggedExercise

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(exercise.name).font(.headline).textCase(nil)
            if let last = store.lastSession(for: exercise.exerciseId) {
                let summary = last.logged.sets
                    .filter { !$0.isWarmup }
                    .map { "\($0.reps)×\(Fmt.weightShort($0.weight))" }
                    .joined(separator: "  ")
                Text("Zuletzt: \(summary)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
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
