// model.js – reine Daten + Logik (kein DOM). Läuft im Browser und in Node.
// Portiert aus der nativen iOS-App (Models.swift / AppStore.swift / SeedData.swift).

export const STORAGE_KEYS = {
  routines: "ironjournal.routines",
  sessions: "ironjournal.sessions",
  draft: "ironjournal.draft",
};

export function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// MARK: - Konstruktoren (entsprechen den Swift-Structs)

export function setTarget(reps, weight, isWarmup = false) {
  return { id: uid(), reps, weight, isWarmup };
}

export function exercise(name, targets = [], increment = 2.5, note = "") {
  return { id: uid(), name, note, targets, increment };
}

export function routine(name, exercises = []) {
  return { id: uid(), name, exercises };
}

// MARK: - Abgeleitete Werte

export function workingSets(sets) {
  return sets.filter((s) => !s.isWarmup);
}

export function exerciseVolume(loggedExercise) {
  return workingSets(loggedExercise.sets).reduce((sum, s) => sum + s.reps * s.weight, 0);
}

export function exerciseTopWeight(loggedExercise) {
  const w = workingSets(loggedExercise.sets).map((s) => s.weight);
  return w.length ? Math.max(...w) : 0;
}

export function sessionVolume(session) {
  return session.exercises.reduce((sum, e) => sum + exerciseVolume(e), 0);
}

export function sessionCompletedSetCount(session) {
  return session.exercises.reduce(
    (sum, e) => sum + e.sets.filter((s) => s.completed && !s.isWarmup).length,
    0
  );
}

export function topTargetWeight(ex) {
  const w = ex.targets.map((t) => t.weight);
  return w.length ? Math.max(...w) : 0;
}

/// Geschätztes 1-Repetition-Maximum nach Epley: w · (1 + reps/30).
export function epley1RM(weight, reps) {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/// Bestes geschätztes 1RM über die Arbeitssätze einer geloggten Übung.
export function best1RM(loggedExercise) {
  const vals = workingSets(loggedExercise.sets).map((s) => epley1RM(s.weight, s.reps));
  return vals.length ? Math.max(...vals) : 0;
}

/// Fortschrittssignal je Einheit: bestes e1RM – bei Körpergewicht (Gewicht 0)
/// zählen die Wiederholungen, damit auch dort Fortschritt erkennbar ist.
export function progressSignal(loggedExercise) {
  const ws = workingSets(loggedExercise.sets);
  if (!ws.length) return 0;
  return Math.max(...ws.map((s) => (s.weight === 0 ? s.reps : epley1RM(s.weight, s.reps))));
}

/// Der Arbeitssatz, der das Fortschrittssignal liefert (höchstes e1RM bzw.
/// meiste Wiederholungen bei Körpergewicht). null ohne Arbeitssätze.
export function bestWorkingSet(loggedExercise) {
  let best = null, bestSig = -Infinity;
  for (const s of workingSets(loggedExercise.sets)) {
    const sig = s.weight === 0 ? s.reps : epley1RM(s.weight, s.reps);
    if (sig > bestSig) { bestSig = sig; best = s; }
  }
  return best;
}

/// Rundet auf die nächste Schrittweite (Standard 2,5 kg – gängige Hantelstufe).
export function roundToStep(value, step = 2.5) {
  if (!(step > 0)) return value;
  return Math.round(value / step) * step;
}

/// Erzeugt Aufwärmsätze (isWarmup) als aufsteigende Rampe zum Arbeitsgewicht.
/// Forschungsbasiertes Standard-Schema: 40/60/80 % des Arbeitsgewichts mit
/// absteigenden Wiederholungen (8/5/3) – der schwere Satz bahnt, ohne zu
/// ermüden. Körpergewicht (Gewicht 0) → keine prozentualen Aufwärmsätze.
///
/// opts.later = true: Für spätere Übungen derselben Einheit (Muskulatur schon
/// warm) reicht laut Evidenz ein einzelner „Einpendel“-Satz zum Finden der
/// neuen Bewegungsbahn – Standard dann 1× 60 % × 5.
export function warmupTargets(workingWeight, opts = {}) {
  const later = opts.later ?? false;
  const scheme = opts.scheme ?? (later ? [0.6] : [0.4, 0.6, 0.8]);
  const reps = opts.reps ?? (later ? [5] : [8, 5, 3]);
  const step = opts.step ?? 2.5;
  if (!(workingWeight > 0)) return [];
  return scheme.map((pct, i) =>
    setTarget(reps[Math.min(i, reps.length - 1)], roundToStep(workingWeight * pct, step), true));
}

/// Schwerstes Arbeitssatz-Gewicht (ohne Aufwärmsätze) – Basis für die Rampe.
export function topWorkingWeight(sets) {
  const w = sets.filter((s) => !s.isWarmup).map((s) => s.weight);
  return w.length ? Math.max(...w) : 0;
}

/// Lineare Regression über (t, y)-Punkte → Trend/Prognose.
/// Liefert { slope (y pro ms), intercept } oder null bei zu wenig Daten.
export function linearTrend(points) {
  const n = points.length;
  if (n < 2) return null;
  let st = 0, sy = 0, stt = 0, sty = 0;
  for (const p of points) { st += p.t; sy += p.y; stt += p.t * p.t; sty += p.t * p.y; }
  const denom = n * stt - st * st;
  if (!denom) return null;
  const slope = (n * sty - st * sy) / denom;
  return { slope, intercept: (sy - slope * st) / n };
}

/// Trainingsvolumen je Kalenderwoche (Montag-basiert) der letzten `weeks`
/// Wochen inkl. der aktuellen; älteste zuerst.
export function weeklyVolumes(sessions, weeks = 8, now = new Date()) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const start = new Date(monday);
  start.setDate(start.getDate() - (weeks - 1) * 7);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 7);
    return { start: d, volume: 0, sessions: 0 };
  });
  for (const s of sessions) {
    const idx = Math.floor((new Date(s.date) - start) / (7 * 86400000));
    if (idx >= 0 && idx < weeks) {
      buckets[idx].volume += sessionVolume(s);
      buckets[idx].sessions++;
    }
  }
  return buckets;
}

