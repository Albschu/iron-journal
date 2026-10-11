import {
  Store, routine as mkRoutine, exercise as mkExercise, setTarget as mkTarget,
  exerciseVolume, exerciseTopWeight, sessionVolume, sessionCompletedSetCount,
  topTargetWeight, workingSets, best1RM, linearTrend,
  warmupTargets, topWorkingWeight,
  rangeStart, trainingHeatmap, personalRecords,
  workoutStats, WORKOUT_METRICS, LIFT_CLASSES,
  restSeconds, nextRoutine, weekGoalStatus, sessionSummary, resolveOpenSets,
  fmtWeight, fmtWeightShort, fmtDate, fmtMetric,
} from "./model.js";
import { createSync } from "./sync.js";

const store = new Store(window.localStorage);
// Automatisches Backup ins GitHub-Gist (falls verbunden): jede gespeicherte
// Änderung löst einen Upload aus. Status-Text im Dashboard live nachziehen.
const sync = createSync(store, () => {
  for (const id of ["sync-status", "gist-status"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = syncStatusText();
  }
});
store.onChange = () => sync.markChanged();
// Browser bitten, die Daten nicht bei Speicherknappheit zu löschen.
try { navigator.storage?.persist?.(); } catch { /* egal */ }
const screen = document.getElementById("screen");
const modalRoot = document.getElementById("modal-root");
let activeTab = "training";

// ---------- Helfer ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };
const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const plural = (n, sing, plu) => `${n} ${n === 1 ? sing : plu}`;

function relDate(iso) {
  const days = Math.round((Date.now() - new Date(iso)) / 86400000);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 14) return "vor 1 Woche";
  if (days < 30) return `vor ${Math.floor(days / 7)} Wochen`;
  return fmtDate(iso);
}

function fmtDuration(secs) {
  const m = Math.round(secs / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

function fmtClock(totalSecs) {
  const m = Math.floor(totalSecs / 60), s = totalSecs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------- Steigerungs-Status (Tracker) ----------
// status = { kind, ... } aus store.progressionStatus(ex).
const STATUS_META = {
  noData:          { label: "Keine Daten",     cls: "" },
  progressing:     { label: "Fortschritt",     cls: "prog" },
  maintaining:     { label: "Gehalten",        cls: "hold" },
  readyToIncrease: { label: "Bereit für mehr", cls: "ready" },
  stalled:         { label: "Stagniert",       cls: "stall" },
  deloadSuggested: { label: "Deload sinnvoll", cls: "deload" },
  deloadPlanned:   { label: "Deload geplant",  cls: "deload" },
  deloaded:        { label: "Nach Deload",     cls: "hold" },
};
const STATUS_PRIORITY = { deloadSuggested: 0, stalled: 1, readyToIncrease: 2, deloadPlanned: 3, deloaded: 4, maintaining: 5, progressing: 6, noData: 7 };

// ids = { r: routineId, e: exerciseId } macht die Pille antippbar:
// ein Tipp öffnet die „Warum?“-Erklärung (Vergleich der letzten zwei Einheiten).
function statusPill(st, ids) {
  const m = STATUS_META[st.kind];
  if (!m || st.kind === "noData") return "";
  const tap = ids ? ` data-why-r="${ids.r}" data-why-e="${ids.e}" title="Antippen: Warum dieser Status?"` : "";
  return `<span class="pill ${m.cls}"${tap}>${m.label}${ids ? `<span class="pill-i">ⓘ</span>` : ""}</span>`;
}

function statusDetail(st) {
  switch (st.kind) {
    case "noData":
      return "Sobald du diese Übung trainierst, prüft die App, ob du dich steigerst.";
    case "progressing":
      return st.delta > 0.01
        ? `Stärker als zuletzt (+${fmtWeight(st.delta)} e1RM). Weiter so 💪`
        : "Basis erfasst – ab jetzt zählt jede Steigerung.";
    case "maintaining":
      return "Gehalten – kein klarer Fortschritt. Versuch nächstes Mal +1 Wiederholung.";
    case "readyToIncrease":
      return `Ziel-Wiederholungen zweimal erreicht. Zeit für mehr Gewicht: +${fmtWeightShort(st.delta)} kg → ${fmtWeight(st.suggested)}${st.pct ? ` (+${pctTxt(st.pct)})` : ""}.`;
    case "stalled":
      return `Seit ${st.sessions} Einheiten kein neuer Bestwert. Variiere Wdh/Tempo oder leg einen Deload ein.`;
    case "deloadSuggested":
      return `Seit ${st.sessions} Einheiten festgefahren. Plane einen Deload (−10 % für eine Einheit) und greif dann frisch an.`;
    case "deloadPlanned":
      return "Nächste Einheit mit −10 % Gewicht – danach geht es mit dem alten Gewicht weiter.";
    case "deloaded":
      return "Deload erledigt. Jetzt mit dem Gewicht von davor frisch angreifen.";
    default:
      return "";
  }
}

// ---------- Erhöhungsvorschlag (wie viel mehr Gewicht?) ----------
function pctTxt(p) { return `${nf.format(p * 100)} %`; }

// Kurze Zeile unter der Übung in der laufenden Einheit (live).
function suggestionLine(sug) {
  if (!sug) return "";
  if (sug.bodyweight) {
    return sug.ready ? `💡 Ziel 2× geschafft – steigere die Wiederholungen (+1 je Satz).` : "";
  }
  const amount = `+${fmtWeightShort(sug.delta)} kg → ${fmtWeight(sug.to)} (+${pctTxt(sug.pct)})`;
  if (sug.ready) {
    return `💡 Nächstes Mal: <b>${amount}</b>` +
      (sug.bigStep ? ` · großer Sprung – alternativ erst +1–2 Wdh` : "");
  }
  return `💡 Nächste Erhöhung: ${amount}, sobald alle Sätze ihre Ziel-Wdh schaffen (${sug.streak}/2 Einheiten)`;
}

// Ausführliche Begründung im „Warum?“-Dialog.
function suggestionSection(ex, live = null) {
  const sug = store.increaseSuggestion(ex, live);
  if (!sug || sug.bodyweight) return "";
  const cls = LIFT_CLASSES[sug.cls];
  const range = `${pctTxt(cls.lo)}–${pctTxt(cls.hi)}, max. ${fmtWeightShort(cls.maxKg)} kg`;
  const surplusTxt = sug.surplus > 0
    ? `Dein schwächster Satz lag ${sug.surplus} Wdh über dem Ziel – nach Epley entspricht das ≈ +${pctTxt(sug.dataPct)} Reserve.`
    : `Du hast das Ziel genau erreicht (keine Extra-Wdh) – daher der untere Rand der Spanne.`;
  const when = sug.ready
    ? `Ziel in 2 Einheiten in Folge erreicht → jetzt erhöhen.`
    : `Erst erhöhen, wenn alle Arbeitssätze in 2 Einheiten in Folge die Ziel-Wdh schaffen (aktuell ${sug.streak}/2).`;
  return `<div class="section-title">Vorschlag: ${sug.ready ? "jetzt" : "nächste"} Erhöhung</div>
    <div class="card">
      <div class="why-head">+${fmtWeightShort(sug.delta)} kg → ${fmtWeight(sug.to)} (+${pctTxt(sug.pct)})</div>
      <div class="why-row wrap"><span class="why-l">Wann</span><span class="why-m">${when}</span></div>
      <div class="why-row wrap"><span class="why-l">Spanne</span><span class="why-m">${esc(cls.label)}: ${range}</span></div>
      <div class="why-row wrap"><span class="why-l">Deine Daten</span><span class="why-m">${surplusTxt}</span></div>
      ${sug.bigStep ? `<div class="why-row wrap"><span class="why-l">Hinweis</span><span class="why-m">Schon der kleinste Schritt (${fmtWeightShort(sug.delta)} kg = ${pctTxt(sug.pct)}) liegt über der Spanne. Alternativ erst die Wdh um 1–2 steigern (Doppelprogression) – das wirkt laut Studien ähnlich gut.</span></div>` : ""}
    </div>
    <div class="why-note">Grundlage: ACSM Position Stand 2009 (+2–10 %, sobald die Ziel-Wdh in zwei Einheiten in Folge
      geschafft werden; kleinere Sprünge für kleine Muskelgruppen), NSCA „2-for-2“-Regel (Oberkörper ≈ +1–4 kg,
      Unterkörper ≈ +2–7 kg), Plotkin et al. 2022 (Wdh- und Laststeigerung ähnlich wirksam). Gerundet auf die
      Schrittweite der Übung.</div>`;
}

// ---------- „Warum?“ – was hat sich zur vorletzten Einheit verändert? ----------
// Benennt in einem Satz, WARUM der Tracker „stärker“ sagt: mehr Gewicht,
// mehr Wiederholungen oder die Kombination (bewertet über das e1RM des besten Satzes).
function whyHeadline(cmp) {
  const a = cmp.prev.best, b = cmp.last.best;
  if (!a || !b) return "Zu wenige Arbeitssätze für einen direkten Vergleich.";
  const d = cmp.last.signal - cmp.prev.signal;
  const bodyweight = a.weight === 0 && b.weight === 0;
  if (d > 0.01) {
    if (bodyweight)
      return `Du bist stärker, weil du mehr Wiederholungen geschafft hast: ${a.reps} → ${b.reps}.`;
    if (b.weight > a.weight && b.reps > a.reps)
      return `Du bist stärker, weil du mehr Gewicht (${fmtWeight(a.weight)} → ${fmtWeight(b.weight)}) UND mehr Wiederholungen (${a.reps} → ${b.reps}) geschafft hast.`;
    if (b.weight > a.weight && b.reps >= a.reps)
      return `Du bist stärker, weil du mehr Gewicht bewegt hast: ${fmtWeight(a.weight)} → ${fmtWeight(b.weight)} bei ${b.reps} Wiederholungen.`;
    if (b.weight === a.weight && b.reps > a.reps)
      return `Du bist stärker, weil du bei ${fmtWeight(b.weight)} mehr Wiederholungen geschafft hast: ${a.reps} → ${b.reps}.`;
    if (b.weight > a.weight)
      return `Du bist stärker: mehr Gewicht (${fmtWeight(a.weight)} → ${fmtWeight(b.weight)}) trotz weniger Wiederholungen (${a.reps} → ${b.reps}) – unterm Strich +${nf.format(d)} kg e1RM.`;
    return `Du bist stärker: weniger Gewicht, aber deutlich mehr Wiederholungen (${a.reps} → ${b.reps}) – unterm Strich +${nf.format(d)} kg e1RM.`;
  }
  if (d < -0.01)
    return `Dein bester Satz war etwas schwächer als zuletzt (${bodyweight ? `${a.reps} → ${b.reps} Wdh` : `−${nf.format(Math.abs(d))} kg e1RM`}).`;
  return "Dein bester Satz war genauso stark wie beim letzten Mal.";
}

function whyRow(label, aTxt, bTxt, delta, unit) {
  const chip = delta > 0.005
    ? `<span class="why-d up">+${nf.format(delta)}${unit}</span>`
    : delta < -0.005
      ? `<span class="why-d down">−${nf.format(Math.abs(delta))}${unit}</span>`
      : `<span class="why-d flat">±0</span>`;
  return `<div class="why-row"><span class="why-l">${label}</span><span class="why-m">${aTxt} → ${bTxt}</span>${chip}</div>`;
}

// Vergleichskarte „vorletzte → letzte Einheit“ mit allen Metriken.
function whySection(exerciseId, live = null) {
  const cmp = store.progressComparison(exerciseId, live);
  if (!cmp) {
    return `<div class="why-note">Für den Vergleich braucht es mindestens zwei Einheiten dieser Übung.</div>`;
  }
  const { prev, last } = cmp;
  const bodyweight = prev.best?.weight === 0 && last.best?.weight === 0;
  const setTxt = (m) => (m.best ? `${m.best.reps}×${fmtWeightShort(m.best.weight)}` : "–");

  let rows = whyRow("Bester Satz", setTxt(prev), setTxt(last),
    last.signal - prev.signal, bodyweight ? " Wdh" : " kg");
  if (!bodyweight) {
    rows += whyRow("Geschätztes 1RM", nf.format(prev.e1rm), `${nf.format(last.e1rm)} kg`,
      last.e1rm - prev.e1rm, " kg");
    rows += whyRow("Schwerster Satz", nf.format(prev.top), `${nf.format(last.top)} kg`,
      last.top - prev.top, " kg");
  }
  rows += whyRow("Wiederholungen gesamt", prev.reps, last.reps, last.reps - prev.reps, "");
  if (!bodyweight) {
    rows += whyRow("Volumen (Wdh × kg)", Math.round(prev.volume), `${Math.round(last.volume)} kg`,
      Math.round(last.volume - prev.volume), " kg");
  }
  rows += whyRow("Arbeitssätze", prev.sets, last.sets, last.sets - prev.sets, "");

  return `<div class="section-title">Vergleich: ${fmtDate(prev.date)} → ${fmtDate(last.date)}</div>
    <div class="card">
      <div class="why-head">${esc(whyHeadline(cmp))}</div>
      ${rows}
    </div>
    <div class="why-note">Maßstab für „stärker“ ist dein bester Arbeitssatz, bewertet über das geschätzte
      1-Wiederholungs-Maximum (Epley: Gewicht × (1 + Wdh ÷ 30)). So zählt mehr Gewicht genauso wie mehr
      Wiederholungen. Bei Körpergewichtsübungen zählen die Wiederholungen direkt.</div>`;
}

// Modal hinter der antippbaren Status-Pille.
// live: laufende Einheit → Status/Vergleich inkl. der gerade eingetragenen Sätze.
function openWhy(routineId, exerciseId, live = null) {
  const ex = store.exercise(exerciseId);
  if (!ex) return;
  const st = store.progressionStatus(ex, live);
  const label = STATUS_META[st.kind]?.label ?? "Status";
  const statusCard = `<div class="card"><div class="row" style="border:none;cursor:default">
    <span class="grow"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><h3>${esc(ex.name)}</h3>${statusPill(st)}</div>
      <div class="sub" style="margin-top:4px">${esc(statusDetail(st))}</div></span></div></div>`;
  openModal(`Warum „${label}“?`, statusCard + suggestionSection(ex, live) + whySection(exerciseId, live), { single: true });
}

// Inline-SVGs für leere Zustände (statt system-abhängiger Emojis)
const ICO_DUMBBELL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 9v6M7 6.5v11M17 6.5v11M20 9v6M7 12h10"/></svg>`;
const ICO_CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v4.5l3 2"/></svg>`;

// Zahlenfelder: beim Fokus alles markieren → schnelles Überschreiben im Gym.
document.addEventListener("focusin", (e) => {
  if (e.target.matches('input[type="number"]')) e.target.select();
});

// ---------- Tab-Routing ----------
function render() {
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === activeTab));
  if (activeTab === "training") renderTraining();
  else if (activeTab === "verlauf") renderVerlauf();
  else if (activeTab === "steigerung") renderSteigerung();
  else renderDashboard();
  screen.scrollTop = 0;
}

document.getElementById("tabbar").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (tab) { activeTab = tab.dataset.tab; render(); }
});

