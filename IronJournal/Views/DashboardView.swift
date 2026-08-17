import SwiftUI
import Charts

/// Tab "Dashboard": Auswertung primär je Workout-Art (Push, Pull, Beine …).
/// Die Übungen bleiben darunter als Einstieg in den Detail-Fortschritt erhalten.
struct DashboardView: View {
    @EnvironmentObject var store: AppStore
    @AppStorage("dash.metric") private var metricRaw: String = WorkoutMetric.volume.rawValue
    @AppStorage("dash.rangeDays") private var rangeDays: Int = 84

    private static let ranges: [(label: String, days: Int)] =
        [("4 W", 28), ("12 W", 84), ("1 J", 365), ("Alle", 0)]

    private var metric: WorkoutMetric { WorkoutMetric(rawValue: metricRaw) ?? .volume }

    /// Startdatum des gewählten Zeitraums; nil = alles.
    private var since: Date? {
        guard rangeDays > 0 else { return nil }
        return Calendar.current.startOfDay(for: Date())
            .addingTimeInterval(-Double(rangeDays - 1) * 86400)
    }

    private var stats: [WorkoutStat] {
        workoutStats(store.sessions, metric: metric, since: since)
    }

    var body: some View {
        NavigationStack {
            List {
                if store.sessions.isEmpty {
                    Section {
                        Text("Sobald du trainierst, erscheinen hier deine Fortschritte und Steigerungs-Vorschläge.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    controlsSection
                    content(for: stats)
                }
            }
            .navigationTitle("Dashboard")
        }
    }

    /// Zeitraum + Metrik – steuert alle Kennzahlen darunter.
    private var controlsSection: some View {
        Section {
            Picker("Zeitraum", selection: $rangeDays) {
                ForEach(Self.ranges, id: \.days) { Text($0.label).tag($0.days) }
            }
            .pickerStyle(.segmented)

            Picker("Metrik", selection: $metricRaw) {
                ForEach(WorkoutMetric.allCases) { Text($0.label).tag($0.rawValue) }
            }
            .pickerStyle(.segmented)
        }
    }

    @ViewBuilder
    private func content(for list: [WorkoutStat]) -> some View {
        if list.isEmpty {
            Section {
                Text("Im gewählten Zeitraum gibt es keine Einheiten. Wähle oben einen längeren Zeitraum.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        } else {
            Section {
                WorkoutMetricChart(stats: list, metric: metric)
                    .frame(height: 190)
                    .padding(.vertical, 4)
            } header: {
                Text("\(metric.label) je Einheit · nach Workout")
            } footer: {
                Text(metric.explanation)
            }

            ForEach(list) { stat in
                workoutSection(stat)
            }

            uncoveredRoutines(coveredBy: list)
        }
    }

    /// Ein Workout: Kennzahlen-Kachel plus die Übungen darunter.
    private func workoutSection(_ stat: WorkoutStat) -> some View {
        Section {
            WorkoutStatCard(stat: stat, metric: metric)
            exerciseRows(for: stat)
        } header: {
            HStack {
                Text(stat.name)
                Spacer()
                Text("\(stat.count) \(stat.count == 1 ? "Einheit" : "Einheiten")")
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// Workouts ohne Einheit im gewählten Zeitraum bleiben erreichbar.
    private func uncoveredRoutines(coveredBy list: [WorkoutStat]) -> some View {
        let covered = Set(list.compactMap(\.routineId))
        return ForEach(store.routines.filter { !covered.contains($0.id) }) { routine in
            Section {
                ForEach(routine.exercises) { exercise in
                    NavigationLink {
                        ExerciseProgressView(routine: routine, exercise: exercise)
                    } label: {
                        ExerciseDashboardRow(exercise: exercise)
                    }
                }
            } header: {
                Text(routine.name)
            } footer: {
                Text("Keine Einheit im gewählten Zeitraum.")
            }
        }
    }

    /// Übungen der zugehörigen Routine – Einstieg in den Detail-Fortschritt.
    @ViewBuilder
    private func exerciseRows(for stat: WorkoutStat) -> some View {
        if let rid = stat.routineId, let routine = store.routines.first(where: { $0.id == rid }) {
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

/// Verlauf der gewählten Metrik, eine Linie je Workout-Art.
private struct WorkoutMetricChart: View {
    let stats: [WorkoutStat]
    let metric: WorkoutMetric

    private struct Point: Identifiable {
        let workout: String
        let date: Date
        let value: Double
        // Stabile ID über Workout + Datum: ein frisches UUID() je Neuzeichnung
        // würde SwiftUI die Punkte als neue Daten ansehen.
        var id: String { "\(workout)@\(date.timeIntervalSince1970)" }
    }

    private var points: [Point] {
        stats.flatMap { s in s.points.map { Point(workout: s.name, date: $0.date, value: $0.value) } }
    }

    var body: some View {
        Chart(points) { p in
            LineMark(
                x: .value("Datum", p.date),
                y: .value(metric.label, p.value)
            )
            .foregroundStyle(by: .value("Workout", p.workout))
            .symbol(by: .value("Workout", p.workout))
            .interpolationMethod(.monotone)
        }
        .chartYAxis {
            AxisMarks { value in
                AxisGridLine()
                AxisValueLabel {
                    if let v = value.as(Double.self) { Text(metric.format(v)) }
                }
            }
        }
        .chartLegend(position: .bottom)
    }
}

/// Kennzahlen-Kachel je Workout-Art: letzte / Ø / beste Einheit plus Trend.
private struct WorkoutStatCard: View {
    let stat: WorkoutStat
    let metric: WorkoutMetric

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                metricColumn("Letzte", stat.last)
                Spacer()
                metricColumn("Ø", stat.average)
                Spacer()
                metricColumn("Beste", stat.best)
            }

            Divider()

            HStack {
                trendLabel
                Spacer()
                if let d = stat.lastDate {
                    Text(Fmt.relativeDate(d))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func metricColumn(_ label: String, _ value: Double) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
            Text(metric.format(value))
                .font(.headline)
                .monospacedDigit()
        }
    }

    @ViewBuilder
    private var trendLabel: some View {
        if let pct = stat.percentPerWeek {
            if abs(pct) < 1 {
                Text("≈ stabil").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            } else {
                Label("\(pct > 0 ? "+" : "−")\(Fmt.number(abs(pct))) % / Woche",
                      systemImage: pct > 0 ? "arrow.up.right" : "arrow.down.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(pct > 0 ? Color.green : Color.orange)
            }
        } else {
            Text("Trend: zu wenige Einheiten")
                .font(.caption)
                .foregroundStyle(.secondary)
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
            TappableStatusPill(status: store.progressionStatus(for: exercise), exercise: exercise)
        }
        .padding(.vertical, 2)
    }
}
