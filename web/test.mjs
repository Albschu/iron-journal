// Node-Tests für den portierten Progressive-Overload-Tracker
// Ausführen:  node web/test.mjs
import {
  Store, routine, exercise, setTarget,
  exerciseVolume, exerciseTopWeight, epley1RM, best1RM, progressSignal,
  bestWorkingSet, warmupTargets, roundToStep, topWorkingWeight,
  linearTrend, weeklyVolumes, rangeStart, trainingHeatmap, personalRecords,
  workoutStats, WORKOUT_METRICS, sessionStrengthIndex, fmtVolume, fmtMetric, uid,
  liftClass, repRange, progressionPlan,
  restSeconds, nextRoutine, weekGoalStatus, sessionSummary, resolveOpenSets,
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

// ---------- Arbeitsgewicht von Hand ----------
// 3: ohne Verlauf → Vorgabe ändern
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 15, true), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  s.setTargetWeight(30, r.id, ex0(s).id);
  eq(w(s, 0), 15, "Aufwärmsatz bleibt");
  eq(s.makeSession(r).exercises[0].sets[1].weight, 30, "ohne Verlauf: neue Vorgabe wird vorbefüllt");
}
// 4: mit Verlauf → gilt für die nächste Einheit, danach wieder Automatik
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[8, 20, true], [8, 20, true]]);
  s.setTargetWeight(25, r.id, ex0(s).id);
  const ses = s.makeSession(r);
  eq(ses.exercises[0].sets[0].weight, 25, "von Hand gesetztes Gewicht wird vorbefüllt");
  eq(ses.exercises[0].sets[1].weight, 25, "für alle Arbeitssätze");
  ses.date = new Date(2000).toISOString(); completeAllWorking(ses); s.saveSession(ses);
  eqs(ex0(s).nextWeight, undefined, "nach dem Training erledigt");
}

// ---------- Doppelprogression: Spanne ----------
{
  eqs(JSON.stringify(repRange(exercise("Brustpresse", [setTarget(8, 15), setTarget(8, 20), setTarget(6, 25), setTarget(8, 25)]))),
    '{"min":8,"max":12}', "Spanne aus häufigster Ziel-Wdh (8) → 8–12");
  eqs(JSON.stringify(repRange(exercise("Rudern", [setTarget(8, 35), setTarget(6, 40), setTarget(5, 40), setTarget(5, 40)]))),
    '{"min":5,"max":9}', "Rudern: meist 5 → 5–9");
  const own = exercise("Seitheben", [setTarget(8, 10)]); own.repRange = { min: 10, max: 15 };
  eqs(JSON.stringify(repRange(own)), '{"min":10,"max":15}', "eigene Spanne gewinnt");
}