/// Startdatum (Mitternacht) für einen Zeitraum von `days` Tagen bis heute.
/// days = 0/null → null (= „alle", kein Filter).
export function rangeStart(days, now = new Date()) {
  if (!days) return null;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days + 1);
  return d;
}

/// Trainings-Heatmap: letzte `weeks` Kalenderwochen (Montag-basiert).
/// grid[woche][wochentag 0=Mo…6=So] = Trainingsvolumen des Tages (0 = kein Training).
export function trainingHeatmap(sessions, weeks = 12, now = new Date()) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const start = new Date(monday);
  start.setDate(start.getDate() - (weeks - 1) * 7);
  const grid = Array.from({ length: weeks }, () => Array(7).fill(0));
  let maxVol = 0, days = 0;
  for (const s of sessions) {
    const d = new Date(s.date); d.setHours(0, 0, 0, 0);
    const dayIdx = Math.round((d - start) / 86400000);
    if (dayIdx < 0 || dayIdx >= weeks * 7) continue;
    const wk = Math.floor(dayIdx / 7), wd = (d.getDay() + 6) % 7;
    if (grid[wk][wd] === 0) days++;
    grid[wk][wd] += sessionVolume(s);
    if (grid[wk][wd] > maxVol) maxVol = grid[wk][wd];
  }
  return { grid, start, weeks, maxVol, days };
}

