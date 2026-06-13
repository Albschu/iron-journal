// Node-Tests für den portierten Progressive-Overload-Tracker
// (entspricht ProgressionTests.swift). Ausführen:  node web/test.mjs
import {
  Store, routine, exercise, setTarget,
  exerciseVolume, exerciseTopWeight, epley1RM, best1RM, progressSignal,
  linearTrend, weeklyVolumes,
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

console.log(`\n${pass} Tests bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