// ---------- Doppelprogression: Vorbefüllung ----------
// P1: ohne Verlauf → Vorgaben
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 15, true), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r);
  eq(ses.exercises[0].sets.length, 2, "Vorbefüllung ohne Verlauf: Satzanzahl aus Vorgaben");
  eq(ses.exercises[0].sets[1].weight, 20, "Vorbefüllung ohne Verlauf: Gewicht aus Vorgaben");
  eqs(s.plan(ex0(s)).kind, "start", "Plan: start");
}
// P2: unter der Obergrenze → gleiches Gewicht, +1 Wdh je Satz
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 15, true), setTarget(8, 20), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r);
  ses.exercises[0].sets[1].completed = true; ses.exercises[0].sets[2].completed = true;
  ses.exercises[0].sets[2].reps = 7;
  s.saveSession(ses);
  const next = s.makeSession(r);
  eqs(s.plan(ex0(s)).kind, "reps", "Plan: Wdh steigern");
  eq(next.exercises[0].sets[0].weight, 15, "Aufwärmsatz unverändert");
  eq(next.exercises[0].sets[0].reps, 8, "Aufwärm-Wdh unverändert");
  eq(next.exercises[0].sets[1].weight, 20, "gleiches Gewicht");
  eq(next.exercises[0].sets[1].reps, 9, "8 → Ziel 9");
  eq(next.exercises[0].sets[2].reps, 8, "7 → Ziel 8");
  eqs(next.exercises[0].sets[1].completed, false, "vorbefüllte Sätze sind nicht abgehakt");
}
// P3: Wdh-Ziel wird an der Obergrenze gedeckelt
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[12, 20, true], [11, 20, true]]);
  const next = s.makeSession(r);
  eq(next.exercises[0].sets[0].reps, 12, "an der Obergrenze bleibt 12");
  eq(next.exercises[0].sets[1].reps, 12, "11 → 12");
  eq(next.exercises[0].sets[1].weight, 20, "noch nicht alle Sätze oben → Gewicht bleibt");
}
// P4: alle Sätze an der Obergrenze → +1 Schritt, zurück auf Untergrenze
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 15, true), setTarget(8, 20), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  const ses = s.makeSession(r);
  ses.exercises[0].sets = [
    { id: "w", reps: 8, weight: 15, isWarmup: true, completed: false },
    { id: "a", reps: 12, weight: 20, isWarmup: false, completed: true },
    { id: "b", reps: 13, weight: 20, isWarmup: false, completed: true },
  ];
  s.saveSession(ses);
  const p = s.plan(ex0(s));
  eqs(p.kind, "up", "Plan: Gewicht hoch");
  eq(p.to, 22.5, "genau ein Schritt");
  const next = s.makeSession(r);
  eq(next.exercises[0].sets[0].weight, 15, "Aufwärmsatz bleibt");
  eq(next.exercises[0].sets[1].weight, 22.5, "Arbeitssatz +2,5 kg");
  eq(next.exercises[0].sets[2].reps, 8, "Wdh zurück auf Untergrenze");
}
// P5: Obergrenze, aber Satz nicht abgehakt bzw. zu wenige Sätze → keine Erhöhung
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[12, 20, true], [12, 20, false]]);
  eqs(s.plan(ex0(s)).kind, "reps", "nicht abgehakt → keine Erhöhung");
  logSession(s, r, 2000, [[12, 20, true]]);
  eq(s.makeSession(r).exercises[0].sets.length, 2, "fehlender Satz ergänzt");
  eqs(s.plan(ex0(s)).kind, "reps", "nur 1 von 2 Sätzen → keine Erhöhung");
}
// P6: zweimal in Folge unter der Untergrenze → einen Schritt zurück (einmal nicht)
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 30), setTarget(8, 30)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[6, 30, true], [5, 30, true]]);
  eqs(s.plan(ex0(s)).kind, "reps", "ein schlechter Tag ändert nichts");
  logSession(s, r, 2000, [[7, 30, true], [6, 30, true]]);
  const p = s.plan(ex0(s));
  eqs(p.kind, "down", "zweimal zu schwer → runter");
  eq(p.to, 27.5, "einen Schritt");
  const next = s.makeSession(r);
  eq(next.exercises[0].sets[0].weight, 27.5, "vorbefüllt mit 27,5 kg");
  eq(next.exercises[0].sets[0].reps, 8, "Wdh auf Untergrenze");
}
// P7: Körpergewicht → immer +1 Wdh, nie Gewicht
{
  const r = routine("Zuhause", [exercise("Liegestütze", [setTarget(25, 0)], 0)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[30, 0, true]]);
  const next = s.makeSession(r);
  eq(next.exercises[0].sets[0].weight, 0, "Körpergewicht bleibt 0");
  eq(next.exercises[0].sets[0].reps, 31, "+1 Wdh, ohne Obergrenze");
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
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(5, 100)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[5, 100, true]]);
  logSession(s, r, 2000, [[5, 105, true]]);
  const st = s.progressionStatus(ex0(s));
  eqs(st.kind, "progressing", "progressing bei steigendem e1RM");
}
// 7: maintaining
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(5, 100)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[5, 100, true]]);
  logSession(s, r, 2000, [[5, 100, true]]);
  eqs(s.progressionStatus(ex0(s)).kind, "maintaining", "maintaining bei gleichem e1RM");
}
// 8: stalled
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(5, 100)], 2.5)]);
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
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(5, 100)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[5, 100, true]]);
  for (let i = 1; i <= 5; i++) logSession(s, r, 1000 + i * 1000, [[5, 95, true]]);
  const st = s.progressionStatus(ex0(s));
  eqs(st.kind, "deloadSuggested", "deloadSuggested nach 5 Einheiten");
  eq(st.sessions, 5, "deload zählt 5 Einheiten");
}
// 10: readyToIncrease = alle Sätze an der Obergrenze
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[12, 20, true]]);
  const st = s.progressionStatus(ex0(s));
  eqs(st.kind, "readyToIncrease", "readyToIncrease an der Obergrenze");
  eq(st.suggested, 22.5, "nächstes Mal 22,5 kg");
}
// 10b: tooHeavy
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 30)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[5, 30, true]]);
  logSession(s, r, 2000, [[6, 30, true]]);
  eqs(s.progressionStatus(ex0(s)).kind, "tooHeavy", "zweimal unter der Spanne → zu schwer");
}
// 11: Körpergewicht → kein readyToIncrease (increment 0)
{
  const r = routine("Zuhause", [exercise("Liegestütze", [setTarget(25, 0)], 0)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[25, 0, true]]);
  logSession(s, r, 2000, [[25, 0, true]]);
  eqs(s.progressionStatus(ex0(s)).kind, "maintaining", "Körpergewicht: kein Gewichtsvorschlag");
}

