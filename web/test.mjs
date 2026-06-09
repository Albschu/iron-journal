// Node-Tests für die portierte Progressions-Logik (entspricht ProgressionTests.swift).
// Ausführen:  node web/test.mjs
import {
  Store, routine, exercise, setTarget,
  exerciseVolume, exerciseTopWeight,
} from "./model.js";

// In-Memory-Storage als localStorage-Ersatz.
function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const ok = Math.abs(actual - expected) < 1e-6;
  if (ok) { pass++; }
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

// 1
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r); completeAllWorking(ses); s.saveSession(ses);
  eq(w(s), 22.5, "Steigerung bei erreichten Vorgaben");
}
// 2
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 21.25)], 1.25)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r); completeAllWorking(ses); s.saveSession(ses);
  eq(w(s), 22.5, "per-Übung increment");
}
// 3
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  s.saveSession(s.makeSession(r)); // nichts abgehakt
  eq(w(s), 20, "keine Steigerung ohne Abhaken");
}
// 4
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r); completeAllWorking(ses);
  ses.exercises[0].sets[0].reps = 6; s.saveSession(ses);
  eq(w(s), 20, "keine Steigerung bei zu wenig Wdh");
}
// 5
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r); completeAllWorking(ses);
  ses.exercises[0].sets[0].weight = 17.5; s.saveSession(ses);
  eq(w(s), 20, "keine Steigerung bei zu wenig Gewicht");
}
// 6
{
  const r = routine("Zuhause", [exercise("Liegestütze", [setTarget(25, 0)], 0)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r); completeAllWorking(ses); s.saveSession(ses);
  eq(w(s), 0, "increment 0 → keine Steigerung");
}
// 7
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 15, true), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r); completeAllWorking(ses); s.saveSession(ses);
  eq(w(s, 0), 15, "Aufwärmsatz bleibt");
  eq(w(s, 1), 22.5, "Arbeitssatz steigt");
}
// 8
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 15, true), setTarget(8, 20), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  s.setTargetWeight(30, s.routines[0].id, s.routines[0].exercises[0].id);
  eq(w(s, 0), 15, "setTargetWeight lässt Aufwärmsatz");
  eq(w(s, 1), 30, "setTargetWeight Arbeitssatz 1");
  eq(w(s, 2), 30, "setTargetWeight Arbeitssatz 2");
}
// 9
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const exId = s.routines[0].exercises[0].id;
  const older = s.makeSession(r); older.date = new Date(1000_000).toISOString();
  const newer = s.makeSession(r); newer.date = new Date(2000_000).toISOString();
  s.saveSession(newer); s.saveSession(older);
  const h = s.history(exId);
  eq(h.length, 2, "Verlauf zählt beide");
  eq(new Date(h[0].date).getTime(), 1000_000, "ältester zuerst");
  eq(new Date(s.lastSession(exId).date).getTime(), 2000_000, "lastSession = neuster");
}
// Bonus: abgeleitete Werte
{
  const logged = { sets: [
    { reps: 8, weight: 20, isWarmup: false, completed: true },
    { reps: 10, weight: 5, isWarmup: true, completed: true },
  ]};
  eq(exerciseVolume(logged), 160, "Volumen nur Arbeitssätze");
  eq(exerciseTopWeight(logged), 20, "Top-Gewicht nur Arbeitssätze");
}

console.log(`\n${pass} Tests bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
