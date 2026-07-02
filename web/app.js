import {
  Store, routine as mkRoutine, exercise as mkExercise, setTarget as mkTarget,
  exerciseVolume, exerciseTopWeight, sessionVolume, sessionCompletedSetCount,
  topTargetWeight, workingSets, best1RM, linearTrend,
  rangeStart, trainingHeatmap, personalRecords,
  fmtWeight, fmtWeightShort, fmtDate,
} from "./model.js";

const store = new Store(window.localStorage);
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
};
const STATUS_PRIORITY = { deloadSuggested: 0, stalled: 1, readyToIncrease: 2, maintaining: 3, progressing: 4, noData: 5 };

function statusPill(st) {
  const m = STATUS_META[st.kind];
  if (!m || st.kind === "noData") return "";
  return `<span class="pill ${m.cls}">${m.label}</span>`;
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
      return `Ziel-Wiederholungen zweimal erreicht. Zeit für mehr Gewicht: ${fmtWeight(st.suggested)}.`;
    case "stalled":
      return `Seit ${st.sessions} Einheiten kein neuer Bestwert. Variiere Wdh/Tempo oder leg einen Deload ein.`;
    case "deloadSuggested":
      return `Seit ${st.sessions} Einheiten festgefahren. Plane eine leichtere Woche (~50 % Volumen) und greif dann frisch an.`;
    default:
      return "";
  }
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
    ${draftHtml}
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
        <div class="sub2">${plural(sessionCompletedSetCount(s), "Satz", "Sätze")} · Volumen ${Math.round(sessionVolume(s))} kg</div>
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
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><h3>${esc(ex.name)}</h3>${statusPill(st)}</div>
        <div class="sub2" style="color:var(--muted);margin-top:2px">${esc(statusDetail(st))}</div>
      </span><span class="chev">›</span>
    </button>`).join("");

  screen.innerHTML = `<h1 class="nav-title">Steigerung</h1><div class="card">${rows}</div>`;
}

// ---------- Tab: Dashboard ----------
// Farbpalette für die Übungs-Linien im Verlaufschart (zyklisch vergeben).
const SERIES_COLORS = ["#8b9bff", "#3ddc97", "#ffa057", "#b18cff", "#5ad1e6", "#ff7a9c", "#ffd166", "#7cf0c8"];
const RANGES = [["4 W", 28], ["12 W", 84], ["1 J", 365], ["Alle", 0]];

// Dashboard-Zustand (Zeitraum, sichtbare Übungen, Theorie-Linie) – überlebt
// Re-Renders innerhalb der Sitzung und wird in localStorage gespiegelt.
const DASH = loadDashState();
function loadDashState() {
  let saved = {};
  try { saved = JSON.parse(window.localStorage.getItem("ironjournal.dash") || "{}"); } catch { /* egal */ }
  return { range: saved.range ?? 84, theorie: saved.theorie ?? true, active: Array.isArray(saved.active) ? saved.active : null };
}
function saveDashState() {
  try {
    window.localStorage.setItem("ironjournal.dash",
      JSON.stringify({ range: DASH.range, theorie: DASH.theorie, active: DASH.active }));
  } catch { /* egal */ }
}

// Stabile, abgeflachte Übungsliste mit fester Farbe je Übung.
function allExercises() {
  const out = [];
  store.routines.forEach((r) => r.exercises.forEach((ex) =>
    out.push({ ex, routineId: r.id, color: SERIES_COLORS[out.length % SERIES_COLORS.length] })));
  return out;
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
  // Übungen, die im gewählten Zeitraum überhaupt Verlaufsdaten haben.
  const start = rangeStart(DASH.range);
  const withData = list.map((item) => {
    const hist = store.history(item.ex.id)
      .filter((h) => (!start || new Date(h.date) >= start));
    return { ...item, pts: hist.map((h) => ({ t: +new Date(h.date), y: exerciseTopWeight(h.logged) })).filter((p) => p.y > 0) };
  }).filter((it) => it.pts.length);

  // Standard-Auswahl: die drei meist-trainierten Übungen.
  if (DASH.active === null) {
    DASH.active = withData.slice()
      .sort((a, b) => b.pts.length - a.pts.length)
      .slice(0, 3).map((it) => it.ex.id);
    saveDashState();
  }
  const activeSet = new Set(DASH.active);

  // ---- Hero: Gewichtsverlauf je Übung ----
  html += `<div class="seg" role="tablist">` +
    RANGES.map(([label, days]) =>
      `<button class="seg-btn ${days === DASH.range ? "on" : ""}" data-range="${days}">${label}</button>`).join("") +
    `</div>`;

  const series = withData.filter((it) => activeSet.has(it.ex.id)).map((it) => ({
    name: it.ex.name, color: it.color, pts: it.pts, target: topTargetWeight(it.ex),
  }));

  html += `<div class="section-title">Gewicht je Übung</div>`;
  html += `<div class="card chart-card mchart-card">`;
  html += series.length
    ? multiLineChart(series, { showTheorie: DASH.theorie })
    : `<div class="chart-empty">Wähle unten eine Übung aus, um ihren Verlauf zu sehen.</div>`;
  html += `<div class="tip" hidden></div></div>`;

  // Legende: Übungen ein-/ausblenden + Theorie-Linie umschalten.
  html += `<div class="legend">` +
    withData.map((it) => {
      const on = activeSet.has(it.ex.id);
      return `<button class="lchip ${on ? "on" : ""}" data-toggle-ex="${it.ex.id}" style="--dot:${it.color}">
        <span class="ldot"></span>${esc(it.ex.name)}</button>`;
    }).join("") +
    `<button class="lchip theorie ${DASH.theorie ? "on" : ""}" data-toggle-theorie="1">
       <span class="ldash"></span>Theorie (Vorgabe)</button>` +
    `</div>`;

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
  for (const r of store.routines) {
    html += `<div class="section-title">${esc(r.name)}</div><div class="card">`;
    html += r.exercises.map((ex) => {
      const last = store.lastSession(ex.id);
      const sub = last
        ? `Top ${fmtWeight(exerciseTopWeight(last.logged))} · ${relDate(last.date)}`
        : `Vorgabe ${fmtWeight(topTargetWeight(ex))}`;
      const pill = statusPill(store.progressionStatus(ex));
      return `<button class="row" data-action="progress" data-r="${r.id}" data-e="${ex.id}">
        <span class="grow"><h3>${esc(ex.name)}</h3><div class="sub">${sub}</div></span>${pill}
        <span class="chev">›</span></button>`;
    }).join("");
    html += `</div>`;
  }

  html += dataCardHtml();
  screen.innerHTML = html;
}

function dataCardHtml() {
  return `
    <div class="section-title">Daten</div>
    <div class="card">
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

