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

    var body: some View {
        Label(status.label, systemImage: status.symbolName)
            .font(.caption2.weight(.semibold))
            .labelStyle(.titleAndIcon)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(status.tint.opacity(0.15), in: Capsule())
            .foregroundStyle(status.tint)
    }
}