// ---------- Tab: Training ----------
function renderTraining() {
  const draft = store.loadDraft();
  const draftHtml = draft ? `
    <div class="card banner">
      <button class="row" data-action="resume-draft">
        <span class="grow">
          <h3>▶ Angefangene Einheit fortsetzen</h3>
          <div class="sub">${esc(draft.routineName)} · gestartet ${relDate(draft.date)}</div>
        </span>
      </button>
      <button class="row" data-action="discard-draft">
        <span class="grow" style="color:var(--muted);font-size:14px">Entwurf verwerfen</span>
      </button>
    </div>` : "";

  // „Als Nächstes dran“ (feste Rotation) + Wochenziel.
  const next = nextRoutine(store.routines, store.sessions);
  const goal = weekGoalStatus(store.sessions, store.settings.weekGoal);
  const dots = Array.from({ length: goal.goal }, (_, i) =>
    `<span class="gdot ${i < goal.thisWeek ? "on" : ""}"></span>`).join("");
  const goalHtml = `<div class="goal">
      <span class="gdots">${dots}</span>
      <span class="gtxt">${goal.thisWeek}/${goal.goal} diese Woche${goal.met ? " ✓" : ""}</span>
      ${goal.streak ? `<span class="gstreak">🔥 ${plural(goal.streak, "Woche", "Wochen")} in Folge</span>` : ""}
    </div>`;
  const nextHtml = next && !draft ? `
    <button class="card next-up" data-action="start" data-i="${store.routines.indexOf(next)}">
      <span class="grow"><span class="next-l">Als Nächstes dran</span>
        <h2>${esc(next.name)}</h2>
        <div class="sub">${esc(next.exercises.map((e) => e.name).filter(Boolean).join(" · "))}</div></span>
      <span class="play big">▶</span>
    </button>` : "";

  const rows = store.routines.map((r, i) => {
    const last = store.sessions.filter((s) => s.routineId === r.id).map((s) => s.date).sort().pop();
    const preview = r.exercises.slice(0, 3).map((e) => e.name).filter(Boolean).join(" · ")
      + (r.exercises.length > 3 ? " · …" : "");
    return `<button class="row" data-action="start" data-i="${i}">
      <span class="grow">
        <h3>${esc(r.name)}</h3>
        <div class="sub">${plural(r.exercises.length, "Übung", "Übungen")}${last ? ` · zuletzt ${relDate(last)}` : ""}</div>
        ${preview ? `<div class="sub2">${esc(preview)}</div>` : ""}
      </span>
      <span class="play">▶</span>
    </button>`;
  }).join("");

  screen.innerHTML = `
    <button class="fab" data-action="new-routine">＋</button>
    <h1 class="nav-title">Training</h1>
    ${goalHtml}
    ${draftHtml}
    ${nextHtml}
    ${store.routines.length
      ? `<div class="card">${rows}</div>`
      : `<div class="empty"><div class="big">${ICO_DUMBBELL}</div><h2>Keine Workouts</h2>
         <p>Lege oben rechts ein neues Workout an.</p></div>`}
    <div class="card" style="margin-top:12px">
      <button class="row" data-action="edit-routine-list"><span class="grow">
        <h3 style="color:var(--muted)">Workouts bearbeiten</h3></span><span class="chev">›</span></button>
    </div>`;
}

// ---------- Tab: Verlauf ----------
function renderVerlauf() {
  const sorted = store.sessions.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  // Nach Monat gruppieren – gibt langen Listen Struktur.
  const groups = [];
  for (const s of sorted) {
    const key = new Date(s.date).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    if (!groups.length || groups.at(-1).key !== key) groups.push({ key, items: [] });
    groups.at(-1).items.push(s);
  }

  const row = (s) => `
    <button class="row" data-action="session-detail" data-id="${s.id}">
      <span class="grow">
        <div style="display:flex;justify-content:space-between"><h3>${esc(s.routineName)}</h3>
          <span class="sub">${fmtDate(s.date)}</span></div>
        <div class="sub2">${plural(sessionCompletedSetCount(s), "Satz", "Sätze")} · Volumen ${Math.round(sessionVolume(s))} kg${s.endDate ? ` · ${fmtDuration((new Date(s.endDate) - new Date(s.date)) / 1000)}` : ""}${(s.note?.trim() || s.tags?.length) ? " · 📝" : ""}</div>
      </span><span class="chev">›</span>
    </button>`;

  screen.innerHTML = `<h1 class="nav-title">Verlauf</h1>
    ${sorted.length
      ? groups.map((g) => `<div class="section-title">${esc(g.key)}</div>
          <div class="card">${g.items.map(row).join("")}</div>`).join("")
      : `<div class="empty"><div class="big">${ICO_CLOCK}</div><h2>Noch kein Training</h2>
         <p>Starte ein Workout im Tab „Training“.</p></div>`}`;
}

// ---------- Tab: Steigerung ----------
// Prüft je Übung, ob du dich selbst steigerst, sortiert nach Handlungsbedarf
// (festgefahren zuerst). Die App erhöht nichts automatisch – sie zeigt nur,
// wo es hakt und wo du bereit für mehr Gewicht bist.
function renderSteigerung() {
  if (store.sessions.length === 0) {
    screen.innerHTML = `<h1 class="nav-title">Steigerung</h1>
      <div class="empty"><div class="big">${ICO_DUMBBELL}</div><h2>Noch keine Daten</h2>
      <p>Sobald du trainierst, prüft die App hier, ob du dich Einheit für Einheit steigerst.</p></div>`;
    return;
  }

  const items = [];
  for (const r of store.routines)
    for (const ex of r.exercises)
      items.push({ r, ex, st: store.progressionStatus(ex) });
  items.sort((a, b) =>
    (STATUS_PRIORITY[a.st.kind] - STATUS_PRIORITY[b.st.kind]) || a.ex.name.localeCompare(b.ex.name));

  const rows = items.map(({ r, ex, st }) => `
    <button class="row" data-action="progress" data-r="${r.id}" data-e="${ex.id}">
      <span class="grow">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><h3>${esc(ex.name)}</h3>${statusPill(st, { r: r.id, e: ex.id })}</div>
        <div class="sub2" style="color:var(--muted);margin-top:2px">${esc(statusDetail(st))}</div>
      </span><span class="chev">›</span>
    </button>`).join("");

  screen.innerHTML = `<h1 class="nav-title">Steigerung</h1><div class="card">${rows}</div>`;
}

// ---------- Tab: Dashboard ----------
// Farbpalette für die Übungs-Linien im Verlaufschart (zyklisch vergeben).
const SERIES_COLORS = ["#8b9bff", "#3ddc97", "#ffa057", "#b18cff", "#5ad1e6", "#ff7a9c", "#ffd166", "#7cf0c8"];
const RANGES = [["4 W", 28], ["12 W", 84], ["1 J", 365], ["Alle", 0]];
// Auswertungsebene: ganze Workout-Arten (Push, Pull …) oder einzelne Übungen.
const VIEWS = [["Nach Workout", "workout"], ["Nach Übung", "exercise"]];
// Metriken für die Workout-Ansicht (Reihenfolge = Reihenfolge im Umschalter).
const METRIC_ORDER = ["volume", "strength", "sets"];

// Dashboard-Zustand (Ebene, Metrik, Zeitraum, sichtbare Serien, Theorie-Linie) –
// überlebt Re-Renders innerhalb der Sitzung und wird in localStorage gespiegelt.
const DASH = loadDashState();
function loadDashState() {
  let saved = {};
  try { saved = JSON.parse(window.localStorage.getItem("ironjournal.dash") || "{}"); } catch { /* egal */ }
  return {
    range: saved.range ?? 84,
    theorie: saved.theorie ?? true,
    active: Array.isArray(saved.active) ? saved.active : null,
    view: saved.view === "exercise" ? "exercise" : "workout",
    metric: WORKOUT_METRICS[saved.metric] ? saved.metric : "volume",
    activeW: Array.isArray(saved.activeW) ? saved.activeW : null,
  };
}
function saveDashState() {
  try {
    window.localStorage.setItem("ironjournal.dash", JSON.stringify({
      range: DASH.range, theorie: DASH.theorie, active: DASH.active,
      view: DASH.view, metric: DASH.metric, activeW: DASH.activeW,
    }));
  } catch { /* egal */ }
}

// Stabile, abgeflachte Übungsliste mit fester Farbe je Übung.
function allExercises() {
  const out = [];
  store.routines.forEach((r) => r.exercises.forEach((ex) =>
    out.push({ ex, routineId: r.id, color: SERIES_COLORS[out.length % SERIES_COLORS.length] })));
  return out;
}

// Stabile Farbe je Workout-Art: nach Position der Routine, damit Push/Pull/Beine
// immer dieselbe Farbe behalten. Verlauf gelöschter Routinen zählt hinten weiter.
function workoutColor(key, idx) {
  const rIdx = store.routines.findIndex((r) => r.id === key);
  return SERIES_COLORS[(rIdx >= 0 ? rIdx : store.routines.length + idx) % SERIES_COLORS.length];
}

// ---- Hero: eine Linie je Workout-Art (Push, Pull, Beine …) ----
function workoutHeroHtml() {
  const metric = WORKOUT_METRICS[DASH.metric];
  const stats = workoutStats(store.sessions, { metric: DASH.metric, start: rangeStart(DASH.range) })
    .map((w, i) => ({ ...w, color: workoutColor(w.key, i) }));

  let html = `<div class="seg sub-seg" role="tablist">` +
    METRIC_ORDER.map((k) =>
      `<button class="seg-btn ${k === DASH.metric ? "on" : ""}" data-metric="${k}">${WORKOUT_METRICS[k].label}</button>`).join("") +
    `</div>`;

  if (!stats.length) {
    return html + `<div class="card chart-card"><div class="chart-empty">
      Im gewählten Zeitraum gibt es keine Einheiten. Wähle oben einen längeren Zeitraum.</div></div>`;
  }

  // Standard-Auswahl: alle Workout-Arten sichtbar (es sind typisch nur 2–4).
  if (DASH.activeW === null) { DASH.activeW = stats.map((w) => w.key); saveDashState(); }
  const activeSet = new Set(DASH.activeW);
  const series = stats.filter((w) => activeSet.has(w.key))
    .map((w) => ({ name: w.name, color: w.color, pts: w.pts }));

  html += `<div class="section-title">${metric.label} je Einheit · nach Workout</div>`;
  html += `<div class="card chart-card mchart-card">`;
  html += series.length
    ? multiLineChart(series, { fmtY: (v) => fmtMetric(v, metric), padL: 48 })
    : `<div class="chart-empty">Wähle unten ein Workout aus, um seinen Verlauf zu sehen.</div>`;
  html += `<div class="tip" hidden></div></div>`;

  html += `<div class="legend">` + stats.map((w) =>
    `<button class="lchip ${activeSet.has(w.key) ? "on" : ""}" data-toggle-w="${esc(w.key)}" style="--dot:${w.color}">
       <span class="ldot"></span>${esc(w.name)}</button>`).join("") + `</div>`;

  // Kennzahlen-Kacheln je Workout-Art.
  html += `<div class="wstats">` + stats.map((w) => {
    const trend = w.perWeek === null
      ? `<span class="wtrend flat">Trend: zu wenige Einheiten</span>`
      : (() => {
          const up = w.perWeek > 0;
          const rel = w.avg > 0 ? Math.abs(w.perWeek / w.avg) * 100 : 0;
          const cls = Math.abs(rel) < 1 ? "flat" : (up ? "up" : "down");
          const sign = up ? "+" : "−";
          return `<span class="wtrend ${cls}">${cls === "flat" ? "≈ stabil"
            : `${sign}${nf.format(rel)} % / Woche`}</span>`;
        })();
    return `<div class="card wstat" style="--c:${w.color}">
      <div class="wstat-head"><span class="ldot"></span><h3>${esc(w.name)}</h3>
        <span class="wcount">${plural(w.count, "Einheit", "Einheiten")}</span></div>
      <div class="wstat-grid">
        <div><div class="wlab">Letzte</div><div class="wval">${fmtMetric(w.last, metric)}</div></div>
        <div><div class="wlab">Ø</div><div class="wval">${fmtMetric(w.avg, metric)}</div></div>
        <div><div class="wlab">Beste</div><div class="wval">${fmtMetric(w.best, metric)}</div></div>
      </div>
      <div class="wstat-foot">${trend}<span class="wdate">${relDate(w.lastDate)}</span></div>
    </div>`;
  }).join("") + `</div>`;

  html += `<div class="row-hint">${metric.key === "volume"
    ? "Volumen = Σ Wiederholungen × Gewicht aller Arbeitssätze der Einheit. Wächst auch durch mehr Sätze."
    : metric.key === "strength"
      ? "Kraft-Index = Summe der besten e1RM je Übung. Steigt nur durch stärkere Sätze, nicht durch mehr Sätze."
      : "Sätze = abgehakte Arbeitssätze der Einheit (ohne Aufwärmsätze)."}</div>`;
  return html;
}

