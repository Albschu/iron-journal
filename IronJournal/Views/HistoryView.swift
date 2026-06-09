import SwiftUI

struct HistoryView: View {
    @EnvironmentObject var store: AppStore

    private var sorted: [Session] {
        store.sessions.sorted { $0.date > $1.date }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(sorted) { session in
                    NavigationLink {
                        SessionDetailView(session: session)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(session.routineName).font(.headline)
                                Spacer()
                                Text(Fmt.date(session.date))
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            Text("\(session.completedSetCount) Sätze · Volumen \(Int(session.totalVolume)) kg")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                }
                .onDelete { offsets in
                    offsets.map { sorted[$0] }.forEach(store.deleteSession)
                }
            }
            .navigationTitle("Verlauf")
            .overlay {
                if store.sessions.isEmpty {
                    ContentUnavailableView("Noch kein Training",
                                           systemImage: "clock.arrow.circlepath",
                                           description: Text("Starte ein Workout im Tab „Training“."))
                }
            }
        }
    }
}

struct SessionDetailView: View {
    let session: Session

    var body: some View {
        List {
            ForEach(session.exercises) { exercise in
                Section(exercise.name) {
                    ForEach(exercise.sets) { set in
                        HStack {
                            if set.isWarmup {
                                Text("Aufwärmen").font(.caption).foregroundStyle(.orange)
                            }
                            Image(systemName: set.completed ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(set.completed ? .green : .secondary)
                            Spacer()
                            Text("\(set.reps) × \(Fmt.weight(set.weight))")
                        }
                    }
                }
            }
        }
        .navigationTitle(Fmt.date(session.date))
        .navigationBarTitleDisplayMode(.inline)
    }
}
