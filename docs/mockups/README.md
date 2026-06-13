# Dashboard-Überarbeitung – Entwürfe

Drei gerenderte Konzepte für eine Dashboard-Überarbeitung mit einem interaktiven
Plot, der **Gewicht (kg) pro Übung über die Tage** zeigt. Die Bilder sind reine
Mockups (Beispieldaten, Übungsnamen aus den Seed-Workouts) – noch nicht im Code.

| Konzept | Datei | Idee |
|---|---|---|
| **A – Unified Plot** | `concept-a-unified-plot.png` | Ein großer Chart oben mit **mehreren Übungen gleichzeitig** als farbige Linien + gestrichelter „Theorie"-Linie (Vorgabe). Zeitraum-Umschalter (4 W / 12 W / 1 J / Alle), antippbare Legende zum Ein-/Ausblenden, Tooltip beim Tippen. Darunter Wochenstatistik + kompakte Übungsliste mit Sparklines. |
| **B – Cards** | `concept-b-cards.png` | Glanceable: Hero-Karte „Volumen diese Woche", ein **fokussierter Chart mit Ist- vs. Theorie-Linie** (Übung per Dropdown wählbar) und ein 2-spaltiges Raster aus Übungs-Karten (aktuelles kg, Mini-Sparkline, Δ-Badge). |
| **C – Pro-Analyse** | `concept-c-analytics.png` | Datendichte „Analyse"-Ansicht: Metrik-Umschalter (Gewicht / Volumen / 1RM), großer Multi-Linien-Chart, **Trainings-Heatmap** der letzten 10 Wochen und Liste neuer Bestwerte (PRs). |

Neu erzeugen: `node docs/mockups/generate.mjs` (benötigt `@resvg/resvg-js`).