// ---------- Aktionen (Event-Delegation) ----------
screen.addEventListener("click", (e) => {
  // Dashboard-Steuerung (Zeitraum / Übungen ein-/ausblenden / Theorie-Linie)
  const rangeBtn = e.target.closest("[data-range]");
  if (rangeBtn) { DASH.range = +rangeBtn.dataset.range; saveDashState(); rerenderDashboard(); return; }
  const exBtn = e.target.closest("[data-toggle-ex]");
  if (exBtn) {
    const id = exBtn.dataset.toggleEx;
    const set = new Set(DASH.active);
    set.has(id) ? set.delete(id) : set.add(id);
    DASH.active = [...set]; saveDashState(); rerenderDashboard(); return;
  }
  const thBtn = e.target.closest("[data-toggle-theorie]");
  if (thBtn) { DASH.theorie = !DASH.theorie; saveDashState(); rerenderDashboard(); return; }

  const b = e.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action;
  if (a === "start") openSession(store.makeSession(store.routines[+b.dataset.i]));
  else if (a === "resume-draft") { const d = store.loadDraft(); if (d) openSession(d, true); }
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
  m.querySelector('[data-x="done"]').onclick = () => { onDone && onDone(); close(); render(); };
  return { el: m, body: m.querySelector(".modal-body"), close };
}

// ---------- Aktive Einheit ----------
function openSession(session, resumed = false) {
  let dirty = resumed;            // fortgesetzte Entwürfe sind per Definition „angefasst“
  let restInterval = null;
  let statsInterval = null;

  const modal = openModal(session.routineName,
    statsStripHtml(session) + sessionBody(session) + restBarHtml(), {
    doneLabel: "Fertig",
    cancelLabel: "Schließen",
    onDone: () => { store.saveSession(session); store.clearDraft(); },
    cleanup: () => {
      clearInterval(restInterval); clearInterval(statsInterval);
      releaseWakeLock();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  });
  const body = modal.body;

  // Schließen verliert nichts: der Entwurf bleibt (Banner im Training-Tab).
  function touch() { dirty = true; store.saveDraft(session); refreshStats(); }

  function refresh() {
    body.innerHTML = statsStripHtml(session) + sessionBody(session) + restBarHtml();
    refreshStats();                    // sofort füllen, nicht erst beim nächsten Tick
    if (restEndAt) showRestBar();
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
  statsInterval = setInterval(refreshStats, 1000);
  refreshStats();

  // -- Pausen-Timer: startet automatisch beim Abhaken eines Satzes --
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
  function startRest(secs = 90) {
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
  restInterval = setInterval(tickRest, 1000);

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
  acquireWakeLock();

  // Beim Zurückkehren in die App: Wake Lock neu anfordern (geht beim Verlassen
  // verloren) und Anzeige sofort korrigieren statt bis zum nächsten Tick warten.
  function onVisibility() {
    if (document.visibilityState === "visible") {
      acquireWakeLock();
      refreshStats();
      tickRest();
    }
  }
  document.addEventListener("visibilitychange", onVisibility);

  body.addEventListener("input", (e) => {
    const inp = e.target.closest("input"); if (!inp) return;
    const set = session.exercises[+inp.dataset.ex].sets[+inp.dataset.set];
    set[inp.dataset.field] = inp.dataset.field === "reps" ? Math.round(num(inp.value)) : num(inp.value);
    touch();
  });
  body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const act = t.dataset.act;
    if (act === "rest-plus") {
      const base = restSecsLeft() > 0 ? restEndAt : Date.now();
      restEndAt = base + 30000; restDoneFired = false; showRestBar(); return;
    }
    if (act === "rest-skip") { stopRest(); return; }
    if (act === "exprog") { openProgress(session.routineId, t.dataset.exid); return; }
    const ex = session.exercises[+t.dataset.ex];
    if (act === "toggle") {
      const s = ex.sets[+t.dataset.set];
      s.completed = !s.completed;
      touch(); refresh();
      if (s.completed) startRest(90);
    } else if (act === "add-set") {
      const base = [...ex.sets].reverse().find((s) => !s.isWarmup);
      ex.sets.push({ id: crypto.randomUUID(), reps: base?.reps ?? 8, weight: base?.weight ?? 0, isWarmup: false, completed: false });
      touch(); refresh();
    } else if (act === "del-set-live") {
      ex.sets.splice(+t.dataset.set, 1);
      touch(); refresh();
    }
  });
}

function statsStripHtml() {
  return `<div class="stats-strip" id="sess-stats"><div class="ss-txt"></div><div class="prog"><i></i></div></div>`;
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

function sessionBody(session) {
  return session.exercises.map((ex, ei) => {
    const last = store.lastSession(ex.exerciseId);
    const lastTxt = last ? "Zuletzt: " + workingSets(last.logged.sets)
      .map((s) => `${s.reps}×${fmtWeightShort(s.weight)}`).join("  ") : "";
    const sets = ex.sets.map((s, si) => `
      <div class="setrow ${s.completed ? "done" : ""}">
        <button class="check ${s.completed ? "on" : ""}" data-act="toggle" data-ex="${ei}" data-set="${si}">${s.completed ? "✓" : ""}</button>
        ${s.isWarmup ? `<span class="warm-tag">Aufwärmen</span>` : `<span class="warm-tag"></span>`}
        <span class="spacer"></span>
        <span class="numwrap">
          <input class="w-reps" type="number" inputmode="numeric" value="${s.reps}" data-ex="${ei}" data-set="${si}" data-field="reps">
          <span class="times">×</span>
          <input class="w-kg" type="number" inputmode="decimal" step="0.25" value="${s.weight}" data-ex="${ei}" data-set="${si}" data-field="weight">
          <span class="unit">kg</span>
        </span>
        <button class="del-x" data-act="del-set-live" data-ex="${ei}" data-set="${si}" aria-label="Satz löschen">✕</button>
      </div>`).join("");
    const rtEx = session.routineId && store.routines.find((r) => r.id === session.routineId)
      ?.exercises.find((x) => x.id === ex.exerciseId);
    const linked = !!rtEx;
    const note = rtEx?.note?.trim();
    const pill = rtEx ? statusPill(store.progressionStatus(rtEx)) : "";
    const inc = rtEx ? store.autoIncrement(rtEx) : 0;
    const incTxt = inc > 0
      ? ` <span class="auto-up">↑ automatisch +${fmtWeightShort(inc)} kg</span>` : "";
    return `<div class="ex-head"><h3>${esc(ex.name)}</h3>${pill}
        ${linked ? `<button class="mini-link" data-act="exprog" data-exid="${ex.exerciseId}" aria-label="Fortschritt anzeigen">📈</button>` : ""}</div>
      ${note ? `<div class="ex-note">📝 ${esc(note)}</div>` : ""}
      ${lastTxt ? `<div class="sub2" style="margin:-2px 16px 6px;color:var(--muted)">${esc(lastTxt)}${incTxt}</div>` : ""}
      <div class="modal-grp" style="margin-top:4px">${sets}
        <div class="setrow"><button class="btn-text" data-act="add-set" data-ex="${ei}">＋ Satz hinzufügen</button></div>
      </div>`;
  }).join("");
}

// ---------- Verlauf-Detail ----------
function openSessionDetail(id) {
  const s = store.sessions.find((x) => x.id === id); if (!s) return;
  const body = s.exercises.map((ex) => `
    <div class="section-title">${esc(ex.name)}</div>
    <div class="card">${ex.sets.map((set) => `
      <div class="setrow">
        <span class="check ${set.completed ? "on" : ""}" style="cursor:default">${set.completed ? "✓" : ""}</span>
        ${set.isWarmup ? `<span class="warm-tag">Aufwärmen</span>` : `<span class="warm-tag"></span>`}
        <span class="spacer"></span>
        <span>${set.reps} × ${fmtWeight(set.weight)}</span>
      </div>`).join("")}</div>`).join("") +
    `<div style="margin-top:24px"><button class="btn btn-block btn-ghost btn-danger" id="del">Einheit löschen</button></div>`;
  const modal = openModal(fmtDate(s.date), body, { single: true });
  modal.body.querySelector("#del").onclick = () => {
    if (confirm("Diese Einheit löschen?")) { store.deleteSession(id); modal.close(); render(); }
  };
}

// ---------- Dashboard: Fortschritt einer Übung ----------
function openProgress(routineId, exerciseId) {
  function build() {
    const r = store.routines.find((x) => x.id === routineId);
    const ex = r?.exercises.find((x) => x.id === exerciseId);
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
      : "";
    return `<div class="section-title">Aktuelle Vorgabe</div>
      <div class="card">${targetsHtml}${statusBlock}${applyBtn}${rmHtml}
        <div class="setrow"><button class="btn-text" id="adjust">⚙ Arbeitsgewicht anpassen</button></div></div>
      ${charts}${table}`;
  }

  const exName = store.routines.find((x) => x.id === routineId)?.exercises.find((x) => x.id === exerciseId)?.name || "";
  const modal = openModal(exName, build(), { single: true });
  modal.body.addEventListener("click", (e) => {
    if (e.target.id === "apply-inc") {
      store.applySuggestedIncrease(routineId, exerciseId);
      modal.body.innerHTML = build();
    } else if (e.target.id === "adjust") {
      const r = store.routines.find((x) => x.id === routineId);
      const ex = r.exercises.find((x) => x.id === exerciseId);
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
    else if (act === "add-set") { const l = ex.targets.at(-1); ex.targets.push(mkTarget(l?.reps ?? 8, l?.weight ?? 0)); refresh(); }
    else if (act === "del-ex") { routine.exercises.splice(+t.dataset.ex, 1); refresh(); }
    else if (act === "add-ex") { routine.exercises.push(mkExercise("", [mkTarget(8, 0)])); refresh(); }
    else if (act === "del-routine") {
      if (confirm("Dieses Workout löschen?")) { store.deleteRoutine(routine.id); modal.close(); render(); }
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
      <div class="setrow"><button class="btn-text" data-act="add-set" data-ex="${ei}">＋ Satz</button>
        <span class="spacer"></span>
        <span class="unit">Steigerung</span>
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

// ---------- Mehrlinien-Chart (Dashboard: Gewicht je Übung über die Tage) ----------
// series: [{ name, color, pts:[{t (ms), y (kg)}], target }]
// Zeichnet je Übung eine Linie über eine gemeinsame Zeitachse; optional die
// aktuelle Vorgabe ("Theorie") als gestrichelte Linie in der Übungsfarbe.
// Interaktiv: Crosshair schnappt auf die Trainingstage (gemeinsame x-Spalten).
const MPADL = 30, MPADR = 12, MPADT = 16, MPADB = 22;
function multiLineChart(series, { showTheorie } = {}) {
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
  const X = (t) => allT.length === 1 ? (MPADL + (CW - MPADL - MPADR) / 2) : MPADL + ((t - tMin) / tSpan) * (CW - MPADL - MPADR);
  const Y = (v) => CH - MPADB - ((v - min) / ySpan) * (CH - MPADT - MPADB);

  let s = gridLines2(min, max);

  // Theorie-Linien (gestrichelt) hinter den Ist-Linien.
  if (showTheorie) {
    for (const se of series) {
      if (!(se.target > 0)) continue;
      const y = Y(se.target).toFixed(1);
      s += `<line x1="${MPADL}" y1="${y}" x2="${CW - MPADR}" y2="${y}" stroke="${se.color}" stroke-width="1.5" stroke-dasharray="5 5" opacity="0.55"/>`;
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
      if (p) items.push({ y: +Y(p.y).toFixed(1), color: se.color, txt: `${se.name} ${fmtWeightShort(p.y)}` });
    }
    return { x: +X(tt).toFixed(1), label: fmtDate(new Date(tt).toISOString()), items };
  });

  const startLbl = fmtDate(new Date(tMin).toISOString());
  const endLbl = fmtDate(new Date(tMax).toISOString());
  const colsJson = JSON.stringify(cols).replace(/'/g, "&#39;");
  return `<svg class="chart mchart" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid meet" data-w="${CW}" data-cols='${colsJson}'>
    ${s}
    <text x="${MPADL}" y="${CH - 6}" fill="#6b7099" font-size="10">${startLbl}</text>
    <text x="${CW - MPADR}" y="${CH - 6}" fill="#6b7099" font-size="10" text-anchor="end">${endLbl}</text>
    <g class="mxh" visibility="hidden"><line x1="0" x2="0" y1="${MPADT}" y2="${CH - MPADB}" stroke="#8b9bff" stroke-width="1" stroke-dasharray="2 3" opacity="0.8"/></g>
    <g class="mdots"></g>
  </svg>`;
}

// Achsen-Gitter für den Mehrlinien-Chart (eigene Paddings).
function gridLines2(min, max) {
  return [0, 0.5, 1].map((f) => {
    const v = min + (max - min) * f;
    const y = CH - MPADB - f * (CH - MPADT - MPADB);
    return `<line x1="${MPADL}" y1="${y.toFixed(1)}" x2="${CW - MPADR}" y2="${y.toFixed(1)}" stroke="#2b3160" stroke-dasharray="${f ? "3 4" : "0"}"/>
      <text x="${MPADL - 5}" y="${(y + 3.5).toFixed(1)}" fill="#6b7099" font-size="10" text-anchor="end">${nf.format(v)}</text>`;
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