/// Persönliche Bestwerte (höchstes geschätztes 1RM) je Übung, beste zuerst.
/// `fresh` = der Bestwert wurde in der jüngsten Einheit dieser Übung aufgestellt.
export function personalRecords(store) {
  const recs = [];
  for (const r of store.routines) {
    for (const ex of r.exercises) {
      const h = store.history(ex.id);
      if (!h.length) continue;
      let best = 0, bestDate = null, bestTop = 0;
      for (const e of h) {
        const v = best1RM(e.logged);
        if (v > best) { best = v; bestDate = e.date; bestTop = exerciseTopWeight(e.logged); }
      }
      if (best <= 0) continue;
      const fresh = h.at(-1).date === bestDate;
      recs.push({ routineId: r.id, exerciseId: ex.id, name: ex.name,
        e1rm: best, top: bestTop, date: bestDate, fresh });
    }
  }
  recs.sort((a, b) => b.e1rm - a.e1rm);
  return recs;
}

// MARK: - Progressive Overload

export function metAllTargets(loggedExercise, targets) {
  const wt = targets.filter((t) => !t.isWarmup);
  const ws = workingSets(loggedExercise.sets);
  if (wt.length === 0 || ws.length < wt.length) return false;
  for (let i = 0; i < wt.length; i++) {
    const set = ws[i];
    if (!set.completed || set.reps < wt[i].reps || set.weight < wt[i].weight) return false;
  }
  return true;
}

/// Wurden alle Arbeitssätze abgehakt und die Ziel-Wiederholungen der Vorgaben
/// erreicht? Das Gewicht ist bewusst egal – so greift die automatische
/// Steigerung auch nach einem Deload wieder. Zusätzliche Sätze über die
/// Vorgaben hinaus müssen das letzte Wdh-Ziel erfüllen.
export function hitRepGoals(loggedExercise, targets) {
  const goals = targets.filter((t) => !t.isWarmup);
  const ws = workingSets(loggedExercise.sets);
  if (goals.length === 0 || ws.length < goals.length) return false;
  return ws.every((s, i) => s.completed && s.reps >= goals[Math.min(i, goals.length - 1)].reps);
}

// MARK: - Store

export class Store {
  constructor(storage) {
    this.storage = storage;
    const r = this._load(STORAGE_KEYS.routines);
    const s = this._load(STORAGE_KEYS.sessions);
    this.routines = r ?? seedRoutines();
    this.sessions = s ?? [];
    if (!r || !s) this._save();
  }

