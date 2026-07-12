// Node-Tests für den portierten Progressive-Overload-Tracker
// (entspricht ProgressionTests.swift). Ausführen:  node web/test.mjs
import {
  Store, routine, exercise, setTarget,
  exerciseVolume, exerciseTopWeight, epley1RM, best1RM, progressSignal,
  bestWorkingSet,
  linearTrend, weeklyVolumes, rangeStart, trainingHeatmap, personalRecords,
} from "./model.js";

// In-Memory-Storage als localStorage-Ersatz.
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const ok = Math.abs(actual - expected) < 1e-6;
  if (ok) { pass++; }
  else { fail++; console.error(`✗ ${msg}\n    erwartet ${expected}, war ${actual}`); }
}
function eqs(actual, expected, msg) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`✗ ${msg}\n    erwartet ${expected}, war ${actual}`); }
}
function freshStore(routines) {
  const s = new Store(memStorage());
  s.sessions = [];
  s.routines = routines;
  return s;
}
function completeAllWorking(session) {
  for (const e of session.exercises)
    for (const set of e.sets) if (!set.isWarmup) set.completed = true;
}
const w = (s, i = 0) => s.routines[0].exercises[0].targets[i].weight;

// Loggt eine Einheit mit explizit gesetzten Arbeitssätzen: sets = [[reps, weight, completed], …]
function logSession(s, r, secs, sets) {
  const ses = s.makeSession(r);
  ses.date = new Date(secs).toISOString();
  ses.exercises[0].sets = sets.map(([reps, weight, completed]) => ({
    id: "x", reps, weight, isWarmup: false, completed,
  }));
  s.saveSession(ses);
}
const ex0 = (s) => s.routines[0].exercises[0];

// ---------- Kein Auto-Increase mehr beim Speichern ----------
// 1
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r); completeAllWorking(ses); s.saveSession(ses);
  eq(w(s), 20, "Speichern erhöht das Gewicht NICHT mehr automatisch");
}
// 2
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 15, true), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r); completeAllWorking(ses); s.saveSession(ses);
  eq(w(s, 0), 15, "Aufwärmsatz unverändert");
  eq(w(s, 1), 20, "Arbeitssatz nach Speichern unverändert");
}

// ---------- Manuelles Übernehmen des Vorschlags ----------
// 3
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 15, true), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  s.applySuggestedIncrease(s.routines[0].id, ex0(s).id);
  eq(w(s, 0), 15, "applySuggestedIncrease lässt Aufwärmsatz");
  eq(w(s, 1), 22.5, "applySuggestedIncrease erhöht Arbeitssatz um increment");
}
// 4
{
  const r = routine("Zuhause", [exercise("Liegestütze", [setTarget(25, 0)], 0)]);
  const s = freshStore([r]);
  s.applySuggestedIncrease(s.routines[0].id, ex0(s).id);
  eq(w(s), 0, "applySuggestedIncrease No-Op bei increment 0");
}

// ---------- Vorbefüllung der nächsten Einheit (Auto-Steigerung) ----------
// P1: ohne Verlauf → Vorgaben
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 15, true), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r);
  eq(ses.exercises[0].sets.length, 2, "Vorbefüllung ohne Verlauf: Satzanzahl aus Vorgaben");
  eq(ses.exercises[0].sets[1].weight, 20, "Vorbefüllung ohne Verlauf: Gewicht aus Vorgaben");
}
// P2: Ziel-Wdh erreicht + abgehakt → Arbeitssatz +increment, Aufwärmsatz bleibt
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 15, true), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r);
  ses.exercises[0].sets[1].completed = true; // Aufwärmen muss nicht abgehakt sein
  s.saveSession(ses);
  const next = s.makeSession(r);
  eq(next.exercises[0].sets[0].weight, 15, "Aufwärmsatz bleibt bei Auto-Steigerung unverändert");
  eq(next.exercises[0].sets[1].weight, 22.5, "Arbeitssatz automatisch +increment vorbefüllt");
  eqs(next.exercises[0].sets[1].completed, false, "vorbefüllte Sätze sind nicht abgehakt");
  eq(s.autoIncrement(ex0(s)), 2.5, "autoIncrement liefert die Schrittweite für den Hinweis");
}
// P3: Satz nicht abgehakt → keine Steigerung, Vorbefüllung = letzte Werte
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[8, 20, false]]);
  const next = s.makeSession(r);
  eq(next.exercises[0].sets[0].weight, 20, "nicht abgehakt → Gewicht bleibt");
  eq(s.autoIncrement(ex0(s)), 0, "nicht abgehakt → autoIncrement 0");
}
// P4: Wdh unter Ziel → keine Steigerung
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[6, 20, true]]);
  eq(s.makeSession(r).exercises[0].sets[0].weight, 20, "Wdh unter Ziel → Gewicht bleibt");
}
// P5: Vorbefüllung nutzt die letzten TATSÄCHLICHEN Sätze (inkl. Extra-Satz)
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[8, 25, true], [10, 25, true]]); // schwerer + ein Satz mehr
  const next = s.makeSession(r);
  eq(next.exercises[0].sets.length, 2, "Extra-Satz vom letzten Mal wird übernommen");
  eq(next.exercises[0].sets[0].weight, 27.5, "Steigerung basiert auf letztem Ist-Gewicht");
  eq(next.exercises[0].sets[1].reps, 10, "Wdh vom letzten Mal übernommen");
}
// P6: Deload unter Ziel-Gewicht – Wdh-Ziel erreicht → trotzdem Steigerung
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[8, 15, true]]);
  eq(s.makeSession(r).exercises[0].sets[0].weight, 17.5, "nach Deload greift die Steigerung wieder");
}
// P7: Körpergewicht (increment 0) → nie automatische Steigerung
{
  const r = routine("Zuhause", [exercise("Liegestütze", [setTarget(25, 0)], 0)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[30, 0, true]]);
  const next = s.makeSession(r);
  eq(next.exercises[0].sets[0].weight, 0, "Körpergewicht bleibt 0");
  eq(next.exercises[0].sets[0].reps, 30, "letzte Wdh vorbefüllt");
}

