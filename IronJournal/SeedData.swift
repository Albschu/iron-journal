import Foundation

extension AppStore {
    /// Startdaten beim ersten App-Start – direkt aus den Notizen übernommen.
    static func seedRoutines() -> [Routine] {
        func t(_ reps: Int, _ weight: Double, warmup: Bool = false) -> SetTarget {
            SetTarget(reps: reps, weight: weight, isWarmup: warmup)
        }

        let push = Routine(name: "Push", exercises: [
            Exercise(name: "Brustpresse", targets: [
                t(8, 15), t(8, 20), t(6, 25), t(8, 25)
            ], increment: 2.5),
            Exercise(name: "Fly", targets: [
                t(6, 25), t(7, 25), t(8, 27.5), t(8, 27.5)
            ], increment: 2.5),
            Exercise(name: "Trizeps", targets: [
                t(8, 16.25), t(8, 21.25), t(8, 21.25), t(8, 21.25)
            ], increment: 1.25),
            Exercise(name: "Seitheben", targets: [
                t(10, 20), t(8, 25), t(8, 25), t(8, 25)
            ], increment: 2.5),
            Exercise(name: "Schulterpresse", targets: [
                t(8, 7.5), t(8, 10), t(6, 10)
            ], increment: 2.5),
        ])

        let pull = Routine(name: "Rücken", exercises: [
            Exercise(name: "Latzug", targets: [
                t(8, 35, warmup: true), t(8, 42.5), t(10, 42.5), t(8, 42.5)
            ], increment: 2.5),
            Exercise(name: "Rudern", targets: [
                t(8, 35), t(6, 42.5), t(5, 42.5), t(5, 42.5)
            ], increment: 2.5),
            Exercise(name: "Überzug", targets: [
                t(8, 13.6), t(8, 15.9), t(6, 15.9), t(6, 15.9)
            ], increment: 2.3),
            Exercise(name: "Facepulls", note: "Gewicht nach Gefühl", targets: [
                t(15, 15), t(15, 15), t(15, 15)
            ], increment: 2.5),
            Exercise(name: "Bizeps (Preacher, Z-Stange)", targets: [
                t(8, 5), t(10, 5), t(10, 5), t(12, 5)
            ], increment: 1.25),
        ])

        let home = Routine(name: "Zuhause", exercises: [
            Exercise(name: "Liegestütze", note: "Körpergewicht", targets: [
                t(25, 0)
            ], increment: 0),
        ])

        return [push, pull, home]
    }
}