  _load(key) {
    try {
      const raw = this.storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  _save() {
    this.storage.setItem(STORAGE_KEYS.routines, JSON.stringify(this.routines));
    this.storage.setItem(STORAGE_KEYS.sessions, JSON.stringify(this.sessions));
  }

  // Eine neue Einheit aus einer Routine: vorbefüllt mit den zuletzt
  // tatsächlich ausgeführten Sätzen (Fallback: Vorgaben) – bei erreichtem
  // Wiederholungsziel automatisch um die Schrittweite erhöht.
  makeSession(rt) {
    return {
      id: uid(),
      routineId: rt.id,
      routineName: rt.name,
      date: new Date().toISOString(),
      exercises: rt.exercises.map((ex) => ({
        id: uid(),
        exerciseId: ex.id,
        name: ex.name,
        sets: this._prefillSets(ex),
      })),
    };
  }

  /// Automatische Steigerung für die Vorbefüllung: die Schrittweite der
  /// Übung, wenn beim letzten Mal alle Arbeitssätze mit den
  /// Ziel-Wiederholungen abgehakt wurden – sonst 0.
  autoIncrement(ex) {
    if (!ex || ex.increment <= 0) return 0;
    const last = this.lastSession(ex.id);
    return last && hitRepGoals(last.logged, ex.targets) ? ex.increment : 0;
  }

  _prefillSets(ex) {
    const last = this.lastSession(ex.id);
    if (!last) {
      return ex.targets.map((t) => ({
        id: uid(), reps: t.reps, weight: t.weight, isWarmup: t.isWarmup, completed: false,
      }));
    }
    const inc = this.autoIncrement(ex);
    return last.logged.sets.map((s) => ({
      id: uid(),
      reps: s.reps,
      weight: s.isWarmup ? s.weight : s.weight + inc,
      isWarmup: s.isWarmup,
      completed: false,
    }));
  }

  saveSession(session) {
    const idx = this.sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) this.sessions[idx] = session;
    else this.sessions.unshift(session);
    // Bewusst KEINE automatische Gewichtserhöhung mehr: Der Tracker prüft den
    // Fortschritt (progressionStatus) und schlägt vor – erhöhen tut der Nutzer
    // selbst über applySuggestedIncrease.
    this._save();
  }

  deleteSession(id) {
    this.sessions = this.sessions.filter((s) => s.id !== id);
    this._save();
  }

  // Verlauf einer Übung, chronologisch (älteste zuerst).
  history(exerciseId) {
    return this.sessions
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((s) => {
        const logged = s.exercises.find((e) => e.exerciseId === exerciseId);
        return logged ? { id: s.id, date: s.date, logged } : null;
      })
      .filter(Boolean);
  }

  lastSession(exerciseId) {
    const h = this.history(exerciseId);
    return h.length ? h[h.length - 1] : null;
  }

  /// Prüft, ob sich der Nutzer bei einer Übung selbst steigert, und leitet
  /// daraus einen Status mit Handlungsempfehlung ab. Erhöht NICHTS automatisch.
  /// Liefert { kind, ... } mit kind ∈
  /// noData | progressing | maintaining | readyToIncrease | stalled | deloadSuggested.
  progressionStatus(ex) {
    const entries = this.history(ex.id);
    if (entries.length === 0) return { kind: "noData" };
    const last = entries[entries.length - 1];

    // 1) Bereit für mehr Gewicht? Ziel-Wdh in den letzten zwei Einheiten erreicht.
    if (ex.increment > 0 && entries.length >= 2 &&
        entries.slice(-2).every((e) => metAllTargets(e.logged, ex.targets))) {
      const base = (ex.targets.find((t) => !t.isWarmup)?.weight) ?? exerciseTopWeight(last.logged);
      return { kind: "readyToIncrease", suggested: base + ex.increment };
    }

    // 2) Festgefahren? Wie viele Einheiten ist der letzte Bestwert her?
    const signals = entries.map((e) => progressSignal(e.logged));
    let bestIdx = 0;
    for (let i = 1; i < signals.length; i++) if (signals[i] > signals[bestIdx]) bestIdx = i;
    const sinceBest = (entries.length - 1) - bestIdx;
    if (sinceBest >= 5) return { kind: "deloadSuggested", sessions: sinceBest };
    if (sinceBest >= 3) return { kind: "stalled", sessions: sinceBest };

    // 3) Fortschritt gegenüber der vorletzten Einheit?
    if (entries.length < 2) return { kind: "progressing", delta: 0 };
    const delta = progressSignal(last.logged) - progressSignal(entries[entries.length - 2].logged);
    return delta > 0.01 ? { kind: "progressing", delta } : { kind: "maintaining" };
  }

  /// Kennzahlen der letzten beiden Einheiten einer Übung – Datenbasis für die
  /// „Warum?“-Erklärung hinter der Status-Pille. null bei < 2 Einheiten.
  progressComparison(exerciseId) {
    const h = this.history(exerciseId);
    if (h.length < 2) return null;
    const metrics = (e) => {
      const ws = workingSets(e.logged.sets);
      return {
        date: e.date,
        best: bestWorkingSet(e.logged),
        e1rm: best1RM(e.logged),
        top: exerciseTopWeight(e.logged),
        reps: ws.reduce((n, s) => n + s.reps, 0),
        volume: exerciseVolume(e.logged),
        sets: ws.length,
        signal: progressSignal(e.logged),
      };
    };
    return { prev: metrics(h[h.length - 2]), last: metrics(h[h.length - 1]) };
  }

  /// Übernimmt den vorgeschlagenen Gewichtssprung (Arbeitssätze + Schrittweite).
  /// Wird ausschließlich auf ausdrückliche Nutzeraktion aufgerufen.
  applySuggestedIncrease(routineId, exerciseId) {
    const rt = this.routines.find((r) => r.id === routineId);
    if (!rt) return;
    const ex = rt.exercises.find((e) => e.id === exerciseId);
    if (!ex || ex.increment <= 0) return;
    for (const t of ex.targets) if (!t.isWarmup) t.weight += ex.increment;
    this._save();
  }

  setTargetWeight(weight, routineId, exerciseId) {
    const rt = this.routines.find((r) => r.id === routineId);
    if (!rt) return;
    const ex = rt.exercises.find((e) => e.id === exerciseId);
    if (!ex) return;
    for (const t of ex.targets) if (!t.isWarmup) t.weight = weight;
    this._save();
  }

  upsertRoutine(rt) {
    const idx = this.routines.findIndex((r) => r.id === rt.id);
    if (idx >= 0) this.routines[idx] = rt;
    else this.routines.push(rt);
    this._save();
  }

  deleteRoutine(id) {
    this.routines = this.routines.filter((r) => r.id !== id);
    this._save();
  }

  // -- Entwurf einer laufenden Einheit (übersteht Reload/App-Schließen) --

  saveDraft(session) {
    this.storage.setItem(STORAGE_KEYS.draft, JSON.stringify(session));
  }

  loadDraft() {
    return this._load(STORAGE_KEYS.draft);
  }

  clearDraft() {
    if (this.storage.removeItem) this.storage.removeItem(STORAGE_KEYS.draft);
    else this.storage.setItem(STORAGE_KEYS.draft, "");
  }

  // -- Backup --

  exportData() {
    return JSON.stringify(
      { app: "iron-journal", version: 1, exportedAt: new Date().toISOString(),
        routines: this.routines, sessions: this.sessions },
      null, 2
    );
  }

  /// Importiert ein Backup. Liefert true bei Erfolg, false bei ungültigen Daten.
  importData(json) {
    try {
      const d = JSON.parse(json);
      if (!Array.isArray(d.routines) || !Array.isArray(d.sessions)) return false;
      this.routines = d.routines;
      this.sessions = d.sessions;
      this._save();
      return true;
    } catch {
      return false;
    }
  }
}

// MARK: - Seed-Daten (aus den Notizen, identisch zur iOS-App)

export function seedRoutines() {
  const t = setTarget;
  return [
    routine("Push", [
      exercise("Brustpresse", [t(8, 15), t(8, 20), t(6, 25), t(8, 25)], 2.5),
      exercise("Fly", [t(6, 25), t(7, 25), t(8, 27.5), t(8, 27.5)], 2.5),
      exercise("Trizeps", [t(8, 16.25), t(8, 21.25), t(8, 21.25), t(8, 21.25)], 1.25),
      exercise("Seitheben", [t(10, 20), t(8, 25), t(8, 25), t(8, 25)], 2.5),
      exercise("Schulterpresse", [t(8, 7.5), t(8, 10), t(6, 10)], 2.5),
    ]),
    routine("Rücken", [
      exercise("Latzug", [t(8, 35, true), t(8, 42.5), t(10, 42.5), t(8, 42.5)], 2.5),
      exercise("Rudern", [t(8, 35), t(6, 42.5), t(5, 42.5), t(5, 42.5)], 2.5),
      exercise("Überzug", [t(8, 13.6), t(8, 15.9), t(6, 15.9), t(6, 15.9)], 2.3),
      exercise("Facepulls", [t(15, 15), t(15, 15), t(15, 15)], 2.5, "Gewicht nach Gefühl"),
      exercise("Bizeps (Preacher, Z-Stange)", [t(8, 5), t(10, 5), t(10, 5), t(12, 5)], 1.25),
    ]),
    routine("Zuhause", [exercise("Liegestütze", [t(25, 0)], 0, "Körpergewicht")]),
  ];
}

// MARK: - Formatierung (de-DE)

const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

export function fmtWeight(value) {
  if (value === 0) return "–";
  return nf.format(value) + " kg";
}

export function fmtWeightShort(value) {
  if (value === 0) return "KG"; // Körpergewicht
  return nf.format(value);
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
