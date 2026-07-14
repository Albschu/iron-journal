import SwiftUI

extension ProgressionStatus {
    /// SF-Symbol für die Status-Anzeige.
    var symbolName: String {
        switch self {
        case .noData:          return "circle.dashed"
        case .progressing:     return "arrow.up.right.circle.fill"
        case .maintaining:     return "equal.circle.fill"
        case .readyToIncrease: return "arrow.up.circle.fill"
        case .stalled:         return "exclamationmark.triangle.fill"
        case .deloadSuggested: return "zzz"
        }
    }

    /// Akzentfarbe der Status-Pille.
    var tint: Color {
        switch self {
        case .noData:          return .secondary
        case .progressing:     return .green
        case .maintaining:     return .blue
        case .readyToIncrease: return .accentColor
        case .stalled:         return .orange
        case .deloadSuggested: return .red
        }
    }
}

/// Kompakte, farbcodierte Pille, die den Steigerungs-Status einer Übung zeigt.
struct ProgressionStatusPill: View {
    let status: ProgressionStatus
    /// Kleines ⓘ als Hinweis, dass die Pille antippbar ist (→ „Warum?“-Sheet).
    var showsInfoHint: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: status.symbolName)
            Text(status.label)
            if showsInfoHint {
                Image(systemName: "info.circle")
                    .font(.system(size: 9))
                    .opacity(0.75)
            }
        }
        .font(.caption2.weight(.semibold))
        .lineLimit(1)
        // Nie umbrechen oder abschneiden – stattdessen soll der
        // Übungsname daneben umbrechen.
        .fixedSize(horizontal: true, vertical: false)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(status.tint.opacity(0.15), in: Capsule())
        .foregroundStyle(status.tint)
    }
}

/// Antippbare Status-Pille: öffnet als Sheet die „Warum?“-Erklärung, die den
/// Status über den Vergleich der letzten zwei Einheiten begründet (mehr
/// Gewicht, mehr Wiederholungen, …). Für Zeilen, die selbst navigieren
/// (NavigationLink), `.buttonStyle(.plain)` – so reagiert nur die Pille.
struct TappableStatusPill: View {
    let status: ProgressionStatus
    let exercise: Exercise
    @State private var showWhy = false

    var body: some View {
        Button {
            showWhy = true
        } label: {
            ProgressionStatusPill(status: status, showsInfoHint: status != .noData)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showWhy) {
            WhyStatusView(exercise: exercise)
        }
    }
}
