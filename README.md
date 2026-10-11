# Iron Journal 🏋️

Minimalistische Web-App (PWA) zum Tracking von Krafttraining – als Ersatz für die Notizen-App. In Safari öffnen → *Teilen → Zum Home-Bildschirm*, dann läuft sie wie eine native App, auch offline.

**URL:** https://albschu.github.io/iron-journal/

## Funktionen

- **Training** – Oben steht groß das Workout, das in der Rotation **als Nächstes dran** ist (Push → Rücken → …), darüber das **Wochenziel** mit Serie („2/3 diese Woche · 🔥 6 Wochen in Folge“). Sätze sind mit der letzten Einheit vorbefüllt.
- **Abhaken = fertig** – Stimmen die Werte, reicht ein Tipp auf den Kreis. Weicht etwas ab, öffnet ein Tipp auf „8 × 25 kg“ einen **großen Ziffernblock** mit ± Schrittweite und „✓ Abhaken“. Danach springt die Ansicht zum nächsten offenen Satz.
- **Pausen-Timer nach Übungsart** – Startet beim Abhaken: Unterkörper-Grundübung 3:00, Oberkörper-Grundübung 2:30, Isolation 1:30 (Schoenfeld et al. 2016, NSCA). Bildschirm bleibt an, Ton/Vibration bei Ablauf.
- **Flexibler Ablauf** – Über „⋯“ an jeder Übung: **später machen** (ans Ende), **tauschen** (gegen eine Übung aus einem anderen Workout oder eine neue „nur heute“) oder **überspringen**. Übersprungene Übungen zählen nicht als Stagnation. „＋ Übung hinzufügen“ am Ende.
- **Tagesform** – Schnell-Chips („😴 Schlecht geschlafen“, „💪 Top fit“ …) plus freie Notiz pro Einheit. Landen im Backup (`session.tags`, `session.note`) – gedacht für eine regelmäßige externe KI-Auswertung.
- **Zusammenfassung** – Nach „Fertig“: Dauer, Sätze, Volumen, neue Bestwerte ★ und Vergleich zur letzten Einheit desselben Workouts. Nicht abgehakte Sätze: verwerfen oder als erledigt zählen.
- **Verlauf** – Jede Einheit mit Dauer und Tagesform; vergangene Einheiten lassen sich **bearbeiten** (Sätze, Datum). Löschen mit **Rückgängig**.
- **Steigerung & Dashboard** – Status je Übung („Stagniert“, „Bereit für mehr“ …) mit „Warum?“-Erklärung, datengestützter Erhöhungsvorschlag, Charts, Heatmap, Bestwerte.
- **Deload per Tipp** – Bei „Stagniert“/„Deload sinnvoll“: nächste Einheit mit −10 %, danach geht es mit dem Gewicht von davor weiter und die Bewertung beginnt frisch.
- **Automatisches Backup** – Nach jeder Änderung still in ein **privates GitHub-Gist** (Dashboard → Daten → Automatisches Backup; einmalig ein Token nur mit Recht „gist“). GitHub hebt jede Fassung als Revision auf; auf einem neuen Gerät Token eintragen → Backup wird gefunden und wiederhergestellt. Manueller JSON-Export/-Import bleibt.

Alle Daten liegen lokal im Browser (localStorage); einziger Netzwerkzugriff ist der optionale Gist-Sync.

## Steigerungsvorschlag – Datenbasis

| Regel | Quelle |
|---|---|
| **+2–10 %** Last, sobald die Ziel-Wdh in **zwei Einheiten in Folge** geschafft (bzw. um 1–2 Wdh übertroffen) werden; kleiner Prozentsatz für kleine, größerer für große Muskelgruppen | ACSM Position Stand „Progression Models in Resistance Training for Healthy Adults“, *Med Sci Sports Exerc* 41(3):687–708, 2009 (Evidenzkategorie B) |
| Absolute Sprünge: Oberkörper ≈ +1–4 kg, Unterkörper ≈ +2–7 kg je nach Trainingsstand („2-for-2“-Regel) | NSCA, *Essentials of Strength Training and Conditioning*, Kap. Program Design |
| Wdh-Steigerung bringt praktisch dieselben Kraft-/Muskelzuwächse wie Last-Steigerung → bei zu großen Gewichtssprüngen erst Wdh steigern (Doppelprogression) | Plotkin et al., *PeerJ* 10:e14142, 2022 |
| Extra-Wdh über dem Ziel → Reserve nach Epley (1RM = Gewicht × (1 + Wdh/30)), ≈ 3 % pro Wdh | Epley 1985 |

Umsetzung: Die Übung wird über ihren Namen eingeordnet (Unterkörper-Grundübung 5–10 %, max. 7,5 kg · Oberkörper-Grundübung 2,5–5 %, max. 5 kg · Isolationsübung 2–5 %, max. 2,5 kg). Innerhalb der Spanne entscheiden deine Daten: Hast du das Ziel genau erreicht, gilt der untere Rand; hat der schwächste Satz Wdh übrig, rechnet Epley den passenden Sprung aus. Gerundet wird auf die Schrittweite der Übung (mindestens ein Schritt). Liegt schon ein Schritt über der Spanne, weist die App auf die Wdh-Progression hin.

## Aufbau

```
web/
├── index.html            App-Shell + Tab-Leiste
├── app.js                UI: Tabs, Training, Ziffernblock, Zusammenfassung, Charts
├── model.js              Daten + Logik (Progression, Deload, Rotation, Wochenziel …), DOM-frei
├── sync.js               Automatisches Backup ins GitHub-Gist
├── styles.css
├── sw.js                 Service Worker (offline; Version bei jeder Änderung hochzählen!)
├── manifest.webmanifest
└── test.mjs              Logik-Tests:  node web/test.mjs
```

Deploy: Jeder Push auf `main`, der `web/` ändert, geht per GitHub Actions auf GitHub Pages.