// ---- Hero: eine Linie je Übung (bisherige Detailansicht) ----
function exerciseHeroHtml() {
  const start = rangeStart(DASH.range);
  const withData = allExercises().map((item) => {
    const hist = store.history(item.ex.id).filter((h) => (!start || new Date(h.date) >= start));
    return { ...item, pts: hist.map((h) => ({ t: +new Date(h.date), y: exerciseTopWeight(h.logged) })).filter((p) => p.y > 0) };
  }).filter((it) => it.pts.length);

  if (!withData.length) {
    return `<div class="card chart-card"><div class="chart-empty">
      Im gewählten Zeitraum gibt es keine Übungsdaten. Wähle oben einen längeren Zeitraum.</div></div>`;
  }

  // Standard-Auswahl: die drei meist-trainierten Übungen.
  if (DASH.active === null) {
    DASH.active = withData.slice().sort((a, b) => b.pts.length - a.pts.length)
      .slice(0, 3).map((it) => it.ex.id);
    saveDashState();
  }
  const activeSet = new Set(DASH.active);
  const series = withData.filter((it) => activeSet.has(it.ex.id)).map((it) => ({
    name: it.ex.name, color: it.color, pts: it.pts, target: topTargetWeight(it.ex),
  }));

  let html = `<div class="section-title">Gewicht je Übung</div>`;
  html += `<div class="card chart-card mchart-card">`;
  html += series.length
    ? multiLineChart(series, { showTheorie: DASH.theorie })
    : `<div class="chart-empty">Wähle unten eine Übung aus, um ihren Verlauf zu sehen.</div>`;
  html += `<div class="tip" hidden></div></div>`;

  html += `<div class="legend">` +
    withData.map((it) =>
      `<button class="lchip ${activeSet.has(it.ex.id) ? "on" : ""}" data-toggle-ex="${it.ex.id}" style="--dot:${it.color}">
        <span class="ldot"></span>${esc(it.ex.name)}</button>`).join("") +
    `<button class="lchip theorie ${DASH.theorie ? "on" : ""}" data-toggle-theorie="1">
       <span class="ldash"></span>Theorie (Vorgabe)</button>` +
    `</div>`;
  return html;
}

function renderDashboard() {
  let html = `<h1 class="nav-title">Dashboard</h1>`;

  if (store.sessions.length === 0) {
    html += `<div class="empty"><div class="big">${ICO_DUMBBELL}</div><h2>Noch keine Daten</h2>
      <p>Sobald du trainierst, erscheinen hier dein Gewichtsverlauf, deine Trainingstage und neue Bestwerte.</p></div>`;
    html += dataCardHtml();
    screen.innerHTML = html;
    return;
  }

  const list = allExercises();

  // ---- Ebene (Workout-Art vs. Übung) + Zeitraum ----
  html += `<div class="seg" role="tablist">` +
    VIEWS.map(([label, v]) =>
      `<button class="seg-btn ${v === DASH.view ? "on" : ""}" data-view="${v}">${label}</button>`).join("") +
    `</div>`;
  html += `<div class="seg" role="tablist">` +
    RANGES.map(([label, days]) =>
      `<button class="seg-btn ${days === DASH.range ? "on" : ""}" data-range="${days}">${label}</button>`).join("") +
    `</div>`;

  html += DASH.view === "workout" ? workoutHeroHtml() : exerciseHeroHtml();

  // ---- Trainingstage (Heatmap) ----
  html += `<div class="section-title">Trainingstage · letzte 12 Wochen</div>`;
  html += `<div class="card">${heatmapHtml(trainingHeatmap(store.sessions, 12))}</div>`;

  // ---- Neue Bestwerte (PRs) ----
  const recs = personalRecords(store);
  if (recs.length) {
    html += `<div class="section-title">Bestwerte (geschätztes 1RM)</div><div class="card">`;
    html += recs.slice(0, 5).map((p, i) => {
      const item = list.find((x) => x.ex.id === p.exerciseId);
      const color = item ? item.color : "var(--tint)";
      const badge = p.fresh
        ? `<span class="pr-mark fresh" style="--c:${color}">★</span>`
        : `<span class="pr-mark" style="--c:${color}">${i + 1}</span>`;
      return `<button class="row" data-action="progress" data-r="${p.routineId}" data-e="${p.exerciseId}">
        ${badge}
        <span class="grow"><h3>${esc(p.name)}</h3>
          <div class="sub2" style="color:var(--faint)">Top ${fmtWeight(p.top)} · ${relDate(p.date)}${p.fresh ? " · neuer Rekord" : ""}</div></span>
        <span style="font-weight:800;font-size:16px;color:${color}">${nf.format(p.e1rm)} kg</span>
        <span class="chev">›</span></button>`;
    }).join("") + `</div>`;
  }

  // ---- Übungen je Workout (Navigation in den Detail-Fortschritt) ----
  // Je Workout eine Kopfzeile mit den Kennzahlen des gewählten Zeitraums, damit
  // die Workout-Ebene auch hier die Klammer um die Übungen bildet.
  const metric = WORKOUT_METRICS[DASH.metric];
  const wByKey = new Map(workoutStats(store.sessions,
    { metric: DASH.metric, start: rangeStart(DASH.range) }).map((w) => [w.key, w]));
  for (const r of store.routines) {
    const w = wByKey.get(r.id);
    const sub = w
      ? `${plural(w.count, "Einheit", "Einheiten")} · ${metric.label} letzte ${fmtMetric(w.last, metric)} · Ø ${fmtMetric(w.avg, metric)}`
      : "Keine Einheit im gewählten Zeitraum";
    html += `<div class="section-title">${esc(r.name)}<span class="st-sub">${esc(sub)}</span></div><div class="card">`;
    html += r.exercises.map((ex) => {
      const last = store.lastSession(ex.id);
      const sub = last
        ? `Top ${fmtWeight(exerciseTopWeight(last.logged))} · ${relDate(last.date)}`
        : `Vorgabe ${fmtWeight(topTargetWeight(ex))}`;
      const pill = statusPill(store.progressionStatus(ex), { r: r.id, e: ex.id });
      return `<button class="row" data-action="progress" data-r="${r.id}" data-e="${ex.id}">
        <span class="grow"><h3>${esc(ex.name)}</h3><div class="sub">${sub}</div></span>${pill}
        <span class="chev">›</span></button>`;
    }).join("");
    html += `</div>`;
  }

  html += dataCardHtml();
  screen.innerHTML = html;
}

function syncStatusText() {
  const c = sync.config();
  if (!c?.token) return "Aus – nach jedem Training automatisch in ein privates GitHub-Gist sichern";
  if (c.error) return `⚠ ${c.error}`;
  if (c.pendingSince) return navigator.onLine ? "Wird gesichert …" : "Offline – wird nachgeholt";
  return c.lastSync ? `✓ Gesichert ${relDate(c.lastSync)}, ${new Date(c.lastSync).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr` : "Verbunden";
}

function dataCardHtml() {
  return `
    <div class="section-title">Einstellungen</div>
    <div class="card">
      <button class="row" data-action="week-goal"><span class="grow">
        <h3 style="font-size:15px">🎯 Wochenziel</h3>
        <div class="sub2">${plural(store.settings.weekGoal, "Einheit", "Einheiten")} pro Woche</div></span><span class="chev">›</span></button>
    </div>
    <div class="section-title">Daten</div>
    <div class="card">
      <button class="row" data-action="gist"><span class="grow">
        <h3 style="font-size:15px">☁ Automatisches Backup</h3>
        <div class="sub2" id="sync-status">${esc(syncStatusText())}</div></span><span class="chev">›</span></button>
      <button class="row" data-action="export"><span class="grow">
        <h3 style="font-size:15px">⬇ Backup exportieren</h3>
        <div class="sub2">Alle Workouts & Verlauf als JSON-Datei sichern</div></span></button>
      <button class="row" data-action="import"><span class="grow">
        <h3 style="font-size:15px">⬆ Backup importieren</h3>
        <div class="sub2">Ersetzt die aktuellen Daten durch ein Backup</div></span></button>
    </div>`;
}

// Dashboard ohne Scroll-Sprung neu zeichnen (für Legende/Zeitraum-Umschalter).
function rerenderDashboard() {
  const y = screen.scrollTop;
  renderDashboard();
  screen.scrollTop = y;
}