// ---------- Statuslogik ----------
// 5: noData
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  eqs(s.progressionStatus(ex0(s)).kind, "noData", "noData ohne Verlauf");
}
// 6: progressing
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[5, 100, true]]);   // Wdh<Ziel → kein readyToIncrease
  logSession(s, r, 2000, [[5, 105, true]]);
  const st = s.progressionStatus(ex0(s));
  eqs(st.kind, "progressing", "progressing bei steigendem e1RM");
}
// 7: maintaining
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[5, 100, true]]);
  logSession(s, r, 2000, [[5, 100, true]]);
  eqs(s.progressionStatus(ex0(s)).kind, "maintaining", "maintaining bei gleichem e1RM");
}
// 8: stalled
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[5, 100, true]]);
  logSession(s, r, 2000, [[5, 95, true]]);
  logSession(s, r, 3000, [[5, 95, true]]);
  logSession(s, r, 4000, [[5, 95, true]]);
  const st = s.progressionStatus(ex0(s));
  eqs(st.kind, "stalled", "stalled nach 3 Einheiten ohne Bestwert");
  eq(st.sessions, 3, "stalled zählt 3 Einheiten");
}
// 9: deloadSuggested
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[5, 100, true]]);
  for (let i = 1; i <= 5; i++) logSession(s, r, 1000 + i * 1000, [[5, 95, true]]);
  const st = s.progressionStatus(ex0(s));
  eqs(st.kind, "deloadSuggested", "deloadSuggested nach 5 Einheiten");
  eq(st.sessions, 5, "deload zählt 5 Einheiten");
}
// 10: readyToIncrease
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[8, 20, true]]);
  logSession(s, r, 2000, [[8, 20, true]]);
  const st = s.progressionStatus(ex0(s));
  eqs(st.kind, "readyToIncrease", "readyToIncrease bei zweimal erreichtem Ziel");
  eq(st.suggested, 22.5, "Vorschlag = Arbeitsgewicht + increment");
}
// 11: Körpergewicht → kein readyToIncrease (increment 0)
{
  const r = routine("Zuhause", [exercise("Liegestütze", [setTarget(25, 0)], 0)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[25, 0, true]]);
  logSession(s, r, 2000, [[25, 0, true]]);
  eqs(s.progressionStatus(ex0(s)).kind, "maintaining", "Körpergewicht: kein Gewichtsvorschlag");
}

// ---------- Verlauf ----------
// 12
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const exId = ex0(s).id;
  const older = s.makeSession(r); older.date = new Date(1000_000).toISOString();
  const newer = s.makeSession(r); newer.date = new Date(2000_000).toISOString();
  s.saveSession(newer); s.saveSession(older);
  const h = s.history(exId);
  eq(h.length, 2, "Verlauf zählt beide");
  eq(new Date(h[0].date).getTime(), 1000_000, "ältester zuerst");
  eq(new Date(s.lastSession(exId).date).getTime(), 2000_000, "lastSession = neuster");
}

// ---------- Abgeleitete Werte ----------
{
  const logged = { sets: [
    { reps: 8, weight: 20, isWarmup: false, completed: true },
    { reps: 10, weight: 5, isWarmup: true, completed: true },
  ]};
  eq(exerciseVolume(logged), 160, "Volumen nur Arbeitssätze");
  eq(exerciseTopWeight(logged), 20, "Top-Gewicht nur Arbeitssätze");
}

