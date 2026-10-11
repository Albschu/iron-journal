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
- **Automatische Steigerung** – Die App entscheidet, wann und um wie viel das Gewicht steigt (siehe unten), und füllt das Training so vor.
- **Steigerung & Dashboard** – Status je Übung („Stagniert“, „Nächstes Mal mehr“ …) mit „Warum?“-Erklärung, Charts, Heatmap, Bestwerte.
- **Deload per Tipp** – Bei „Stagniert“/„Deload sinnvoll“: nächste Einheit mit −10 %, danach geht es mit dem Gewicht von davor weiter und die Bewertung beginnt frisch.
- **Automatisches Backup** – Nach jeder Änderung still in ein **privates GitHub-Gist** (Dashboard → Daten → Automatisches Backup; einmalig ein Token nur mit Recht „gist“). GitHub hebt jede Fassung als Revision auf; auf einem neuen Gerät Token eintragen → Backup wird gefunden und wiederhergestellt. Manueller JSON-Export/-Import bleibt.

Alle Daten liegen lokal im Browser (localStorage); einziger Netzwerkzugriff ist der optionale Gist-Sync.

## Steigerung – wann und wie viel?

Die App entscheidet selbst und füllt jedes Training passend vor (**Doppelprogression**). Im Training steht pro Übung genau eine Zeile, z. B. „⬆ Heute +2,5 kg → 27,5 kg · Ziel 8 Wdh“ oder „→ Gewicht halten · +1 Wdh je Satz“.

| Situation | Nächstes Training |
|---|---|
| Noch nicht alle Arbeitssätze an der Obergrenze | gleiches Gewicht, **+1 Wdh je Satz** (bis zur Obergrenze) |
| **Alle** Arbeitssätze an der Obergrenze (z. B. 4 × 12) | **+1 Gewichtsschritt** (z. B. +2,5 kg), Wdh zurück auf die Untergrenze |
| **Zweimal in Folge** meist unter der Untergrenze | **−1 Gewichtsschritt**, Wdh auf die Untergrenze (ein schlechter Tag allein ändert nichts) |
| Deload vorgemerkt / Gewicht von Hand festgelegt | −10 % bzw. dein Gewicht, danach wieder automatisch |
| Körpergewicht | immer +1 Wdh je Satz |

Die **Wdh-Spanne** stellst du je Übung im Workout-Editor ein. Ohne eigene Einstellung gilt die häufigste Ziel-Wdh als Untergrenze und +4 als Obergrenze (z. B. 8–12). Passen deine tatsächlich gemachten Wdh nicht dazu (alte Vorgaben aus Notizen), schreibt die App einmalig eine Spanne aus deinem Verlauf fest (Median der letzten 3 Einheiten, z. B. Facepulls 8–12 statt 15–19). Der Gewichtsschritt ist die Schrittweite der Übung.

Weitere Regeln aus echten Daten:
- **Satzzahl** = wie viele Sätze du zuletzt üblicherweise gemacht hast (Maximum der letzten 3 Einheiten), nicht die Vorgabe.
- **Pause über 3 Wochen:** kein „Stagniert“ oder „Deload“, sondern „Neustart“ – Kraftverlust nach einer Pause ist normal; ab hier wird neu verglichen.
- **Gerätewechsel** (Arbeitsgewicht mehr als halbiert oder verdoppelt): ebenfalls „Neustart“, der Vergleich läuft nur noch mit dem neuen Gewicht.

Warum so: Der Sprung ist immer der kleinstmögliche und kommt erst, wenn du an der Obergrenze Reserve hast. Wer 12 Wdh schafft, schafft 8 Wdh mit einem Schritt mehr sicher (Epley: 12 Wdh ≈ 140 % der Last, 8 Wdh ≈ 127 %).

| Quelle | Aussage |
|---|---|
| NSCA, *Essentials of Strength Training and Conditioning*, Program Design | Doppelprogression: erst Wdh in der Spanne steigern, dann Last |
| ACSM Position Stand, *Med Sci Sports Exerc* 41(3):687–708, 2009 | Last erhöhen, sobald die Wdh-Obergrenze bzw. 1–2 Wdh über dem Ziel geschafft werden |
| Plotkin et al., *PeerJ* 10:e14142, 2022 | Wdh-Steigerung und Last-Steigerung bringen praktisch gleich viel Kraft und Muskel |
| Epley 1985 | 1RM ≈ Gewicht × (1 + Wdh ÷ 30) |

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