// 11b: Live-Status – die laufende Einheit zählt als neueste mit
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(5, 100)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[5, 100, true]]);
  logSession(s, r, 2000, [[5, 95, true]]);
  logSession(s, r, 3000, [[5, 95, true]]);
  logSession(s, r, 4000, [[5, 95, true]]);
  eqs(s.progressionStatus(ex0(s)).kind, "stalled", "gespeichert: stagniert");
  const live = s.makeSession(r);
  live.date = new Date(5000_000).toISOString();
  live.exercises[0].sets = [{ id: "x", reps: 5, weight: 95, isWarmup: false, completed: false }];
  eqs(s.progressionStatus(ex0(s), live).kind, "stalled", "live gleiches Gewicht → weiter stagniert");
  live.exercises[0].sets[0].weight = 102.5;
  const st = s.progressionStatus(ex0(s), live);
  eqs(st.kind, "progressing", "live mehr Gewicht → Fortschritt statt stagniert");
  eq(st.delta, epley1RM(102.5, 5) - epley1RM(95, 5), "Delta gegenüber letzter Einheit");
  eqs(s.progressionStatus(ex0(s)).kind, "stalled", "ohne Live-Einheit unverändert");
  const cmp = s.progressComparison(ex0(s).id, live);
  eq(cmp.last.top, 102.5, "Warum-Vergleich nutzt die Live-Einheit");
  // Bereits gespeicherte Einheit erneut bearbeitet → ersetzt, nicht doppelt gezählt.
  const saved = s.sessions[0];
  const edit = JSON.parse(JSON.stringify(saved));
  edit.exercises[0].sets[0].weight = 102.5;
  eqs(s.progressionStatus(ex0(s), edit).kind, "progressing", "Live-Fassung ersetzt die gespeicherte");
}

