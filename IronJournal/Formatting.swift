import Foundation

enum Fmt {
    /// Gewicht ohne unnötige Nachkommastellen: 25 → "25", 27.5 → "27,5".
    static func weight(_ value: Double) -> String {
        if value == 0 { return "–" }
        let nf = NumberFormatter()
        nf.locale = Locale(identifier: "de_DE")
        nf.minimumFractionDigits = 0
        nf.maximumFractionDigits = 2
        return (nf.string(from: value as NSNumber) ?? "\(value)") + " kg"
    }

    static func weightShort(_ value: Double) -> String {
        if value == 0 { return "KG" } // Körpergewicht
        let nf = NumberFormatter()
        nf.locale = Locale(identifier: "de_DE")
        nf.minimumFractionDigits = 0
        nf.maximumFractionDigits = 2
        return nf.string(from: value as NSNumber) ?? "\(value)"
    }

    /// Zahl ohne unnötige Nachkommastellen und ohne Einheit (für Deltas/Metriken).
    static func number(_ value: Double) -> String {
        let nf = NumberFormatter()
        nf.locale = Locale(identifier: "de_DE")
        nf.minimumFractionDigits = 0
        nf.maximumFractionDigits = 2
        return nf.string(from: value as NSNumber) ?? "\(value)"
    }

    /// Kompakte Darstellung großer kg-Werte (Trainingsvolumen): ab 1 t in Tonnen,
    /// damit vierstellige Zahlen die Kacheln nicht sprengen.
    static func volume(_ value: Double) -> String {
        if value == 0 { return "–" }
        if abs(value) >= 1000 {
            let nf = NumberFormatter()
            nf.locale = Locale(identifier: "de_DE")
            nf.minimumFractionDigits = 0
            nf.maximumFractionDigits = 1
            return (nf.string(from: (value / 1000) as NSNumber) ?? "\(value)") + " t"
        }
        return number(value.rounded()) + " kg"
    }

    static func date(_ date: Date) -> String {
        let df = DateFormatter()
        df.locale = Locale(identifier: "de_DE")
        df.dateFormat = "EEE, d. MMM"
        return df.string(from: date)
    }

    static func relativeDate(_ date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.unitsStyle = .full
        return f.localizedString(for: date, relativeTo: Date())
    }
}
