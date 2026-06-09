import SwiftUI
import UIKit

extension View {
    /// Blendet über der Tastatur eine „Fertig“-Leiste ein, die den Fokus aufhebt.
    /// Nötig, weil `numberPad`/`decimalPad` keine Return-Taste zum Schließen haben –
    /// ohne diese Leiste bliebe die Tastatur in den Zahlenfeldern stehen.
    ///
    /// Genau **einmal** pro Screen auf den obersten Container (List/Form) anwenden,
    /// nicht in einzelne Zeilen – sonst entstehen mehrere Keyboard-Toolbars.
    func keyboardDoneToolbar() -> some View {
        toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Fertig") {
                    UIApplication.shared.sendAction(
                        #selector(UIResponder.resignFirstResponder),
                        to: nil, from: nil, for: nil
                    )
                }
                .fontWeight(.semibold)
            }
        }
    }
}