// 11c: Übungsklassen
{
  eqs(liftClass("Kniebeugen"), "lower", "Kniebeugen = Unterkörper");
  eqs(liftClass("Beinstrecker"), "small", "Beinstrecker = Isolation (vor Unterkörper geprüft)");
  eqs(liftClass("Bankdrücken"), "upper", "Standard = Oberkörper-Grundübung");
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

// Aufwärmsätze (Rampe zum Arbeitsgewicht)
{
  eq(roundToStep(34, 2.5), 35, "roundToStep rundet auf 2,5er-Schritt");
  eq(roundToStep(25.5, 2.5), 25, "roundToStep rundet ab");
  eqs(roundToStep(17, 0), 17, "roundToStep step 0 → unverändert");

  eq(topWorkingWeight([
    { weight: 15, isWarmup: true }, { weight: 42.5, isWarmup: false }, { weight: 40, isWarmup: false },
  ]), 42.5, "topWorkingWeight ignoriert Aufwärmsätze, nimmt Maximum");

  const w = warmupTargets(42.5);
  eq(w.length, 3, "Standard-Rampe hat 3 Aufwärmsätze");
  eqs(w.every((t) => t.isWarmup), true, "alle erzeugten Sätze sind Aufwärmsätze");
  eq(w[0].weight, roundToStep(42.5 * 0.4), "Satz 1 = 40 % gerundet");
  eq(w[1].weight, roundToStep(42.5 * 0.6), "Satz 2 = 60 % gerundet");
  eq(w[2].weight, roundToStep(42.5 * 0.8), "Satz 3 = 80 % gerundet");
  eqs(w[0].reps >= w[1].reps && w[1].reps >= w[2].reps, true, "Wiederholungen steigen ab");
  eq(warmupTargets(0).length, 0, "Körpergewicht (0 kg) → keine Aufwärmsätze");
  eq(warmupTargets(100, { scheme: [0.5], reps: [6] })[0].weight, 50, "eigenes Schema wird genutzt");

  // Spätere Übung derselben Einheit: nur 1 Einpendel-Satz (60 %).
  const late = warmupTargets(42.5, { later: true });
  eq(late.length, 1, "spätere Übung: nur 1 Aufwärmsatz");
  eq(late[0].weight, roundToStep(42.5 * 0.6), "Einpendel-Satz = 60 % gerundet");
  eqs(late[0].isWarmup, true, "Einpendel-Satz ist Aufwärmsatz");
  eq(warmupTargets(0, { later: true }).length, 0, "Körpergewicht auch später → keine Sätze");
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

// Statistik je Workout-Art
{
  const push = routine("Push", [exercise("Bank", [setTarget(10, 50)], 2.5)]);
  const pull = routine("Pull", [exercise("Rudern", [setTarget(10, 40)], 2.5)]);
  const s = freshStore([push, pull]);
  const day = (n) => new Date(2026, 5, n, 12).toISOString();
  const log = (rt, dateIso, reps, weight) => {
    const ses = s.makeSession(rt);
    ses.date = dateIso;
    ses.exercises[0].sets = [{ id: uid(), reps, weight, isWarmup: false, completed: true }];
    s.saveSession(ses);
  };
  // Push: 3 Einheiten über 3 Wochen mit steigendem Volumen; Pull: 1 Einheit.
  log(push, day(1), 10, 50);   // Volumen 500
  log(push, day(8), 10, 60);   // 600
  log(push, day(15), 10, 70);  // 700
  log(pull, day(2), 10, 40);   // 400

  const stats = workoutStats(s.sessions);
  eq(stats.length, 2, "eine Zeile je Workout-Art");
  eqs(stats[0].name, "Push", "meist-trainiertes Workout zuerst");
  eq(stats[0].count, 3, "Push hat 3 Einheiten");
  eq(stats[0].avg, 600, "Ø Volumen Push");
  eq(stats[0].last, 700, "letztes Volumen Push");
  eq(stats[0].best, 700, "bestes Volumen Push");
  eqs(stats[0].perWeek > 99 && stats[0].perWeek < 101, true, "Trend ≈ +100 kg Volumen/Woche");
  eq(stats[1].count, 1, "Pull hat 1 Einheit");
  eqs(stats[1].perWeek, null, "kein Trend bei einer einzelnen Einheit");

  // Kraft-Index: Summe der besten e1RM je Übung (hier eine Übung).
  const st = workoutStats(s.sessions, { metric: "strength" });
  const pushSt = st.find((w) => w.name === "Push");
  eq(pushSt.last, epley1RM(70, 10), "Kraft-Index = e1RM des besten Satzes");

  // Zeitraum-Filter schneidet ältere Einheiten ab.
  const only15 = workoutStats(s.sessions, { start: new Date(2026, 5, 10) });
  eq(only15.length, 1, "nur Push liegt im Zeitraum ab 10.6.");
  eq(only15[0].count, 1, "eine Push-Einheit im Zeitraum");

  // Gruppierung bleibt stabil, wenn eine Routine umbenannt/gelöscht wird:
  // der Name der jüngsten Einheit gewinnt, der Verlauf bleibt zusammen.
  s.sessions.find((x) => x.date === day(15)).routineName = "Push A";
  const renamed = workoutStats(s.sessions);
  eq(renamed.find((w) => w.name === "Push A").count, 3, "umbenanntes Workout behält seinen Verlauf");

  eqs(fmtVolume(12500), "12,5 t", "großes Volumen kompakt in Tonnen");
  eqs(fmtVolume(700), "700 kg", "kleines Volumen in kg");
  eqs(fmtMetric(3, WORKOUT_METRICS.sets), "3", "Sätze ohne Einheit");
}

// ---------- Quality-of-Life ----------
// Pausenzeit nach Übungsart
{
  eq(restSeconds("Kniebeuge"), 180, "Unterkörper-Grundübung: 3 min Pause");
  eq(restSeconds("Brustpresse"), 150, "Oberkörper-Grundübung: 2:30 Pause");
  eq(restSeconds("Seitheben"), 90, "Isolationsübung: 90 s Pause");
}
// Rotation: nächstes Workout
{
  const a = routine("Push", [exercise("A", [setTarget(8, 10)])]);
  const b = routine("Rücken", [exercise("B", [setTarget(8, 10)])]);
  const leer = routine("Leer", []);
  const s = freshStore([a, b, leer]);
  eqs(nextRoutine(s.routines, s.sessions).name, "Push", "ohne Verlauf: erstes Workout");
  logSession(s, a, 1000, [[8, 10, true]]);
  eqs(nextRoutine(s.routines, s.sessions).name, "Rücken", "nach Push folgt Rücken");
  const ses = s.makeSession(b); ses.date = new Date(2000).toISOString(); s.saveSession(ses);
  eqs(nextRoutine(s.routines, s.sessions).name, "Push", "Rotation zyklisch, leere Workouts übersprungen");
}
// Wochenziel & Serie
{
  const now = new Date(2026, 9, 14, 12); // Mi
  const at = (y, m, d) => ({ id: uid(), date: new Date(y, m, d, 10).toISOString(), exercises: [] });
  const sessions = [
    at(2026, 9, 12), at(2026, 9, 13),                     // diese Woche: 2
    at(2026, 9, 5), at(2026, 9, 7), at(2026, 9, 9),      // letzte Woche: 3
    at(2026, 8, 29), at(2026, 8, 30), at(2026, 9, 2),    // vorletzte: 3
    at(2026, 8, 22),                                     // davor: 1 → Serie endet
  ];
  const g = weekGoalStatus(sessions, 3, now);
  eq(g.thisWeek, 2, "2 Einheiten diese Woche");
  eq(g.streak, 2, "offene Woche bricht die Serie nicht: 2 Wochen");
  sessions.push(at(2026, 9, 14));
  eq(weekGoalStatus(sessions, 3, now).streak, 3, "Ziel diese Woche erreicht → zählt mit");
}
// Übersprungene Übung zählt nicht in den Verlauf
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[8, 20, true]]);
  const ses = s.makeSession(r); ses.date = new Date(2000).toISOString();
  ses.exercises[0].sets = []; ses.exercises[0].skipped = true;
  s.saveSession(ses);
  eq(s.history(ex0(s).id).length, 1, "übersprungene Übung erzeugt keinen Verlaufseintrag");
}
// Ausgelassene Sätze: Vorbefüllung fällt nicht unter die Vorgabe
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20), setTarget(8, 20), setTarget(6, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[8, 25, true]]);   // nur 1 von 3 Sätzen gemacht
  const next = s.makeSession(r);
  eq(next.exercises[0].sets.length, 3, "fehlende Sätze aus der Vorgabe ergänzt");
  eq(next.exercises[0].sets[2].weight, 25, "mit dem letzten Arbeitsgewicht");
  eq(next.exercises[0].sets[2].reps, 7, "Ziel-Wdh der Vorgabe (6) +1");
}
// Deload per Tipp
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(5, 100)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[5, 100, true]]);
  for (let i = 1; i <= 5; i++) logSession(s, r, 1000 + i * 1000, [[5, 95, true]]);
  eqs(s.progressionStatus(ex0(s)).kind, "deloadSuggested", "Ausgangslage: Deload sinnvoll");
  s.scheduleDeload(ex0(s).id);
  eqs(s.progressionStatus(ex0(s)).kind, "deloadPlanned", "Deload vorgemerkt");
  const dl = s.makeSession(r);
  eq(dl.exercises[0].sets[0].weight, 85, "Deload: 95 kg × 0,9 = 85,5 → auf 2,5 gerundet 85");
  eqs(dl.exercises[0].deload, true, "geloggte Übung als Deload markiert");
  dl.date = new Date(9000).toISOString(); completeAllWorking(dl); s.saveSession(dl);
  eqs(ex0(s).deloadNext, undefined, "Vormerkung nach dem Speichern erledigt");
  eqs(s.progressionStatus(ex0(s)).kind, "deloaded", "nach dem Deload: frischer Start");
  const after = s.makeSession(r);
  eq(after.exercises[0].sets[0].weight, 95, "danach geht es mit dem Gewicht von vor dem Deload weiter");
  eqs(s.plan(ex0(s)).kind, "reps", "nach dem Deload: normal weiter mit Wdh-Steigerung");
  s.scheduleDeload(ex0(s).id); s.scheduleDeload(ex0(s).id, false);
  eqs(ex0(s).deloadNext, undefined, "Deload-Vormerkung zurücknehmbar");
}
// Zusammenfassung + offene Sätze
{
  const r = routine("Push", [exercise("Bankdrücken", [setTarget(8, 20), setTarget(8, 20)], 2.5)]);
  const s = freshStore([r]);
  logSession(s, r, 1000, [[8, 20, true], [8, 20, true]]);
  const ses = s.makeSession(r);
  ses.date = new Date(100000).toISOString();
  ses.endDate = new Date(100000 + 45 * 60000).toISOString();
  ses.exercises[0].sets = [
    { id: "a", reps: 8, weight: 25, isWarmup: false, completed: true },
    { id: "b", reps: 8, weight: 25, isWarmup: false, completed: false },
  ];
  const sum = sessionSummary(s, ses);
  eq(sum.duration, 45 * 60, "Dauer aus Start/Ende");
  eq(sum.volume, 200, "Volumen zählt nur abgehakte Sätze");
  eq(sum.setsOpen, 1, "ein offener Satz");
  eq(sum.prs.length, 1, "neuer Bestwert erkannt");
  eq(sum.prev.volume, 320, "Vergleich zur letzten Einheit desselben Workouts");
  const copy = structuredClone(ses);
  resolveOpenSets(copy, "drop");
  eq(copy.exercises[0].sets.length, 1, "offene Sätze verwerfen");
  resolveOpenSets(ses, "complete");
  eqs(ses.exercises[0].sets[1].completed, true, "offene Sätze abhaken");
}

console.log(`\n${pass} Tests bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