// 1RM-Schätzung (Epley) + Fortschrittssignal
{
  eq(epley1RM(100, 1), 100, "1RM bei 1 Wdh = Gewicht");
  eq(epley1RM(20, 8), 20 * (1 + 8 / 30), "Epley-Formel");
  eq(epley1RM(0, 25), 0, "Körpergewicht → kein 1RM");
  const logged = { sets: [
    { reps: 8, weight: 20, isWarmup: false, completed: true },
    { reps: 5, weight: 25, isWarmup: false, completed: true },
    { reps: 12, weight: 40, isWarmup: true, completed: true },
  ]};
  eq(best1RM(logged), 25 * (1 + 5 / 30), "best1RM ignoriert Aufwärmsätze");
  eq(progressSignal({ sets: [{ reps: 5, weight: 100, isWarmup: false }] }),
     100 * (1 + 5 / 30), "progressSignal = e1RM");
  eq(progressSignal({ sets: [{ reps: 12, weight: 0, isWarmup: false }] }),
     12, "progressSignal Körpergewicht = Wdh");
}

// Bester Arbeitssatz + „Warum?“-Vergleich (Datenbasis der Status-Pille)
{
  const logged = { sets: [
    { reps: 12, weight: 40, isWarmup: true, completed: true },
    { reps: 8, weight: 20, isWarmup: false, completed: true },
    { reps: 5, weight: 25, isWarmup: false, completed: true },
  ]};
  eq(bestWorkingSet(logged).weight, 25, "bestWorkingSet: höchstes e1RM, Aufwärmen ignoriert");
  eq(bestWorkingSet({ sets: [
    { reps: 10, weight: 0, isWarmup: false }, { reps: 14, weight: 0, isWarmup: false },
  ] }).reps, 14, "bestWorkingSet Körpergewicht: meiste Wdh");
  eqs(bestWorkingSet({ sets: [] }), null, "bestWorkingSet ohne Sätze → null");
}
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  eqs(s.progressComparison(ex0(s).id), null, "progressComparison braucht 2 Einheiten (0 vorhanden)");
  logSession(s, r, 1000, [[8, 80, true]]);
  eqs(s.progressComparison(ex0(s).id), null, "progressComparison braucht 2 Einheiten (1 vorhanden)");
  logSession(s, r, 2000, [[8, 80, true], [9, 82.5, true]]);
  const cmp = s.progressComparison(ex0(s).id);
  eq(cmp.prev.top, 80, "Vergleich: Top-Gewicht der vorletzten Einheit");
  eq(cmp.last.top, 82.5, "Vergleich: Top-Gewicht der letzten Einheit");
  eq(cmp.last.best.reps, 9, "Vergleich: bester Satz der letzten Einheit (höchstes e1RM)");
  eq(cmp.last.sets, 2, "Vergleich: Arbeitssätze gezählt");
  eq(cmp.last.reps, 17, "Vergleich: Wiederholungen summiert");
  eq(cmp.last.volume, 8 * 80 + 9 * 82.5, "Vergleich: Volumen der letzten Einheit");
  eq(cmp.last.signal - cmp.prev.signal, epley1RM(82.5, 9) - epley1RM(80, 8),
     "Vergleich: Signal-Delta = e1RM-Delta des besten Satzes");
}

// Entwurf speichern/laden/löschen
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r);
  s.saveDraft(ses);
  eq(s.loadDraft().id === ses.id ? 1 : 0, 1, "Draft-Roundtrip behält ID");
  s.clearDraft();
  eq(s.loadDraft() === null ? 1 : 0, 1, "clearDraft entfernt Entwurf");
}

// Backup Export/Import
{
  const r = routine("Mein Spezial-Plan", [exercise("Kniebeuge", [setTarget(5, 60)], 2.5)]);
  const a = freshStore([r]);
  const ses = a.makeSession(r); completeAllWorking(ses); a.saveSession(ses);
  const json = a.exportData();
  const b = new Store(memStorage());
  eq(b.importData(json) ? 1 : 0, 1, "Import eines gültigen Backups");
  eq(b.routines[0].name === "Mein Spezial-Plan" ? 1 : 0, 1, "Routinen importiert");
  eq(b.sessions.length, 1, "Sessions importiert");
  eq(b.importData("kein json {") ? 0 : 1, 1, "Import lehnt Müll ab");
  eq(b.importData('{"routines":42}') ? 0 : 1, 1, "Import lehnt falsche Struktur ab");
}

