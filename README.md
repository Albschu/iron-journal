# Iron Journal 🏋️

Minimalistische iOS-App (SwiftUI) zum Tracking von Krafttraining – als Ersatz für die Notizen-App. Workouts auswählen, Sätze (Wdh × Gewicht) abhaken, Verlauf und Fortschritt im Dashboard sehen, mit automatischer **Progressive-Overload**-Logik.

## Funktionen

- **Training** – Vordefinierte Workouts (Push, Rücken, Zuhause). Antippen startet eine Einheit; Sätze sind mit der letzten Einheit vorbefüllt (Ist-Werte statt statischer Vorgaben) – einfach öffnen und loslegen, ohne nachzudenken. Wdh & Gewicht eintragen, Satz abhaken, fertig.
- **Verlauf** – Jede abgeschlossene Einheit mit Datum, Volumen und allen Sätzen.
- **Dashboard** – Pro Übung Top-Gewicht- und Volumen-Charts über die Zeit, tabellarischer Verlauf und Steigerungs-Status.
- **Progressive Overload** – Wenn in der letzten Einheit alle Arbeitssätze mit den Ziel-Wiederholungen abgehakt waren, wird das Arbeitsgewicht beim nächsten Start automatisch um die eingestellte Schrittweite erhöht (pro Übung konfigurierbar, z. B. 2,5 kg an der Hantel, 1,25 kg am Block). Gewichte lassen sich jederzeit auch manuell anpassen.
- **Eigene Workouts** – Workouts und Übungen frei anlegen, bearbeiten und löschen. Aufwärmsätze werden markiert und von der Progression ausgenommen.

Alle Daten bleiben lokal auf dem Gerät (JSON im Documents-Ordner). Keine Accounts, kein Netzwerk.

## Aufbau

```
IronJournal/
├── IronJournalApp.swift     App-Einstieg + Tab-Navigation
├── Models.swift             Datenmodelle (Routine, Exercise, Session …)
├── AppStore.swift           Store, Persistenz & Progressive-Overload-Logik
├── SeedData.swift           Start-Workouts (aus den Notizen)
├── Formatting.swift         Zahlen-/Datumsformatierung (de_DE)
├── Assets.xcassets          App-Icon-Platzhalter & Akzentfarbe
└── Views/
    ├── WorkoutListView.swift       Workout-Liste / Einstieg
    ├── ActiveSessionView.swift     Tracking einer Einheit
    ├── RoutineEditView.swift       Workouts & Übungen bearbeiten
    ├── HistoryView.swift           Verlauf
    ├── DashboardView.swift         Übersicht je Übung
    └── ExerciseProgressView.swift  Charts + Gewichtssteuerung
```

## Bauen & Installieren

Voraussetzung: **Mac mit Xcode 16+** (die Charts brauchen iOS 16+).

1. `IronJournal.xcodeproj` in Xcode öffnen.
2. Unter *Signing & Capabilities* dein **Apple-ID-Team** auswählen (für einen lokalen Build auf dem eigenen iPhone reicht ein kostenloser Account; die App läuft dann 7 Tage bis zum nächsten Re-Sign).
3. Bei Bedarf die Bundle-ID `com.albschu.IronJournal` auf etwas Eindeutiges anpassen.
4. iPhone anschließen, als Ziel wählen, ▶︎ Run.

### App Store

Für eine Veröffentlichung im App Store ist eine Mitgliedschaft im **Apple Developer Program** (99 $/Jahr) nötig: in Xcode *Product → Archive*, dann über den Organizer nach App Store Connect hochladen und zur Review einreichen.

## Hinweis

Das Projekt wurde unter Linux geschrieben und konnte dort nicht kompiliert werden – der erste Build muss auf einem Mac erfolgen. Sollte Xcode beim Öffnen eine Schema-Migration anbieten, einfach bestätigen.