// ---------- Backup ----------
function doExport() {
  const blob = new Blob([store.exportData()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `iron-journal-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function doImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (!confirm("Backup importieren? Die aktuellen Daten werden ersetzt.")) return;
      if (store.importData(String(reader.result))) { alert("Backup importiert ✓"); render(); }
      else alert("Ungültige Backup-Datei.");
    };
    reader.readAsText(file);
  };
  input.click();
}

// ---------- Automatisches Backup (GitHub-Gist) ----------
function openGistSettings() {
  const build = () => {
    const c = sync.config();
    if (!c?.token) {
      return `<div class="why-note" style="margin-top:16px">Nach jeder Änderung (Training gespeichert, Workout bearbeitet …)
        sichert die App alles still in ein <b>privates GitHub-Gist</b>. GitHub hebt jede Fassung als Revision auf.
        Auf einem neuen Gerät: Token eintragen → Backup wird gefunden und lässt sich wiederherstellen.</div>
        <div class="section-title">Einmalig einrichten</div>
        <div class="card">
          <a class="row" href="https://github.com/settings/tokens/new?scopes=gist&description=Iron%20Journal" target="_blank" rel="noopener">
            <span class="grow"><h3 style="font-size:15px">1. Token bei GitHub erstellen ↗</h3>
            <div class="sub2">Nur das Häkchen „gist“ setzen, Ablauf nach Wunsch</div></span></a>
          <div class="setrow"><input type="text" id="gist-token" style="width:100%" placeholder="2. Token hier einfügen (ghp_…)" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
          <div class="setrow"><button class="btn btn-tint btn-block" id="gist-connect">Verbinden</button></div>
        </div>
        <div class="why-note">Das Token liegt nur auf diesem Gerät und ist nie Teil des Backups.</div>`;
    }
    return `<div class="section-title">Status</div>
      <div class="card">
        <div class="row" style="cursor:default"><span class="grow"><h3 style="font-size:15px">☁ Verbunden</h3>
          <div class="sub" id="gist-status">${esc(syncStatusText())}</div></span></div>
        <button class="row" id="gist-now"><span class="grow"><h3 style="font-size:15px">Jetzt sichern</h3></span></button>
        ${c.id ? `<a class="row" href="https://gist.github.com/${esc(c.id)}/revisions" target="_blank" rel="noopener"><span class="grow">
          <h3 style="font-size:15px">Ältere Stände ansehen ↗</h3><div class="sub2">Revisionen im Gist</div></span></a>` : ""}
        ${c.id ? `<button class="row" id="gist-restore"><span class="grow"><h3 style="font-size:15px">⬇ Aus Gist wiederherstellen</h3>
          <div class="sub2">Ersetzt die Daten auf diesem Gerät</div></span></button>` : ""}
      </div>
      <div style="margin-top:14px"><button class="btn btn-block btn-text btn-danger" id="gist-off">Verbindung trennen</button></div>
      <div class="why-note">Trennen löscht nur das Token auf diesem Gerät – das Gist bleibt erhalten.</div>`;
  };
  const modal = openModal("Automatisches Backup", build(), { single: true });
  const repaint = () => { modal.body.innerHTML = build(); };
  const busy = (btn, txt) => { if (btn) { btn.disabled = true; btn.textContent = txt; } };

  modal.body.addEventListener("click", async (e) => {
    const id = e.target.closest("button")?.id;
    try {
      if (id === "gist-connect") {
        const token = modal.body.querySelector("#gist-token").value.trim();
        if (!token) return;
        busy(e.target.closest("button"), "Verbinde …");
        const found = await sync.connect(token);
        if (found) {
          const act = await actionSheet(`Backup gefunden (Stand ${relDate(found.updatedAt)})`, [
            { label: "⬇ Aus Gist wiederherstellen", act: "restore" },
            { label: "⬆ Daten dieses Geräts hochladen (Gist überschreiben)", act: "push", danger: true },
          ]);
          if (act === "restore") { await sync.restore(); toast("Backup wiederhergestellt ✓"); }
          else if (act === "push") await sync.syncNow();
          else { sync.disconnect(); }
        } else {
          await sync.syncNow();
        }
        repaint();
      } else if (id === "gist-now") {
        busy(e.target.closest("button"), "Sichere …");
        await sync.syncNow(); repaint();
      } else if (id === "gist-restore") {
        if (!confirm("Daten auf diesem Gerät durch das Backup im Gist ersetzen?")) return;
        await sync.restore(); toast("Backup wiederhergestellt ✓"); repaint();
      } else if (id === "gist-off") {
        if (!confirm("Automatisches Backup auf diesem Gerät ausschalten?")) return;
        sync.disconnect(); repaint();
      }
    } catch (err) {
      alert(err.message || String(err));
      repaint();
    }
  });
}

// ---------- Aktionen (Event-Delegation) ----------
screen.addEventListener("click", (e) => {
  // Dashboard-Steuerung (Ebene / Metrik / Zeitraum / Serien / Theorie-Linie)
  const viewBtn = e.target.closest("[data-view]");
  if (viewBtn) { DASH.view = viewBtn.dataset.view; saveDashState(); rerenderDashboard(); return; }
  const metricBtn = e.target.closest("[data-metric]");
  if (metricBtn) { DASH.metric = metricBtn.dataset.metric; saveDashState(); rerenderDashboard(); return; }
  const rangeBtn = e.target.closest("[data-range]");
  if (rangeBtn) { DASH.range = +rangeBtn.dataset.range; saveDashState(); rerenderDashboard(); return; }
  const wBtn = e.target.closest("[data-toggle-w]");
  if (wBtn) {
    const key = wBtn.dataset.toggleW;
    const set = new Set(DASH.activeW ?? []);
    set.has(key) ? set.delete(key) : set.add(key);
    DASH.activeW = [...set]; saveDashState(); rerenderDashboard(); return;
  }
  const exBtn = e.target.closest("[data-toggle-ex]");
  if (exBtn) {
    const id = exBtn.dataset.toggleEx;
    const set = new Set(DASH.active);
    set.has(id) ? set.delete(id) : set.add(id);
    DASH.active = [...set]; saveDashState(); rerenderDashboard(); return;
  }
  const thBtn = e.target.closest("[data-toggle-theorie]");
  if (thBtn) { DASH.theorie = !DASH.theorie; saveDashState(); rerenderDashboard(); return; }

  // Status-Pille angetippt → „Warum?“ (VOR data-action prüfen: die Pille
  // sitzt innerhalb der Zeilen-Buttons und soll deren Aktion übersteuern).
  const why = e.target.closest("[data-why-e]");
  if (why) { openWhy(why.dataset.whyR, why.dataset.whyE); return; }

  const b = e.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action;
  if (a === "start") {
    // Kein stilles Überschreiben einer angefangenen Einheit.
    const draft = store.loadDraft();
    if (draft && !confirm(`Angefangene Einheit „${draft.routineName}“ verwerfen und neu starten?`)) return;
    if (draft) store.clearDraft();
    openSession(store.makeSession(store.routines[+b.dataset.i]));
  }
  else if (a === "resume-draft") { const d = store.loadDraft(); if (d) openSession(d, { resumed: true }); }
  else if (a === "gist") openGistSettings();
  else if (a === "week-goal") {
    const v = prompt("Wie viele Einheiten pro Woche?", String(store.settings.weekGoal));
    const n = Math.round(num(v));
    if (v !== null && n >= 1 && n <= 14) { store.updateSettings({ weekGoal: n }); render(); }
  }
  else if (a === "discard-draft") {
    if (confirm("Angefangene Einheit wirklich verwerfen?")) { store.clearDraft(); render(); }
  }
  else if (a === "new-routine") openRoutineEdit(mkRoutine("Neues Workout", [mkExercise("", [mkTarget(8, 0)])]), true);
  else if (a === "edit-routine-list") openRoutinePicker();
  else if (a === "session-detail") openSessionDetail(b.dataset.id);
  else if (a === "progress") openProgress(b.dataset.r, b.dataset.e);
  else if (a === "export") doExport();
  else if (a === "import") doImport();
});

// ---------- Modal-Grundgerüst ----------
function openModal(title, bodyHtml, opts = {}) {
  const { onDone, doneLabel = "Fertig", cancelLabel = "Abbrechen", onCancel, cleanup, single } = opts;
  const m = document.createElement("div");
  m.className = "modal";
  // single: reine Anzeige-Modals haben nur einen „Fertig“-Button –
  // zwei Buttons, die beide nur schließen, verwirren.
  m.innerHTML = `
    <div class="modal-bar">
      <button class="btn-text" data-x="close" ${single ? 'style="visibility:hidden"' : ""}>${esc(cancelLabel)}</button>
      <h2>${esc(title)}</h2>
      <button class="btn-text" data-x="done" style="font-weight:700">${esc(doneLabel)}</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>`;
  modalRoot.appendChild(m);
  document.body.style.overflow = "hidden";
  const close = () => {
    cleanup && cleanup();
    m.remove();
    // Scroll-Sperre nur aufheben, wenn kein weiteres Modal offen ist (Stacking).
    document.body.style.overflow = modalRoot.querySelector(".modal") ? "hidden" : "";
  };
  m.querySelector('[data-x="close"]').onclick = () => { onCancel && onCancel(); close(); render(); };
  // onDone kann false liefern, um offen zu bleiben (z. B. Zusammenfassung davor).
  m.querySelector('[data-x="done"]').onclick = () => {
    if (onDone && onDone() === false) return;
    close(); render();
  };
  return { el: m, body: m.querySelector(".modal-body"), close };
}

// ---------- Overlays: Bottom-Sheet, Aktionsmenü, Toast ----------
// Leichtgewichtiges Sheet über allem (auch über Modals). Liefert { el, close }.
function openSheet(html, { onClose } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "sheet-wrap";
  wrap.innerHTML = `<div class="sheet-back"></div><div class="sheet">${html}</div>`;
  document.body.appendChild(wrap);
  const close = () => { wrap.remove(); onClose && onClose(); };
  wrap.querySelector(".sheet-back").onclick = close;
  return { el: wrap.querySelector(".sheet"), close };
}

// Aktionsmenü im iOS-Stil. items: [{ label, act, danger }] → Promise<act|null>.
function actionSheet(title, items) {
  return new Promise((resolve) => {
    let picked = null;
    const sh = openSheet(`<div class="sheet-title">${esc(title)}</div>
      <div class="sheet-list">${items.map((it) =>
        `<button class="sheet-item ${it.danger ? "btn-danger" : ""}" data-pick="${it.act}">${esc(it.label)}</button>`).join("")}</div>
      <button class="sheet-item sheet-cancel" data-pick="">Abbrechen</button>`,
      { onClose: () => resolve(picked) });
    sh.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pick]"); if (!b) return;
      picked = b.dataset.pick || null;
      sh.close();
    });
  });
}

// Kurzer Hinweis unten, optional mit „Rückgängig“ (5 s).
let toastEl = null;
function toast(msg, undo) {
  if (toastEl) toastEl.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button class="btn-text">Rückgängig</button>` : ""}`;
  document.body.appendChild(t);
  toastEl = t;
  const timer = setTimeout(() => t.remove(), 5000);
  if (undo) t.querySelector("button").onclick = () => { clearTimeout(timer); t.remove(); undo(); };
}

// ---------- Aktive Einheit ----------
// opts.resumed: fortgesetzter Entwurf · opts.edit: vergangene Einheit bearbeiten
// (kein Entwurf, kein Timer, Datum änderbar, „Fertig“ speichert direkt).
function openSession(session, opts = {}) {
  const { resumed = false, edit = false } = opts;
  let formOpen = edit;        // Tagesform-Karte auf-/zugeklappt (übersteht Re-Render)
  let restInterval = null;
  let statsInterval = null;

  const view = () => (edit ? editStripHtml(session) : statsStripHtml(session)) +
    sessionBody(session, { edit, formOpen }) + (edit ? "" : restBarHtml());

  const modal = openModal(edit ? `${session.routineName} bearbeiten` : session.routineName, view(), {
    doneLabel: edit ? "Sichern" : "Fertig",
    cancelLabel: "Schließen",
    onDone: () => {
      if (edit) { finalizeSession(session); store.saveSession(session); return; }
      // Erst die Zusammenfassung zeigen; gespeichert wird dort.
      openSummary(session, () => { modal.close(); render(); });
      return false;
    },
    cleanup: () => {
      clearInterval(restInterval); clearInterval(statsInterval);
      releaseWakeLock();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  });
  const body = modal.body;

  // Schließen verliert nichts: der Entwurf bleibt (Banner im Training-Tab).
  function touch() { if (!edit) store.saveDraft(session); refreshStats(); }
  if (resumed) touch();

  function refresh() {
    const y = body.scrollTop;
    body.innerHTML = view();
    body.scrollTop = y;
    refreshStats();                    // sofort füllen, nicht erst beim nächsten Tick
    if (restEndAt) showRestBar();
  }

  // Nach dem Abhaken zum nächsten offenen Satz scrollen.
  function scrollToCurrent() {
    const cur = body.querySelector(".setrow.cur");
    if (cur) cur.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // -- Live-Statuszeile (Dauer · Sätze · Volumen) + Fortschrittsbalken --
  function refreshStats() {
    const el = body.querySelector("#sess-stats");
    if (!el) return;
    const secs = Math.max(0, Math.floor((Date.now() - new Date(session.date)) / 1000));
    const total = session.exercises.reduce((n, e) => n + workingSets(e.sets).length, 0);
    const done = sessionCompletedSetCount(session);
    // Nur tatsächlich abgehakte Arbeitssätze zählen – nicht das geplante Volumen.
    const doneVol = session.exercises.reduce((sum, e) =>
      sum + e.sets.filter((s) => s.completed && !s.isWarmup)
        .reduce((n, s) => n + s.reps * s.weight, 0), 0);
    el.querySelector(".ss-txt").innerHTML =
      `⏱ ${fmtClock(secs)} &nbsp;·&nbsp; ${done}/${total} Sätze &nbsp;·&nbsp; ${Math.round(doneVol)} kg`;
    el.querySelector(".prog i").style.width = total ? `${Math.round((done / total) * 100)}%` : "0";
  }
  if (!edit) statsInterval = setInterval(refreshStats, 1000);
  refreshStats();

  // -- Pausen-Timer: startet automatisch beim Abhaken eines Satzes --
  // Dauer nach Übungsart (Grundübung länger, Isolation kürzer – restSeconds).
  // Zeitstempel-basiert: die verbleibende Zeit wird aus der Zielzeit berechnet,
  // damit der Timer auch nach App-Wechsel / Sperrbildschirm korrekt weiterläuft
  // (setInterval wird vom Browser im Hintergrund gedrosselt oder pausiert).
  let restEndAt = 0;          // Zielzeit in ms (Date.now-Basis), 0 = kein Timer
  let restDoneFired = false;  // damit Signal nur einmal pro Pause feuert
  function restSecsLeft() {
    return restEndAt ? Math.max(0, Math.ceil((restEndAt - Date.now()) / 1000)) : 0;
  }
  function showRestBar() {
    const bar = body.querySelector("#restbar");
    if (!bar) return;
    const left = restSecsLeft();
    bar.hidden = false;
    bar.classList.toggle("rt-done", left <= 0);
    bar.querySelector(".rt-time").textContent =
      left > 0 ? fmtClock(left) : "Pause vorbei 💪";
  }
  function tickRest() {
    if (!restEndAt) return;
    if (restSecsLeft() <= 0) {
      if (!restDoneFired) { restDoneFired = true; restDone(); }
      showRestBar();
      // Balken 4 s nach Ablauf ausblenden und Timer beenden.
      if (Date.now() - restEndAt > 4000) {
        restEndAt = 0;
        const b = body.querySelector("#restbar"); if (b) b.hidden = true;
      }
    } else showRestBar();
  }
  function restDone() {
    if (navigator.vibrate) navigator.vibrate([300, 120, 300]);
    beep();
  }
  function startRest(secs) {
    primeAudio();             // Audio im selben Tap freischalten (iOS-Anforderung)
    restEndAt = Date.now() + secs * 1000;
    restDoneFired = false;
    showRestBar();
  }
  function stopRest() {
    restEndAt = 0;
    restDoneFired = false;
    const b = body.querySelector("#restbar");
    if (b) b.hidden = true;
  }
  // Ein einziger Sekunden-Ticker treibt den Pausen-Timer (statt pro Start neu).
  if (!edit) restInterval = setInterval(tickRest, 1000);

  // -- Kurzer Signalton bei Pausenende --
  // AudioContext muss innerhalb einer Nutzer-Geste erzeugt/aktiviert werden,
  // daher beim Abhaken (primeAudio) vorbereiten und später wiederverwenden.
  let audioCtx = null;
  function primeAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch { /* Audio nicht verfügbar – ignorieren */ }
  }
  function beep() {
    if (!audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = "sine"; o.frequency.value = 880;
      const t = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.start(t); o.stop(t + 0.47);
    } catch { /* ignorieren */ }
  }

  // -- Bildschirm wach halten, solange die Einheit offen ist --
  // Hält den Pausen-Timer am Laufen, wenn das Telefon liegen bleibt.
  let wakeLock = null;
  async function acquireWakeLock() {
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible") {
        wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch { /* z. B. niedriger Akku – ignorieren */ }
  }
  function releaseWakeLock() {
    try { wakeLock && wakeLock.release(); } catch { /* ignorieren */ }
    wakeLock = null;
  }
  if (!edit) acquireWakeLock();

  // Beim Zurückkehren in die App: Wake Lock neu anfordern (geht beim Verlassen
  // verloren) und Anzeige sofort korrigieren statt bis zum nächsten Tick warten.
  function onVisibility() {
    if (document.visibilityState === "visible" && !edit) {
      acquireWakeLock();
      refreshStats();
      tickRest();
    }
  }
  document.addEventListener("visibilitychange", onVisibility);

  // Tagesform-Notiz und (im Bearbeiten-Modus) Datum.
  body.addEventListener("input", (e) => {
    const f = e.target.dataset.field;
    if (f === "snote") { session.note = e.target.value; touch(); }
    else if (f === "sdate" && e.target.value) {
      const d = new Date(e.target.value);
      if (isNaN(d)) return;
      const shift = d - new Date(session.date);
      session.date = d.toISOString();
      if (session.endDate) session.endDate = new Date(new Date(session.endDate).getTime() + shift).toISOString();
    }
  });

  // Satz-Werte über den großen Ziffernblock ändern (statt Tastatur).
  function editSet(ei, si) {
    const ex = session.exercises[ei];
    const set = ex.sets[si];
    const rtEx = store.exercise(ex.exerciseId);
    openNumpad({
      title: ex.name,
      sub: set.isWarmup ? "Aufwärmsatz" : `Satz ${workingSets(ex.sets).indexOf(set) + 1}`,
      reps: set.reps, weight: set.weight,
      step: rtEx?.increment > 0 ? rtEx.increment : 2.5,
      onSave: (reps, weight, check) => {
        set.reps = reps; set.weight = weight;
        const wasDone = set.completed;
        if (check) set.completed = true;
        touch(); refresh();
        if (check && !wasDone) afterCheck(ex);
      },
    });
  }

  function afterCheck(ex) {
    if (!edit) startRest(restSeconds(ex.name));
    scrollToCurrent();
  }

  async function exerciseMenu(ei) {
    const ex = session.exercises[ei];
    const act = await actionSheet(ex.name, [
      ...(ei < session.exercises.length - 1 ? [{ label: "⤓ Später machen (ans Ende)", act: "later" }] : []),
      { label: "⇄ Gegen andere Übung tauschen", act: "swap" },
      { label: "⤼ Heute überspringen", act: "skip", danger: true },
    ]);
    if (act === "later") {
      session.exercises.push(session.exercises.splice(ei, 1)[0]);
      touch(); refresh();
      toast(`${ex.name} ans Ende verschoben`);
    } else if (act === "skip") {
      ex.skippedSets = ex.sets; ex.sets = []; ex.skipped = true;
      touch(); refresh();
    } else if (act === "swap") {
      const picked = await pickExercise(session, "Tauschen gegen");
      if (!picked) return;
      session.exercises[ei] = picked;
      touch(); refresh();
      toast(`${ex.name} → ${picked.name}`, () => { session.exercises[ei] = ex; touch(); refresh(); });
    }
  }

  body.addEventListener("click", async (e) => {
    const why = e.target.closest("[data-why-e]");
    if (why) { openWhy(why.dataset.whyR, why.dataset.whyE, session); return; }
    const t = e.target.closest("[data-act]"); if (!t) return;
    const act = t.dataset.act;
    if (act === "rest-plus") {
      const base = restSecsLeft() > 0 ? restEndAt : Date.now();
      restEndAt = base + 30000; restDoneFired = false; showRestBar(); return;
    }
    if (act === "rest-skip") { stopRest(); return; }
    if (act === "exprog") { openProgress(routineOf(t.dataset.exid)?.id, t.dataset.exid); return; }
    if (act === "tag") {
      const tag = t.dataset.tag;
      session.tags = session.tags ?? [];
      session.tags = session.tags.includes(tag) ? session.tags.filter((x) => x !== tag) : [...session.tags, tag];
      touch(); t.classList.toggle("on"); return;
    }
    if (act === "note-toggle") { formOpen = !formOpen; t.closest(".dayform").classList.toggle("open", formOpen); return; }
    if (act === "add-ex") {
      const picked = await pickExercise(session, "Übung hinzufügen");
      if (picked) { session.exercises.push(picked); touch(); refresh(); }
      return;
    }
    const ei = +t.dataset.ex;
    const ex = session.exercises[ei];
    if (act === "toggle") {
      const s = ex.sets[+t.dataset.set];
      s.completed = !s.completed;
      touch(); refresh();
      if (s.completed) afterCheck(ex);
    } else if (act === "edit-set") {
      editSet(ei, +t.dataset.set);
    } else if (act === "ex-menu") {
      exerciseMenu(ei);
    } else if (act === "unskip") {
      ex.sets = ex.skippedSets ?? []; delete ex.skippedSets; delete ex.skipped;
      touch(); refresh();
    } else if (act === "add-set") {
      const base = [...ex.sets].reverse().find((s) => !s.isWarmup);
      ex.sets.push({ id: crypto.randomUUID(), reps: base?.reps ?? 8, weight: base?.weight ?? 0, isWarmup: false, completed: false });
      touch(); refresh();
    } else if (act === "warmups-live") {
      const later = ei > 0;
      const gen = warmupTargets(topWorkingWeight(ex.sets), { later });
      if (!gen.length) { alert("Für Körpergewichtsübungen (0 kg) gibt es keine prozentualen Aufwärmsätze."); return; }
      const warm = gen.map((t) => ({ id: crypto.randomUUID(), reps: t.reps, weight: t.weight, isWarmup: true, completed: false }));
      ex.sets = [...warm, ...ex.sets.filter((s) => !s.isWarmup)];
      touch(); refresh();
    } else if (act === "del-set-live") {
      const si = +t.dataset.set;
      const [removed] = ex.sets.splice(si, 1);
      touch(); refresh();
      toast("Satz gelöscht", () => { ex.sets.splice(si, 0, removed); touch(); refresh(); });
    }
  });

  if (!edit) setTimeout(scrollToCurrent, 250);
}

// Vor dem Speichern: Hilfsfelder der Live-Ansicht entfernen.
function finalizeSession(session) {
  for (const e of session.exercises) {
    if (e.skipped) e.sets = [];
    delete e.skippedSets;
  }
}

// ---------- Großer Ziffernblock für Wdh × kg ----------
// „Abhaken = fertig“: Werte sind vorbefüllt; nur bei Abweichung antippen.
// Erste Eingabe ersetzt den Wert (wie Markieren + Überschreiben).
function openNumpad({ title, sub, reps, weight, step, onSave }) {
  const val = { reps: String(reps), weight: String(weight).replace(".", ",") };
  let field = "weight";
  let fresh = true;
  const sh = openSheet(`
    <div class="sheet-title">${esc(title)}<span class="np-sub">${esc(sub)}</span></div>
    <div class="np-fields">
      <button class="np-field" data-f="reps"><span class="np-l">Wdh</span><span class="np-v" data-v="reps"></span></button>
      <span class="np-x">×</span>
      <button class="np-field" data-f="weight"><span class="np-l">kg</span><span class="np-v" data-v="weight"></span></button>
    </div>
    <div class="np-steps">
      <button class="np-step" data-step="-1">−<span data-sl></span></button>
      <button class="np-step" data-step="1">+<span data-sl></span></button>
    </div>
    <div class="np-keys">${["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"]
      .map((k) => `<button class="np-key" data-k="${k}">${k}</button>`).join("")}</div>
    <div class="np-actions">
      <button class="btn btn-ghost" data-ok="0">Übernehmen</button>
      <button class="btn btn-tint" data-ok="1">✓ Abhaken</button>
    </div>`);
  const el = sh.el;
  const paint = () => {
    el.querySelector('[data-v="reps"]').textContent = val.reps || "0";
    el.querySelector('[data-v="weight"]').textContent = val.weight || "0";
    el.querySelectorAll(".np-field").forEach((b) => b.classList.toggle("on", b.dataset.f === field));
    const stepTxt = field === "reps" ? "1" : nf.format(step);
    el.querySelectorAll("[data-sl]").forEach((s) => { s.textContent = ` ${stepTxt}${field === "reps" ? "" : " kg"}`; });
    el.querySelector('[data-k=","]').style.visibility = field === "reps" ? "hidden" : "visible";
  };
  paint();
  el.addEventListener("click", (e) => {
    const f = e.target.closest("[data-f]");
    if (f) { field = f.dataset.f; fresh = true; paint(); return; }
    const st = e.target.closest("[data-step]");
    if (st) {
      const d = +st.dataset.step * (field === "reps" ? 1 : step);
      const n = Math.max(0, Math.round((num(val[field]) + d) * 100) / 100);
      val[field] = field === "reps" ? String(Math.round(n)) : String(n).replace(".", ",");
      fresh = false; paint(); return;
    }
    const k = e.target.closest("[data-k]");
    if (k) {
      const key = k.dataset.k;
      let v = fresh ? "" : val[field];
      fresh = false;
      if (key === "⌫") v = v.slice(0, -1);
      else if (key === ",") { if (!v.includes(",")) v = (v || "0") + ","; }
      else if (v.length < 6) v = v === "0" ? key : v + key;
      val[field] = v; paint(); return;
    }
    const ok = e.target.closest("[data-ok]");
    if (ok) {
      sh.close();
      onSave(Math.round(num(val.reps)), num(val.weight), ok.dataset.ok === "1");
    }
  });
}

// ---------- Übung wählen (Tauschen / Hinzufügen) ----------
// Alle Übungen aus allen Workouts (ohne die schon in der Einheit) oder eine
// neue Übung nur für heute. Liefert eine vorbefüllte geloggte Übung oder null.
function pickExercise(session, title) {
  return new Promise((resolve) => {
    let result = null;
    const inSession = new Set(session.exercises.map((e) => e.exerciseId));
    const groups = store.routines.map((r) => {
      const items = r.exercises.filter((x) => x.name && !inSession.has(x.id));
      return items.length ? `<div class="sheet-group">${esc(r.name)}</div>` + items.map((x) =>
        `<button class="sheet-item" data-ex="${x.id}">${esc(x.name)}</button>`).join("") : "";
    }).join("");
    const sh = openSheet(`<div class="sheet-title">${esc(title)}</div>
      <div class="sheet-new"><input type="text" placeholder="Neue Übung (nur heute)" data-new>
        <button class="btn btn-tint" data-add-new>＋</button></div>
      <div class="sheet-list sheet-scroll">${groups || `<div class="row-hint">Keine weiteren Übungen in deinen Workouts.</div>`}</div>
      <button class="sheet-item sheet-cancel" data-cancel>Abbrechen</button>`,
      { onClose: () => resolve(result) });
    sh.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-ex]");
      if (b) { result = store.makeLoggedExercise(store.exercise(b.dataset.ex)); sh.close(); return; }
      if (e.target.closest("[data-add-new]")) {
        const name = sh.el.querySelector("[data-new]").value.trim();
        if (!name) { sh.el.querySelector("[data-new]").focus(); return; }
        result = store.makeAdhocExercise(name); sh.close(); return;
      }
      if (e.target.closest("[data-cancel]")) sh.close();
    });
  });
}

// ---------- Zusammenfassung nach dem Training ----------
// Wird vor dem Speichern gezeigt: Kennzahlen, Vergleich zum letzten Mal,
// neue Bestwerte und – falls nötig – was mit offenen Sätzen passieren soll.
function openSummary(session, onSaved) {
  session.endDate = new Date().toISOString();
  const sum = sessionSummary(store, session);
  // Ist gar nichts abgehakt, wurde vermutlich nur nicht getippt → abhaken.
  let openMode = sum.setsDone === 0 ? "complete" : "drop";

  const delta = (a, b, fmt) => {
    const d = a - b;
    if (Math.abs(d) < 0.5) return `<span class="why-d flat">±0</span>`;
    return `<span class="why-d ${d > 0 ? "up" : "down"}">${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}</span>`;
  };
  const build = () => {
    const s = sessionSummary(store, session);
    const vol = openMode === "complete" && s.setsOpen
      ? s.volume + session.exercises.reduce((n, e) =>
          n + workingSets(e.sets).filter((x) => !x.completed).reduce((m, x) => m + x.reps * x.weight, 0), 0)
      : s.volume;
    const sets = s.setsDone + (openMode === "complete" ? s.setsOpen : 0);
    let html = `<div class="sum-hero">
        <div><b>${fmtDuration(s.duration)}</b><span>Dauer</span></div>
        <div><b>${sets}</b><span>Sätze</span></div>
        <div><b>${Math.round(vol)} kg</b><span>Volumen</span></div>
      </div>`;
    if (s.setsOpen) {
      html += `<div class="section-title">${plural(s.setsOpen, "Satz", "Sätze")} nicht abgehakt</div>
        <div class="seg"><button class="seg-btn ${openMode === "drop" ? "on" : ""}" data-open="drop">Verwerfen</button>
          <button class="seg-btn ${openMode === "complete" ? "on" : ""}" data-open="complete">Als erledigt zählen</button></div>`;
    }
    if (s.prs.length) {
      html += `<div class="section-title">Neue Bestwerte ★</div><div class="card">` + s.prs.map((p) =>
        `<div class="why-row"><span class="why-l">★ ${esc(p.name)}</span><span class="why-m">${nf.format(p.e1rm)} kg e1RM</span>
          <span class="why-d up">+${nf.format(p.e1rm - p.prev)}</span></div>`).join("") + `</div>`;
    }
    if (s.prev) {
      html += `<div class="section-title">Vergleich zu ${esc(session.routineName)} am ${fmtDate(s.prev.date)}</div><div class="card">
        <div class="why-row"><span class="why-l">Volumen</span><span class="why-m">${Math.round(s.prev.volume)} → ${Math.round(vol)} kg</span>${delta(vol, s.prev.volume, (v) => `${Math.round(v)} kg`)}</div>
        ${s.prev.duration ? `<div class="why-row"><span class="why-l">Dauer</span><span class="why-m">${Math.round(s.prev.duration / 60)} → ${Math.round(s.duration / 60)} min</span>${delta(s.duration / 60, s.prev.duration / 60, (v) => `${Math.round(v)} min`)}</div>` : ""}
      </div>`;
    }
    html += `<div style="height:8px"></div>` + dayformHtml(session, true);
    return html;
  };

  const m = openModal("Geschafft 💪", build(), {
    doneLabel: "Speichern",
    cancelLabel: "Zurück",
    onCancel: () => { delete session.endDate; },
    onDone: () => {
      resolveOpenSets(session, openMode);
      finalizeSession(session);
      store.saveSession(session);
      store.clearDraft();
      onSaved();
    },
  });
  m.body.addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]");
    if (o) { openMode = o.dataset.open; m.body.innerHTML = build(); return; }
    const t = e.target.closest('[data-act="tag"]');
    if (t) {
      const tag = t.dataset.tag;
      session.tags = (session.tags ?? []).includes(tag) ? session.tags.filter((x) => x !== tag) : [...(session.tags ?? []), tag];
      t.classList.toggle("on"); store.saveDraft(session);
    }
  });
  m.body.addEventListener("input", (e) => {
    if (e.target.dataset.field === "snote") { session.note = e.target.value; store.saveDraft(session); }
  });
}

function statsStripHtml() {
  return `<div class="stats-strip" id="sess-stats"><div class="ss-txt"></div><div class="prog"><i></i></div></div>`;
}

// Bearbeiten-Modus: Datum/Uhrzeit statt Live-Statuszeile.
function editStripHtml(session) {
  const d = new Date(session.date);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return `<div class="modal-grp"><div class="setrow"><span class="unit">Datum</span><span class="spacer"></span>
    <input type="datetime-local" value="${local}" data-field="sdate"></div></div>`;
}

function restBarHtml() {
  return `<div class="restbar" id="restbar" hidden>
    <span class="rt-label">Pause</span>
    <span class="rt-time">1:30</span>
    <span class="spacer"></span>
    <button class="btn-text" data-act="rest-plus">+30 s</button>
    <button class="btn-text" data-act="rest-skip">Überspringen</button>
  </div>`;
}

// Tagesform: Schnell-Chips + freie Notiz. Für die spätere (externe) KI-Auswertung
// landen beide im Backup (session.tags / session.note).
const DAY_TAGS = ["😴 Schlecht geschlafen", "🥱 Müde", "💪 Top fit", "🤕 Schmerzen", "⏱ Wenig Zeit", "🍽 Wenig gegessen", "🤒 Angeschlagen"];
function dayformHtml(session, open = false) {
  const tags = session.tags ?? [];
  const summary = [...tags, session.note?.trim()].filter(Boolean).join(" · ");
  return `<div class="dayform ${open ? "open" : ""}">
    <button class="dayform-head" data-act="note-toggle"><span>📝 Tagesform</span>
      <span class="dayform-sum">${summary ? esc(summary) : "Wie fühlst du dich heute?"}</span></button>
    <div class="dayform-body">
      <div class="chips">${DAY_TAGS.map((t) =>
        `<button class="chip ${tags.includes(t) ? "on" : ""}" data-act="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>
      <textarea class="ex-note-input" rows="2" placeholder="Notiz, z. B. Schulter zwickt, Gym voll …" data-field="snote">${esc(session.note ?? "")}</textarea>
    </div></div>`;
}

// Routine, die eine Übung enthält (Übungen können aus anderen Workouts
// eingetauscht sein).
function routineOf(exerciseId) {
  return store.routines.find((r) => r.exercises.some((x) => x.id === exerciseId)) ?? null;
}

// Status-Pille einer Übung der laufenden Einheit: zählt die gerade
// eingetragenen Sätze als neueste Einheit mit (live, nicht erst nach „Fertig“).
function sessionPill(session, ei) {
  const rtEx = store.exercise(session.exercises[ei]?.exerciseId);
  return rtEx ? statusPill(store.progressionStatus(rtEx, session), { r: routineOf(rtEx.id).id, e: rtEx.id }) : "";
}

// Erhöhungsvorschlag einer Übung der laufenden Einheit (live).
function sessionSuggestion(session, ei) {
  const rtEx = store.exercise(session.exercises[ei]?.exerciseId);
  return rtEx ? suggestionLine(store.increaseSuggestion(rtEx, session)) : "";
}

function sessionBody(session, { edit = false, formOpen = false } = {}) {
  // Erster offener Satz (in Übungsreihenfolge) = „jetzt dran“.
  let cur = null;
  for (let ei = 0; ei < session.exercises.length && !cur; ei++) {
    const si = session.exercises[ei].sets.findIndex((s) => !s.completed);
    if (si >= 0) cur = { ei, si };
  }

  const exHtml = session.exercises.map((ex, ei) => {
    const menuBtn = edit ? "" : `<button class="mini-link" data-act="ex-menu" data-ex="${ei}" aria-label="Übung verschieben, tauschen, überspringen">⋯</button>`;
    if (ex.skipped) {
      return `<div class="ex-head skipped"><h3>${esc(ex.name)}</h3>
        <span class="pill">übersprungen</span>
        <button class="btn-text" data-act="unskip" data-ex="${ei}">Rückgängig</button></div>`;
    }
    const last = store.lastSession(ex.exerciseId);
    const lastTxt = last ? "Zuletzt: " + workingSets(last.logged.sets)
      .map((s) => `${s.reps}×${fmtWeightShort(s.weight)}`).join("  ") : "";
    const sets = ex.sets.map((s, si) => {
      const isCur = cur && cur.ei === ei && cur.si === si;
      return `
      <div class="setrow ${s.completed ? "done" : ""} ${isCur && !edit ? "cur" : ""}">
        <button class="check ${s.completed ? "on" : ""}" data-act="toggle" data-ex="${ei}" data-set="${si}">${s.completed ? "✓" : ""}</button>
        ${s.isWarmup ? `<span class="warm-tag">Aufwärmen</span>` : `<span class="warm-tag"></span>`}
        <span class="spacer"></span>
        <button class="setval" data-act="edit-set" data-ex="${ei}" data-set="${si}">
          <b>${s.reps}</b><span class="times">×</span><b>${fmtWeightShort(s.weight)}</b>${s.weight ? `<span class="unit">kg</span>` : ""}</button>
        <button class="del-x" data-act="del-set-live" data-ex="${ei}" data-set="${si}" aria-label="Satz löschen">✕</button>
      </div>`;
    }).join("");
    const rtEx = store.exercise(ex.exerciseId);
    const note = rtEx?.note?.trim();
    // Im Deload sagt die Markierung alles – Status/Erhöhungsvorschlag wären irreführend.
    const pill = ex.deload ? "" : `<span class="pill-slot" data-pill-ex="${ei}">${sessionPill(session, ei)}</span>`;
    const sugg = ex.deload ? "" : `<div class="sugg" data-sugg-ex="${ei}">${sessionSuggestion(session, ei)}</div>`;
    const inc = rtEx && !edit ? store.autoIncrement(rtEx) : 0;
    const incTxt = inc > 0
      ? ` <span class="auto-up">↑ automatisch +${fmtWeightShort(inc)} kg</span>` : "";
    const tags = [
      ex.deload ? `<span class="pill deload">Deload −10 %</span>` : "",
      ex.adhoc ? `<span class="pill">nur heute</span>` : "",
    ].join("");
    return `<div class="ex-head ${cur && cur.ei === ei && !edit ? "cur-ex" : ""}"><h3>${esc(ex.name)}</h3>${tags}${pill}
        ${rtEx ? `<button class="mini-link" data-act="exprog" data-exid="${ex.exerciseId}" aria-label="Fortschritt anzeigen">📈</button>` : ""}${menuBtn}</div>
      ${note ? `<div class="ex-note">📝 ${esc(note)}</div>` : ""}
      ${lastTxt && !edit ? `<div class="sub2" style="margin:-2px 16px 6px;color:var(--muted)">${esc(lastTxt)}${incTxt}</div>` : ""}
      ${edit ? "" : sugg}
      <div class="modal-grp" style="margin-top:4px">${sets}
        <div class="setrow"><button class="btn-text" data-act="add-set" data-ex="${ei}">＋ Satz hinzufügen</button>
          <span class="spacer"></span>
          <button class="btn-text warm-add" data-act="warmups-live" data-ex="${ei}">🔥 Aufwärmen</button></div>
      </div>`;
  }).join("");

  return dayformHtml(session, formOpen) + exHtml +
    `<div style="margin-top:16px"><button class="btn btn-block btn-ghost" data-act="add-ex">＋ Übung hinzufügen</button></div>`;
}

// ---------- Verlauf-Detail ----------
function openSessionDetail(id) {
  const s = store.sessions.find((x) => x.id === id); if (!s) return;
  const dur = s.endDate ? Math.round((new Date(s.endDate) - new Date(s.date)) / 60000) : null;
  const meta = [
    `${new Date(s.date).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`,
    dur !== null ? `${dur} min` : "",
    `Volumen ${Math.round(sessionVolume(s))} kg`,
  ].filter(Boolean).join(" · ");
  const form = [...(s.tags ?? []), s.note?.trim()].filter(Boolean);
  const body = `<div class="section-title">${esc(s.routineName)}<span class="st-sub">${esc(meta)}</span></div>` +
    (form.length ? `<div class="card"><div class="ex-note" style="margin:12px 16px">📝 ${esc(form.join(" · "))}</div></div>` : "") +
    s.exercises.map((ex) => `
    <div class="section-title">${esc(ex.name)}${ex.skipped ? " · übersprungen" : !ex.sets.length ? " · nicht gemacht" : ""}${ex.deload ? " · Deload" : ""}</div>
    ${ex.sets.length ? `<div class="card">${ex.sets.map((set) => `
      <div class="setrow">
        <span class="check ${set.completed ? "on" : ""}" style="cursor:default">${set.completed ? "✓" : ""}</span>
        ${set.isWarmup ? `<span class="warm-tag">Aufwärmen</span>` : `<span class="warm-tag"></span>`}
        <span class="spacer"></span>
        <span>${set.reps} × ${fmtWeight(set.weight)}</span>
      </div>`).join("")}</div>` : ""}`).join("") +
    `<div style="margin-top:24px"><button class="btn btn-block btn-ghost" id="edit">✎ Einheit bearbeiten</button></div>
     <div style="margin-top:10px"><button class="btn btn-block btn-text btn-danger" id="del">Einheit löschen</button></div>`;
  const modal = openModal(fmtDate(s.date), body, { single: true });
  modal.body.querySelector("#edit").onclick = () => {
    modal.close();
    openSession(structuredClone(s), { edit: true });
  };
  modal.body.querySelector("#del").onclick = () => {
    store.deleteSession(id); modal.close(); render();
    toast("Einheit gelöscht", () => { store.saveSession(s); render(); });
  };
}

// ---------- Dashboard: Fortschritt einer Übung ----------
function openProgress(routineId, exerciseId) {
  function build() {
    const ex = store.exercise(exerciseId);
    if (!ex) return "";
    const hist = store.history(exerciseId);
    const targetsHtml = ex.targets.map((t, i) => `
      <div class="setrow">
        ${t.isWarmup
          ? `<span class="warm-tag">Aufwärmen</span>`
          : `<span class="warm-tag" style="color:var(--faint)">Satz ${i + 1}</span>`}
        <span class="spacer"></span><span>${t.reps} × ${fmtWeight(t.weight)}</span></div>`).join("");

    // Geschätztes 1RM (Epley) über den Verlauf
    let rmHtml = "";
    const rms = hist.map((h) => best1RM(h.logged)).filter((v) => v > 0);
    if (rms.length) {
      const bestEver = Math.max(...rms);
      const lastRm = rms[rms.length - 1];
      rmHtml = `<div class="row" style="border:none;cursor:default">
        <span class="grow"><h3 style="font-size:15px">💪 Geschätztes 1RM (Epley)</h3>
        <div class="sub">Aktuell ${nf.format(lastRm)} kg · Bestwert ${nf.format(bestEver)} kg</div></span></div>`;
    }

    let charts = "";
    if (hist.length >= 2) {
      const tw = hist.map((h) => ({
        t: +new Date(h.date), y: exerciseTopWeight(h.logged),
        label: fmtDate(h.date), v: fmtWeight(exerciseTopWeight(h.logged)),
      }));
      charts = `<div class="section-title">Top-Gewicht</div>
        ${trendSummary(tw)}
        ${chartCard(lineChart(tw, { forecastWeeks: 4 }))}`;

      const rms = hist.map((h) => ({
        t: +new Date(h.date), y: best1RM(h.logged),
        label: fmtDate(h.date), v: nf.format(best1RM(h.logged)) + " kg",
      })).filter((p) => p.y > 0);
      if (rms.length >= 2) {
        charts += `<div class="section-title">Geschätztes 1RM</div>
          ${trendSummary(rms)}
          ${chartCard(lineChart(rms, { forecastWeeks: 4 }))}`;
      }

      const vol = hist.map((h) => ({
        y: exerciseVolume(h.logged), label: fmtDate(h.date),
        v: `${Math.round(exerciseVolume(h.logged))} kg`,
      }));
      charts += `<div class="section-title">Volumen (Wdh × kg)</div>
        ${chartCard(barChart(vol))}`;
    }
    let table = "";
    if (hist.length) {
      table = `<div class="section-title">Verlauf</div><div class="card tbl">` +
        hist.slice().reverse().map((h) => `<div class="trow">
          <div class="d">${fmtDate(h.date)}</div>
          <div class="s">${workingSets(h.logged.sets).map((s) => `${s.reps}×${fmtWeightShort(s.weight)}`).join("  ")}</div>
        </div>`).join("") + `</div>`;
    }
    const st = store.progressionStatus(ex);
    const statusBlock = `<div class="row" style="border:none;cursor:default">
      <span class="grow">${statusPill(st)}
        <div class="sub" style="margin-top:4px">${esc(statusDetail(st))}</div></span></div>`;
    const applyBtn = st.kind === "readyToIncrease"
      ? `<div class="setrow"><button class="btn-text" id="apply-inc" style="color:var(--green);font-weight:700">▲ Auf ${fmtWeight(st.suggested)} erhöhen</button></div>`
      : (st.kind === "deloadSuggested" || st.kind === "stalled")
        ? `<div class="setrow"><button class="btn-text" id="deload" style="color:#ff7a85;font-weight:700">⤵ Deload einplanen (−10 % nächste Einheit)</button></div>`
        : st.kind === "deloadPlanned"
          ? `<div class="setrow"><button class="btn-text" id="undeload">Deload zurücknehmen</button></div>`
          : "";
    return `<div class="section-title">Aktuelle Vorgabe</div>
      <div class="card">${targetsHtml}${statusBlock}${applyBtn}${rmHtml}
        <div class="setrow"><button class="btn-text" id="adjust">⚙ Arbeitsgewicht anpassen</button></div></div>
      ${suggestionSection(ex)}
      ${hist.length >= 2 ? whySection(exerciseId) : ""}
      ${charts}${table}`;
  }

  routineId = routineId ?? routineOf(exerciseId)?.id;
  const exName = store.exercise(exerciseId)?.name || "";
  const modal = openModal(exName, build(), { single: true });
  modal.body.addEventListener("click", (e) => {
    if (e.target.id === "apply-inc") {
      store.applySuggestedIncrease(routineId, exerciseId);
      modal.body.innerHTML = build();
    } else if (e.target.id === "deload" || e.target.id === "undeload") {
      store.scheduleDeload(exerciseId, e.target.id === "deload");
      modal.body.innerHTML = build();
    } else if (e.target.id === "adjust") {
      const ex = store.exercise(exerciseId);
      const cur = ex.targets.find((t) => !t.isWarmup)?.weight ?? 0;
      const v = prompt("Arbeitsgewicht aller Arbeitssätze (kg):", String(cur));
      if (v !== null) { store.setTargetWeight(num(v), routineId, exerciseId); modal.body.innerHTML = build(); }
    }
  });
}

// ---------- Routinen-Auswahl zum Bearbeiten ----------
function openRoutinePicker() {
  const body = `<div class="card">${store.routines.map((r, i) => `
    <button class="row" data-pick="${i}"><span class="grow"><h3>${esc(r.name)}</h3>
      <div class="sub">${plural(r.exercises.length, "Übung", "Übungen")}</div></span><span class="chev">›</span></button>`).join("")}</div>`;
  const modal = openModal("Workouts", body, { single: true });
  modal.body.addEventListener("click", (e) => {
    const p = e.target.closest("[data-pick]"); if (!p) return;
    modal.close(); openRoutineEdit(structuredClone(store.routines[+p.dataset.pick]), false);
  });
}

// ---------- Routine bearbeiten ----------
function openRoutineEdit(routine, isNew) {
  const modal = openModal(isNew ? "Neues Workout" : "Bearbeiten", editBody(routine), {
    doneLabel: "Sichern",
    onDone: () => store.upsertRoutine(routine),
  });
  const body = modal.body;
  const refresh = () => { body.innerHTML = editBody(routine); };

  body.addEventListener("input", (e) => {
    const inp = e.target.closest("input, textarea"); if (!inp) return;
    const f = inp.dataset.field;
    if (f === "rname") routine.name = inp.value;
    else if (f === "ename") routine.exercises[+inp.dataset.ex].name = inp.value;
    else if (f === "enote") routine.exercises[+inp.dataset.ex].note = inp.value;
    else if (f === "inc") routine.exercises[+inp.dataset.ex].increment = num(inp.value);
    else {
      const tg = routine.exercises[+inp.dataset.ex].targets[+inp.dataset.t];
      tg[f] = f === "reps" ? Math.round(num(inp.value)) : num(inp.value);
    }
  });
  body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const act = t.dataset.act, ex = routine.exercises[+t.dataset.ex];
    if (act === "warm") { const tg = ex.targets[+t.dataset.t]; tg.isWarmup = !tg.isWarmup; refresh(); }
    else if (act === "del-set") { ex.targets.splice(+t.dataset.t, 1); refresh(); }
    else if (act === "add-set") { const l = ex.targets.filter((t) => !t.isWarmup).at(-1); ex.targets.push(mkTarget(l?.reps ?? 8, l?.weight ?? 0)); refresh(); }
    else if (act === "warmups") {
      // Spätere Übungen (Index > 0): Muskulatur schon warm → nur 1 Einpendel-Satz.
      const later = (+t.dataset.ex) > 0;
      const gen = warmupTargets(topWorkingWeight(ex.targets), { later });
      if (!gen.length) { alert("Für Körpergewichtsübungen (0 kg) gibt es keine prozentualen Aufwärmsätze."); return; }
      // Vorhandene Aufwärmsätze ersetzen (idempotent), Rampe vor die Arbeitssätze.
      ex.targets = [...gen, ...ex.targets.filter((t) => !t.isWarmup)];
      refresh();
    }
    else if (act === "del-ex") {
      const i = +t.dataset.ex;
      const [removed] = routine.exercises.splice(i, 1); refresh();
      toast(`${removed.name || "Übung"} entfernt`, () => { routine.exercises.splice(i, 0, removed); refresh(); });
    }
    else if (act === "add-ex") { routine.exercises.push(mkExercise("", [mkTarget(8, 0)])); refresh(); }
    else if (act === "del-routine") {
      const idx = store.routines.findIndex((r) => r.id === routine.id);
      const backup = idx >= 0 ? store.routines[idx] : null;
      store.deleteRoutine(routine.id); modal.close(); render();
      if (backup) toast(`Workout „${backup.name}“ gelöscht`, () => {
        store.routines.splice(idx, 0, backup); store.upsertRoutine(backup); render();
      });
    }
  });
}

function editBody(routine) {
  const ex = routine.exercises.map((e, ei) => {
    const targets = e.targets.map((t, ti) => `
      <div class="setrow">
        <button class="check ${t.isWarmup ? "won" : ""}" data-act="warm" data-ex="${ei}" data-t="${ti}"
          title="Aufwärmsatz umschalten">${t.isWarmup ? "🔥" : ""}</button>
        <span class="spacer"></span>
        <span class="numwrap">
          <input class="w-reps" type="number" inputmode="numeric" value="${t.reps}" data-ex="${ei}" data-t="${ti}" data-field="reps">
          <span class="times">×</span>
          <input class="w-kg" type="number" inputmode="decimal" step="0.25" value="${t.weight}" data-ex="${ei}" data-t="${ti}" data-field="weight">
          <span class="unit">kg</span>
        </span>
        <button class="del-x" data-act="del-set" data-ex="${ei}" data-t="${ti}" aria-label="Satz löschen">✕</button>
      </div>`).join("");
    return `<div class="modal-grp">
      <div class="setrow"><input type="text" style="width:100%;font-weight:650" placeholder="Übungsname"
        value="${esc(e.name)}" data-field="ename" data-ex="${ei}"></div>
      <div class="setrow"><textarea class="ex-note-input" rows="1" placeholder="Notiz (z. B. Griff, Tempo, Hinweise)"
        data-field="enote" data-ex="${ei}">${esc(e.note ?? "")}</textarea></div>
      ${targets}
      <div class="setrow"><button class="btn-text" data-act="add-set" data-ex="${ei}">＋ Arbeitssatz</button>
        <span class="spacer"></span>
        <button class="btn-text warm-add" data-act="warmups" data-ex="${ei}">🔥 Aufwärmen</button></div>
      <div class="row-hint">🔥 Aufwärmsatz zählt nicht zum Fortschritt. „Aufwärmen“ erzeugt ${ei === 0
        ? "die volle Rampe (40·60·80 %) für die erste Übung"
        : "1 Einpendel-Satz (60 %) – spätere Übung, Muskulatur schon warm"}; danach frei anpassbar.</div>
      <div class="setrow"><span class="unit">Steigerung je Einheit</span>
        <span class="spacer"></span>
        <input class="w-kg" type="number" inputmode="decimal" step="0.25" value="${e.increment}" data-field="inc" data-ex="${ei}">
        <span class="unit">kg</span></div>
      <div class="setrow"><button class="btn-text btn-danger" data-act="del-ex" data-ex="${ei}">Übung entfernen</button></div>
    </div>`;
  }).join("");
  return `<div class="modal-grp"><div class="setrow"><input type="text" style="width:100%"
      placeholder="Workout-Name" value="${esc(routine.name)}" data-field="rname"></div></div>
    ${ex}
    <div style="margin-top:14px"><button class="btn btn-block btn-ghost" data-act="add-ex">＋ Übung hinzufügen</button></div>
    <div style="margin-top:10px"><button class="btn btn-block btn-text btn-danger" data-act="del-routine">Workout löschen</button></div>`;
}

// ---------- Interaktive SVG-Charts ----------
// Punkte: { y, label, v (Anzeigetext) } – Line-Charts zusätzlich { t (ms) }.
// Antippen/Wischen zeigt Crosshair + Tooltip; Line-Charts können eine
// Prognose (lineare Regression, gestrichelt) in die Zukunft zeichnen.
const CW = 340, CH = 170, PADL = 38, PADB = 24, PADT = 18;
const WEEK_MS = 7 * 86400000;

function gridLines(min, max, fmt) {
  return [0, 0.5, 1].map((f) => {
    const v = min + (max - min) * f;
    const y = CH - PADB - f * (CH - PADT - PADB);
    return `<line x1="${PADL}" y1="${y.toFixed(1)}" x2="${CW - 10}" y2="${y.toFixed(1)}" stroke="#2b3160" stroke-dasharray="${f ? "3 4" : "0"}"/>
      <text x="${PADL - 5}" y="${(y + 3.5).toFixed(1)}" fill="#6b7099" font-size="10" text-anchor="end">${fmt(v)}</text>`;
  }).join("");
}

const crosshairHtml = `<g class="xh" visibility="hidden">
    <line x1="0" x2="0" y1="${PADT}" y2="${CH - PADB}" stroke="#8b9bff" stroke-width="1" stroke-dasharray="2 3" opacity="0.8"/>
    <circle cx="0" r="4.5" fill="none" stroke="#f4f5fa" stroke-width="2"/>
  </g>`;

function svgOpen(ptsAttr) {
  const json = JSON.stringify(ptsAttr).replace(/'/g, "&#39;");
  return `<svg class="chart" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid meet" data-w="${CW}" data-pts='${json}'>`;
}

function chartCard(svg) {
  return `<div class="card chart-card">${svg}<div class="tip" hidden></div></div>`;
}

function lineChart(points, opts = {}) {
  const hasTime = points.every((p) => Number.isFinite(p.t));
  const t0 = hasTime ? points[0].t : 0;
  let tEnd = hasTime ? points.at(-1).t : points.length - 1;

  // Prognose: Regression über die Historie, gestrichelt fortgeschrieben.
  let fc = null;
  if (opts.forecastWeeks && hasTime && points.length >= 3) {
    const reg = linearTrend(points.map((p) => ({ t: p.t, y: p.y })));
    if (reg) {
      const tF = points.at(-1).t + opts.forecastWeeks * WEEK_MS;
      fc = { t1: points.at(-1).t, y1: reg.slope * points.at(-1).t + reg.intercept,
             t2: tF, y2: Math.max(0, reg.slope * tF + reg.intercept) };
      tEnd = tF;
    }
  }

  const span = (tEnd - t0) || 1;
  const X = (t, i) => PADL + (((hasTime ? t : i) - t0) / span) * (CW - PADL - 12);
  const ys = points.map((p) => p.y).concat(fc ? [fc.y2] : []);
  const max = Math.max(...ys), rawMin = Math.min(...ys);
  const min = rawMin === max ? Math.max(0, rawMin - 1) : rawMin;
  const ySpan = max - min || 1;
  const Y = (v) => CH - PADB - ((v - min) / ySpan) * (CH - PADT - PADB);

  const coords = points.map((p, i) => [X(p.t, i), Y(p.y)]);
  const ptsAttr = points.map((p, i) => ({ x: +coords[i][0].toFixed(1), y: +coords[i][1].toFixed(1), l: p.label, v: p.v }));
  const lineStr = coords.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
  const area = `M ${coords[0][0].toFixed(1)},${CH - PADB} L ${lineStr.replace(/ /g, " L ")} L ${coords.at(-1)[0].toFixed(1)},${CH - PADB} Z`;
  const dots = coords.map(([a, b], i) =>
    `<circle cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="${i === coords.length - 1 ? 4.5 : 3}" fill="#7c8cf8"/>`).join("");

  let fcHtml = "";
  if (fc) {
    const x1 = X(fc.t1), x2 = X(fc.t2);
    fcHtml = `<line x1="${x1.toFixed(1)}" y1="${Y(fc.y1).toFixed(1)}" x2="${x2.toFixed(1)}" y2="${Y(fc.y2).toFixed(1)}"
        stroke="#b18cff" stroke-width="2" stroke-dasharray="5 5" opacity="0.85"/>
      <circle cx="${x2.toFixed(1)}" cy="${Y(fc.y2).toFixed(1)}" r="4" fill="none" stroke="#b18cff" stroke-width="2"/>
      <text x="${(x2 - 2).toFixed(1)}" y="${Math.max(12, Y(fc.y2) - 9).toFixed(1)}" fill="#b18cff" font-size="11" font-weight="700" text-anchor="end">≈ ${nf.format(fc.y2)}</text>`;
  }

  const [lx, ly] = coords.at(-1);
  const lastLbl = `<text x="${lx.toFixed(1)}" y="${Math.max(12, ly - 10).toFixed(1)}" fill="#f2f3f7" font-size="11" font-weight="700" text-anchor="middle">${esc(points.at(-1).v)}</text>`;

  return `${svgOpen(ptsAttr)}
    <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7c8cf8" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#7c8cf8" stop-opacity="0.02"/>
    </linearGradient></defs>
    ${gridLines(min, max, (v) => nf.format(v))}
    <path d="${area}" fill="url(#lg)"/>
    <polyline points="${lineStr}" fill="none" stroke="#7c8cf8" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${fcHtml}${lastLbl}
    <text x="${PADL}" y="${CH - 6}" fill="#6b7099" font-size="10">${points[0].label}</text>
    <text x="${CW - 10}" y="${CH - 6}" fill="#6b7099" font-size="10" text-anchor="end">${fc ? `+${opts.forecastWeeks} Wo.` : points.at(-1).label}</text>
    ${crosshairHtml}
  </svg>`;
}

function barChart(points) {
  const max = Math.max(...points.map((p) => p.y)) || 1;
  const gap = (CW - PADL - 12) / points.length;
  const bw = Math.min(gap * 0.62, 34);
  const ptsAttr = [];
  const bars = points.map((p, i) => {
    const h = (p.y / max) * (CH - PADT - PADB);
    const bx = PADL + i * gap + (gap - bw) / 2;
    const ty = CH - PADB - h;
    ptsAttr.push({ x: +(bx + bw / 2).toFixed(1), y: +ty.toFixed(1), l: p.label, v: p.v });
    return `<rect x="${bx.toFixed(1)}" y="${ty.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 1.5).toFixed(1)}" rx="3.5" fill="#7c8cf8" opacity="${i === points.length - 1 ? 1 : 0.55}"/>`;
  }).join("");
  return `${svgOpen(ptsAttr)}
    ${gridLines(0, max, (v) => String(Math.round(v)))}${bars}
    <text x="${PADL}" y="${CH - 6}" fill="#6b7099" font-size="10">${points[0].label}</text>
    <text x="${CW - 10}" y="${CH - 6}" fill="#6b7099" font-size="10" text-anchor="end">${points.at(-1).label}</text>
    ${crosshairHtml}
  </svg>`;
}

/// Trend-Zusammenfassung unter Chart-Überschriften: Steigung/Woche + 4-Wochen-Prognose.
function trendSummary(points) {
  if (points.length < 3) return "";
  const reg = linearTrend(points.map((p) => ({ t: p.t, y: p.y })));
  if (!reg) return "";
  const perWeek = reg.slope * WEEK_MS;
  const proj = Math.max(0, reg.slope * (points.at(-1).t + 4 * WEEK_MS) + reg.intercept);
  const arrow = perWeek > 0.05
    ? `<span style="color:var(--green)">▲ +${nf.format(perWeek)} kg/Woche</span>`
    : perWeek < -0.05
      ? `<span style="color:#ff7a85">▼ ${nf.format(perWeek)} kg/Woche</span>`
      : `<span>→ stabil</span>`;
  return `<div class="trend">${arrow} · Prognose in 4 Wochen: <b>≈ ${nf.format(proj)} kg</b></div>`;
}

// ---------- Mehrlinien-Chart (Dashboard: je Übung bzw. je Workout-Art) ----------
// series: [{ name, color, pts:[{t (ms), y}], target }]
// Zeichnet je Serie eine Linie über eine gemeinsame Zeitachse; optional die
// aktuelle Vorgabe ("Theorie") als gestrichelte Linie in der Serienfarbe.
// fmtY formatiert die Tooltip-Werte (Standard: Gewicht in kg).
// Interaktiv: Crosshair schnappt auf die Trainingstage (gemeinsame x-Spalten).
const MPADL = 30, MPADR = 12, MPADT = 16, MPADB = 22;
function multiLineChart(series, { showTheorie, fmtY, padL } = {}) {
  const fy = fmtY ?? fmtWeightShort;
  // Linker Rand: dreistellige kg-Werte auf der Achse brauchen mehr Platz als
  // die zweistelligen Übungsgewichte, sonst wird die Beschriftung beschnitten.
  const PL = padL ?? MPADL;
  const withPts = series.filter((s) => s.pts.length);
  const allT = withPts.flatMap((s) => s.pts.map((p) => p.t));
  const ys = withPts.flatMap((s) => s.pts.map((p) => p.y));
  if (showTheorie) series.forEach((s) => { if (s.target > 0) ys.push(s.target); });
  const tMin = Math.min(...allT), tMax = Math.max(...allT);
  const tSpan = (tMax - tMin) || 1;
  let max = Math.max(...ys), min = Math.min(...ys);
  const padY = (max - min) * 0.12 || 1;
  max += padY; min = Math.max(0, min - padY);
  const ySpan = (max - min) || 1;
  const X = (t) => allT.length === 1 ? (PL + (CW - PL - MPADR) / 2) : PL + ((t - tMin) / tSpan) * (CW - PL - MPADR);
  const Y = (v) => CH - MPADB - ((v - min) / ySpan) * (CH - MPADT - MPADB);

  let s = gridLines2(min, max, fmtY, PL);

  // Theorie-Linien (gestrichelt) hinter den Ist-Linien.
  if (showTheorie) {
    for (const se of series) {
      if (!(se.target > 0)) continue;
      const y = Y(se.target).toFixed(1);
      s += `<line x1="${PL}" y1="${y}" x2="${CW - MPADR}" y2="${y}" stroke="${se.color}" stroke-width="1.5" stroke-dasharray="5 5" opacity="0.55"/>`;
    }
  }

  // Ist-Linien + Punkte.
  for (const se of withPts) {
    const coords = se.pts.map((p) => [X(p.t), Y(p.y)]);
    if (coords.length > 1) {
      s += `<polyline points="${coords.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ")}" fill="none" stroke="${se.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    s += coords.map(([a, b], i) => `<circle cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="${i === coords.length - 1 ? 4 : 2.6}" fill="${se.color}"/>`).join("");
  }

  // Gemeinsame x-Spalten (Trainingstage) für die Crosshair-Interaktion.
  const tset = [...new Set(allT)].sort((a, b) => a - b);
  const cols = tset.map((tt) => {
    const items = [];
    for (const se of withPts) {
      const p = se.pts.find((q) => q.t === tt);
      if (p) items.push({ y: +Y(p.y).toFixed(1), color: se.color, txt: `${se.name} ${fy(p.y)}` });
    }
    return { x: +X(tt).toFixed(1), label: fmtDate(new Date(tt).toISOString()), items };
  });

  const startLbl = fmtDate(new Date(tMin).toISOString());
  const endLbl = fmtDate(new Date(tMax).toISOString());
  const colsJson = JSON.stringify(cols).replace(/'/g, "&#39;");
  return `<svg class="chart mchart" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid meet" data-w="${CW}" data-cols='${colsJson}'>
    ${s}
    <text x="${PL}" y="${CH - 6}" fill="#6b7099" font-size="10">${startLbl}</text>
    <text x="${CW - MPADR}" y="${CH - 6}" fill="#6b7099" font-size="10" text-anchor="end">${endLbl}</text>
    <g class="mxh" visibility="hidden"><line x1="0" x2="0" y1="${MPADT}" y2="${CH - MPADB}" stroke="#8b9bff" stroke-width="1" stroke-dasharray="2 3" opacity="0.8"/></g>
    <g class="mdots"></g>
  </svg>`;
}

// Achsen-Gitter für den Mehrlinien-Chart (eigene Paddings).
// fmt hält große Werte (Volumen) kurz, damit die Beschriftung in MPADL passt.
function gridLines2(min, max, fmt, padL) {
  const lbl = fmt ?? ((v) => nf.format(v));
  const PL = padL ?? MPADL;
  return [0, 0.5, 1].map((f) => {
    const v = min + (max - min) * f;
    const y = CH - MPADB - f * (CH - MPADT - MPADB);
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${CW - MPADR}" y2="${y.toFixed(1)}" stroke="#2b3160" stroke-dasharray="${f ? "3 4" : "0"}"/>
      <text x="${PL - 5}" y="${(y + 3.5).toFixed(1)}" fill="#6b7099" font-size="10" text-anchor="end">${lbl(v)}</text>`;
  }).join("");
}

// ---------- Trainings-Heatmap ----------
function heatmapHtml({ grid, start, weeks, maxVol, days }) {
  const cell = 13, gap = 4, gx = 22, gy = 8, rows = 7;
  const dayLab = ["M", "D", "M", "D", "F", "S", "S"];
  const w = gx + weeks * (cell + gap) + 4;
  const h = gy + rows * (cell + gap) + 26;
  let s = `<svg class="heatmap" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">`;
  dayLab.forEach((d, r) => { if (r % 2 === 0) s += `<text x="${gx - 6}" y="${gy + r * (cell + gap) + 10}" fill="#686e99" font-size="8.5" text-anchor="end">${d}</text>`; });
  for (let wk = 0; wk < weeks; wk++) {
    for (let r = 0; r < rows; r++) {
      const vol = grid[wk][r];
      const x = gx + wk * (cell + gap), y = gy + r * (cell + gap);
      let fill = "#262d58", op = 1;
      if (vol > 0) { fill = "#3ddc97"; op = 0.35 + 0.65 * (maxVol ? vol / maxVol : 1); }
      s += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${fill}" opacity="${op.toFixed(2)}"/>`;
    }
  }
  // Monatsmarken unter dem Gitter
  const baseY = gy + rows * (cell + gap) + 14;
  let lastMonth = -1;
  for (let wk = 0; wk < weeks; wk++) {
    const d = new Date(start); d.setDate(d.getDate() + wk * 7);
    if (d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth();
      s += `<text x="${gx + wk * (cell + gap)}" y="${baseY}" fill="#686e99" font-size="9">${d.toLocaleDateString("de-DE", { month: "short" })}</text>`;
    }
  }
  s += `</svg>`;
  const sub = `<div class="hm-sub">${plural(days, "Trainingstag", "Trainingstage")} in 12 Wochen</div>`;
  return `<div class="hm-wrap">${s}${sub}</div>`;
}

// ---------- Chart-Interaktion (Tippen/Wischen → Crosshair + Tooltip) ----------
function chartScrub(e) {
  const svg = e.target.closest && e.target.closest("svg.chart[data-pts]");
  if (!svg) return;
  const pts = JSON.parse(svg.dataset.pts);
  if (!pts.length) return;
  const rect = svg.getBoundingClientRect();
  const vb = ((e.clientX - rect.left) / rect.width) * +svg.dataset.w;
  let best = 0;
  for (let i = 1; i < pts.length; i++)
    if (Math.abs(pts[i].x - vb) < Math.abs(pts[best].x - vb)) best = i;
  const p = pts[best];

  const xh = svg.querySelector(".xh");
  xh.setAttribute("visibility", "visible");
  xh.setAttribute("transform", `translate(${p.x},0)`);
  xh.querySelector("circle").setAttribute("cy", p.y);

  const card = svg.closest(".chart-card");
  const tip = card && card.querySelector(".tip");
  if (tip) {
    tip.hidden = false;
    tip.textContent = `${p.l} · ${p.v}`;
    const cardRect = card.getBoundingClientRect();
    const cssX = rect.left - cardRect.left + (p.x / +svg.dataset.w) * rect.width;
    tip.style.left = `${Math.min(Math.max(cssX - tip.offsetWidth / 2, 4), cardRect.width - tip.offsetWidth - 4)}px`;
  }
}

function chartHide(e) {
  const svg = e.target.closest && e.target.closest("svg.chart[data-pts]");
  if (!svg) return;
  if (e.relatedTarget && svg.contains(e.relatedTarget)) return;
  const xh = svg.querySelector(".xh");
  if (xh) xh.setAttribute("visibility", "hidden");
  const tip = svg.closest(".chart-card")?.querySelector(".tip");
  if (tip) tip.hidden = true;
}

// Crosshair + Tooltip für den Mehrlinien-Chart (zeigt alle Übungen am Trainingstag).
function mchartScrub(e) {
  const svg = e.target.closest && e.target.closest("svg.mchart[data-cols]");
  if (!svg) return;
  const cols = JSON.parse(svg.dataset.cols);
  if (!cols.length) return;
  const rect = svg.getBoundingClientRect();
  const vb = ((e.clientX - rect.left) / rect.width) * +svg.dataset.w;
  let best = 0;
  for (let i = 1; i < cols.length; i++)
    if (Math.abs(cols[i].x - vb) < Math.abs(cols[best].x - vb)) best = i;
  const col = cols[best];

  const xh = svg.querySelector(".mxh");
  xh.setAttribute("visibility", "visible");
  xh.querySelector("line").setAttribute("transform", `translate(${col.x},0)`);
  svg.querySelector(".mdots").innerHTML = col.items
    .map((it) => `<circle cx="${col.x}" cy="${it.y}" r="4.5" fill="none" stroke="#f4f5fa" stroke-width="2"/>`).join("");

  const card = svg.closest(".chart-card");
  const tip = card && card.querySelector(".tip");
  if (tip) {
    tip.hidden = false;
    tip.classList.add("multi");
    tip.innerHTML = `<b>${col.label}</b>` +
      col.items.map((it) => ` · <span style="color:${it.color}">${it.txt}</span>`).join("");
    const cardRect = card.getBoundingClientRect();
    const cssX = rect.left - cardRect.left + (col.x / +svg.dataset.w) * rect.width;
    tip.style.left = `${Math.min(Math.max(cssX - tip.offsetWidth / 2, 4), cardRect.width - tip.offsetWidth - 4)}px`;
  }
}
function mchartHide(e) {
  const svg = e.target.closest && e.target.closest("svg.mchart[data-cols]");
  if (!svg) return;
  if (e.relatedTarget && svg.contains(e.relatedTarget)) return;
  svg.querySelector(".mxh")?.setAttribute("visibility", "hidden");
  svg.querySelector(".mdots").innerHTML = "";
  const tip = svg.closest(".chart-card")?.querySelector(".tip");
  if (tip) { tip.hidden = true; tip.classList.remove("multi"); }
}

document.addEventListener("pointermove", chartScrub);
document.addEventListener("pointerdown", chartScrub);
document.addEventListener("pointerout", chartHide);
document.addEventListener("pointermove", mchartScrub);
document.addEventListener("pointerdown", mchartScrub);
document.addEventListener("pointerout", mchartHide);

render();