// Trend (lineare Regression)
{
  const pts = [0, 1, 2, 3, 4].map((t) => ({ t, y: 2 * t + 1 }));
  const reg = linearTrend(pts);
  eq(reg.slope, 2, "Trend-Steigung exakt");
  eq(reg.intercept, 1, "Trend-Achsenabschnitt exakt");
  eq(linearTrend([{ t: 0, y: 1 }]) === null ? 1 : 0, 1, "Trend braucht ≥2 Punkte");
  eq(linearTrend([{ t: 5, y: 1 }, { t: 5, y: 9 }]) === null ? 1 : 0, 1, "Degenerierte X-Werte → null");
}

// Wochenvolumen-Buckets
{
  const r = routine("Push", [exercise("Bank", [setTarget(10, 10)], 2.5)]);
  const s = freshStore([r]);
  const now = new Date("2026-06-10T12:00:00"); // Mittwoch
  const mk = (daysAgo) => {
    const ses = s.makeSession(r);
    ses.date = new Date(now.getTime() - daysAgo * 86400000).toISOString();
    return ses;
  };
  s.sessions = [mk(0), mk(1), mk(8)]; // 2× diese Woche, 1× Vorwoche
  const buckets = weeklyVolumes(s.sessions, 8, now);
  eq(buckets.length, 8, "8 Wochen-Buckets");
  eq(buckets.at(-1).sessions, 2, "aktuelle Woche: 2 Einheiten");
  eq(buckets.at(-2).sessions, 1, "Vorwoche: 1 Einheit");
  eq(buckets.at(-1).volume, 200, "Volumen der Woche summiert (2×100)");
  eq(buckets[0].sessions, 0, "alte Wochen leer");
}

// Zeitraum-Start (Dashboard-Filter)
{
  const now = new Date("2026-06-10T12:00:00");
  eqs(rangeStart(0, now), null, "rangeStart(0) = null (alle)");
  const s28 = rangeStart(28, now);
  eq(s28.getHours(), 0, "rangeStart auf Mitternacht normalisiert");
  eq(Math.round((new Date("2026-06-10T00:00:00") - s28) / 86400000), 27, "28-Tage-Fenster inkl. heute");
}

// Trainings-Heatmap
{
  const r = routine("Push", [exercise("Bank", [setTarget(10, 10)], 2.5)]);
  const s = freshStore([r]);
  const now = new Date("2026-06-10T12:00:00"); // Mittwoch
  const mk = (daysAgo) => {
    const ses = s.makeSession(r);
    ses.date = new Date(now.getTime() - daysAgo * 86400000).toISOString();
    completeAllWorking(ses);
    return ses;
  };
  s.sessions = [mk(0), mk(2), mk(100)]; // heute, vorgestern, weit außerhalb
  const hm = trainingHeatmap(s.sessions, 12, now);
  eq(hm.grid.length, 12, "12 Wochen");
  eq(hm.grid[0].length, 7, "7 Wochentage");
  eq(hm.days, 2, "zwei Trainingstage im Fenster (100 Tage draußen)");
  eq(hm.grid.at(-1)[2], 100, "heute (Mi) in der aktuellen Woche, Volumen 100");
  eq(hm.grid.at(-1)[0], 100, "vorgestern (Mo) in der aktuellen Woche");
  eq(hm.maxVol, 100, "Maximalvolumen je Tag");
}

// Persönliche Bestwerte
{
  const r = routine("Push", [
    exercise("Bank", [setTarget(8, 20)], 2.5),
    exercise("Liegestütze", [setTarget(25, 0)], 0),
  ]);
  const s = freshStore([r]);
  const bankId = s.routines[0].exercises[0].id;
  const logBank = (secs, reps, weight) => {
    const ses = s.makeSession(r);
    ses.date = new Date(secs).toISOString();
    ses.exercises[0].sets = [{ id: "x", reps, weight, isWarmup: false, completed: true }];
    s.saveSession(ses);
  };
  logBank(1000, 5, 100);          // e1RM = 116,67
  logBank(2000, 5, 110);          // e1RM = 128,33  ← Bestwert, jüngste Einheit
  const recs = personalRecords(s);
  eq(recs.length, 1, "nur Übungen mit kg-Bestwert (Liegestütze 0 → keiner)");
  eqs(recs[0].exerciseId, bankId, "Bank-Rekord erfasst");
  eq(recs[0].top, 110, "Top-Gewicht des Bestwerts");
  eqs(recs[0].fresh ? 1 : 0, 1, "fresh = Bestwert in jüngster Einheit");
  // Bestwert liegt zurück → nicht mehr fresh
  logBank(3000, 5, 90);
  eqs(personalRecords(s)[0].fresh ? 1 : 0, 0, "nicht fresh, wenn Bestwert älter ist");
}

console.log(`\n${pass} Tests bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
