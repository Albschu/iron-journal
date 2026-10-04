import SwiftUI

/// „Warum?“-Erklärung hinter der Status-Pille: benennt in einem Satz, warum
/// der Tracker „stärker“ (oder „gehalten“ etc.) sagt, und vergleicht die
/// letzten zwei Einheiten Metrik für Metrik.
struct WhyStatusView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let exercise: Exercise
    /// Laufende Einheit → Status/Vergleich inkl. der gerade eingetragenen Sätze.
    var live: Session? = nil

    private var status: ProgressionStatus { store.progressionStatus(for: exercise, live: live) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(exercise.name).font(.headline)
                            Spacer()
                            ProgressionStatusPill(status: status)
                        }
                        Text(status.detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                }

                if let plan = store.increasePlan(for: exercise, live: live) {
                    IncreaseSuggestionSection(plan: plan)
                }

                if let cmp = store.progressComparison(for: exercise.id, live: live) {
                    ProgressComparisonSection(comparison: cmp)
                } else {
                    Section {
                        Text("Für den Vergleich braucht es mindestens zwei Einheiten dieser Übung.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Warum „\(status.label)“?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
    }
}

/// Kurze Vorschlagszeile unter einer Übung in der laufenden Einheit (live).
struct IncreaseSuggestionLine: View {
    let plan: IncreasePlan

    var body: some View {
        if let sug = plan.suggestion {
            let amount = "+\(Fmt.weightShort(sug.delta)) kg → \(Fmt.weight(sug.to)) (+\(Fmt.percent(sug.pct)))"
            if plan.ready {
                (Text("💡 Nächstes Mal: ") + Text(amount).bold().foregroundColor(.green)
                    + Text(sug.bigStep ? " · großer Sprung – alternativ erst +1–2 Wdh" : ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("💡 Nächste Erhöhung: \(amount), sobald alle Sätze ihre Ziel-Wdh schaffen (\(plan.streak)/2 Einheiten)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } else if plan.ready {
            Text("💡 Ziel 2× geschafft – steigere die Wiederholungen (+1 je Satz).")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

/// Begründeter Erhöhungsvorschlag (Wann / Spanne / Deine Daten + Quellen) –
/// im „Warum?“-Sheet und in der Übungs-Detailansicht.
struct IncreaseSuggestionSection: View {
    let plan: IncreasePlan

    var body: some View {
        if let sug = plan.suggestion {
            let cls = sug.liftClass
            Section(plan.ready ? "Vorschlag: jetzt Erhöhung" : "Vorschlag: nächste Erhöhung") {
                Text("+\(Fmt.weightShort(sug.delta)) kg → \(Fmt.weight(sug.to)) (+\(Fmt.percent(sug.pct)))")
                    .font(.subheadline.weight(.semibold))
                    .padding(.vertical, 2)
                ReasonRow(label: "Wann", text: plan.ready
                    ? "Ziel in 2 Einheiten in Folge erreicht → jetzt erhöhen."
                    : "Erst erhöhen, wenn alle Arbeitssätze in 2 Einheiten in Folge die Ziel-Wdh schaffen (aktuell \(plan.streak)/2).")
                ReasonRow(label: "Spanne",
                          text: "\(cls.label): \(Fmt.percent(cls.lo))–\(Fmt.percent(cls.hi)), max. \(Fmt.weightShort(cls.maxKg)) kg")
                ReasonRow(label: "Deine Daten", text: sug.surplus > 0
                    ? "Dein schwächster Satz lag \(sug.surplus) Wdh über dem Ziel – nach Epley entspricht das ≈ +\(Fmt.percent(sug.dataPct)) Reserve."
                    : "Du hast das Ziel genau erreicht (keine Extra-Wdh) – daher der untere Rand der Spanne.")
                if sug.bigStep {
                    ReasonRow(label: "Hinweis",
                              text: "Schon der kleinste Schritt (\(Fmt.weightShort(sug.delta)) kg = \(Fmt.percent(sug.pct))) liegt über der Spanne. Alternativ erst die Wdh um 1–2 steigern (Doppelprogression) – das wirkt laut Studien ähnlich gut.")
                }
                Text("Grundlage: ACSM Position Stand 2009 (+2–10 %, sobald die Ziel-Wdh in zwei Einheiten in Folge geschafft werden; kleinere Sprünge für kleine Muskelgruppen), NSCA „2-for-2“-Regel (Oberkörper ≈ +1–4 kg, Unterkörper ≈ +2–7 kg), Plotkin et al. 2022 (Wdh- und Laststeigerung ähnlich wirksam). Gerundet auf die Schrittweite der Übung.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private struct ReasonRow: View {
        let label: String
        let text: String

        var body: some View {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(width: 84, alignment: .leading)
                Text(text)
                    .font(.subheadline)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// Vergleichs-Sektion „vorletzte → letzte Einheit“ – wird im „Warum?“-Sheet
/// und in der Übungs-Detailansicht (`ExerciseProgressView`) verwendet.
struct ProgressComparisonSection: View {
    let comparison: ProgressComparison

    var body: some View {
        Section("Vergleich: \(Fmt.date(comparison.prev.date)) → \(Fmt.date(comparison.last.date))") {
            Text(comparison.headline)
                .font(.subheadline.weight(.semibold))
                .padding(.vertical, 2)

            let a = comparison.prev
            let b = comparison.last
            let bodyweight = comparison.isBodyweight

            MetricRow(label: "Bester Satz",
                      from: setText(a), to: setText(b),
                      delta: comparison.signalDelta,
                      unit: bodyweight ? " Wdh" : " kg")
            if !bodyweight {
                MetricRow(label: "Geschätztes 1RM",
                          from: Fmt.number(a.e1RM), to: "\(Fmt.number(b.e1RM)) kg",
                          delta: b.e1RM - a.e1RM, unit: " kg")
                MetricRow(label: "Schwerster Satz",
                          from: Fmt.number(a.topWeight), to: "\(Fmt.number(b.topWeight)) kg",
                          delta: b.topWeight - a.topWeight, unit: " kg")
            }
            MetricRow(label: "Wiederholungen gesamt",
                      from: "\(a.totalReps)", to: "\(b.totalReps)",
                      delta: Double(b.totalReps - a.totalReps), unit: "")
            if !bodyweight {
                MetricRow(label: "Volumen (Wdh × kg)",
                          from: "\(Int(a.volume.rounded()))", to: "\(Int(b.volume.rounded())) kg",
                          delta: (b.volume - a.volume).rounded(), unit: " kg")
            }
            MetricRow(label: "Arbeitssätze",
                      from: "\(a.setCount)", to: "\(b.setCount)",
                      delta: Double(b.setCount - a.setCount), unit: "")

            Text("Maßstab für „stärker“ ist dein bester Arbeitssatz, bewertet über das geschätzte 1-Wiederholungs-Maximum (Epley: Gewicht × (1 + Wdh ÷ 30)). So zählt mehr Gewicht genauso wie mehr Wiederholungen. Bei Körpergewichtsübungen zählen die Wiederholungen direkt.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func setText(_ m: SessionMetrics) -> String {
        guard let s = m.best else { return "–" }
        return "\(s.reps)×\(Fmt.weightShort(s.weight))"
    }

    private struct MetricRow: View {
        let label: String
        let from: String
        let to: String
        let delta: Double
        let unit: String

        private var deltaText: String {
            if abs(delta) <= 0.005 { return "±0" }
            return (delta > 0 ? "+" : "−") + Fmt.number(abs(delta)) + unit
        }

        private var deltaColor: Color {
            if delta > 0.005 { return .green }
            if delta < -0.005 { return .red }
            return .secondary
        }

        var body: some View {
            HStack(spacing: 8) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(from) → \(to)")
                    .font(.subheadline)
                    .monospacedDigit()
                Text(deltaText)
                    .font(.caption.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(deltaColor)
                    .frame(minWidth: 52, alignment: .trailing)
            }
        }
    }
}
