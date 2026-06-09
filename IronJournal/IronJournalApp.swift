import SwiftUI

@main
struct IronJournalApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
        }
    }
}

struct RootView: View {
    var body: some View {
        TabView {
            WorkoutListView()
                .tabItem { Label("Training", systemImage: "dumbbell.fill") }

            HistoryView()
                .tabItem { Label("Verlauf", systemImage: "clock.arrow.circlepath") }

            DashboardView()
                .tabItem { Label("Dashboard", systemImage: "chart.line.uptrend.xyaxis") }
        }
    }
}
