import {
  Store, routine as mkRoutine, exercise as mkExercise, setTarget as mkTarget,
  exerciseVolume, exerciseTopWeight, sessionVolume, sessionCompletedSetCount,
  topTargetWeight, workingSets, best1RM, fmtWeight, fmtWeightShort, fmtDate,
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
    return `<button class="row" data-action="start" data-i="${i}">
      <span class="grow">
        <h3>${esc(r.name)}</h3>
        <div class="sub">${r.exercises.length} Übungen</div>
        ${last ? `<div class="sub2">Zuletzt ${relDate(last)}</div>` : ""}
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
      : `<div class="empty"><div class="big">🏋️</div><h2>Keine Workouts</h2>
         <p>Lege oben rechts ein neues Workout an.</p></div>`}
    <div class="card" style="margin-top:12px">
      <button class="row" data-action="edit-routine-list"><span class="grow">
        <h3 style="color:var(--muted)">Workouts bearbeiten</h3></span><span class="chev">›</span></button>
    </div>`;
}

// ---------- Tab: Verlauf ----------
function renderVerlauf() {
  const sorted = store.sessions.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  screen.innerHTML = `<h1 class="nav-title">Verlauf</h1>
    ${sorted.length
      ? `<div class="card">${sorted.map((s) => `
          <button class="row" data-action="session-detail" data-id="${s.id}">
            <span class="grow">
              <div style="display:flex;justify-content:space-between"><h3>${esc(s.routineName)}</h3>
                <span class="sub">${fmtDate(s.date)}</span></div>
              <div class="sub2">${sessionCompletedSetCount(s)} Sätze · Volumen ${Math.round(sessionVolume(s))} kg</div>
            </span><span class="chev">›</span>
          </button>`).join("")}</div>`
      : `<div class="empty"><div class="big">🕑</div><h2>Noch kein Training</h2>
         <p>Starte ein Workout im Tab „Training“.</p></div>`}`;
}

// ---------- Tab: Dashboard ----------
function renderDashboard() {
  let html = `<h1 class="nav-title">Dashboard</h1>`;
  if (store.sessions.length === 0)
    html += `<div class="card"><div class="row"><span class="grow sub">
      Sobald du trainierst, erscheinen hier deine Fortschritte und Steigerungs-Vorschläge.</span></div></div>`;
  for (const r of store.routines) {
    html += `<div class="section-title">${esc(r.name)}</div><div class="card">`;
    html += r.exercises.map((ex) => {
      const last = store.lastSession(ex.id);
      const sub = last
        ? `Top ${fmtWeight(exerciseTopWeight(last.logged))} · ${relDate(last.date)}`
        : `Vorgabe ${fmtWeight(topTargetWeight(ex))}`;
      const up = store.hasPendingIncrease(ex)
        ? `<span class="pill up">▲ ${fmtWeight(topTargetWeight(ex))}</span>` : "";
      return `<button class="row" data-action="progress" data-r="${r.id}" data-e="${ex.id}">
        <span class="grow"><h3>${esc(ex.name)}</h3><div class="sub">${sub}</div></span>${up}
        <span class="chev">›</span></button>`;
    }).join("");
    html += `</div>`;
  }
  html += `
    <div class="section-title">Daten</div>
    <div class="card">
      <button class="row" data-action="export"><span class="grow">
        <h3 style="font-size:15px">⬇ Backup exportieren</h3>
        <div class="sub2">Alle Workouts & Verlauf als JSON-Datei sichern</div></span></button>
      <button class="row" data-action="import"><span class="grow">
        <h3 style="font-size:15px">⬆ Backup importieren</h3>
        <div class="sub2">Ersetzt die aktuellen Daten durch ein Backup</div></span></button>
    </div>`;
  screen.innerHTML = html;
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
  const { onDone, doneLabel = "Fertig", cancelLabel = "Abbrechen", onCancel, cleanup } = opts;
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `
    <div class="modal-bar">
      <button class="btn-text" data-x="close">${esc(cancelLabel)}</button>
      <h2>${esc(title)}</h2>
      <button class="btn-text" data-x="done" style="font-weight:700">${esc(doneLabel)}</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>`;
  modalRoot.appendChild(m);
  document.body.style.overflow = "hidden";
  const close = () => { cleanup && cleanup(); m.remove(); document.body.style.overflow = ""; };
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
    cleanup: () => { clearInterval(restInterval); clearInterval(statsInterval); },
  });
  const body = modal.body;

  // Schließen verliert nichts: der Entwurf bleibt (Banner im Training-Tab).
  function touch() { dirty = true; store.saveDraft(session); refreshStats(); }

  function refresh() {
    body.innerHTML = statsStripHtml(session) + sessionBody(session) + restBarHtml();
    if (restRemaining > 0) showRestBar();
  }

  // -- Live-Statuszeile (Dauer · Sätze · Volumen) --
  function refreshStats() {
    const el = body.querySelector("#sess-stats");
    if (!el) return;
    const secs = Math.max(0, Math.floor((Date.now() - new Date(session.date)) / 1000));
    const total = session.exercises.reduce((n, e) => n + workingSets(e.sets).length, 0);
    el.innerHTML = `⏱ ${fmtClock(secs)} &nbsp;·&nbsp; ${sessionCompletedSetCount(session)}/${total} Sätze` +
      ` &nbsp;·&nbsp; ${Math.round(sessionVolume(session))} kg`;
  }
  statsInterval = setInterval(refreshStats, 1000);
  refreshStats();

  // -- Pausen-Timer: startet automatisch beim Abhaken eines Satzes --
  let restRemaining = 0;
  function showRestBar() {
    const bar = body.querySelector("#restbar");
    if (!bar) return;
    bar.hidden = false;
    bar.classList.toggle("rt-done", restRemaining <= 0);
    bar.querySelector(".rt-time").textContent =
      restRemaining > 0 ? fmtClock(restRemaining) : "Pause vorbei 💪";
  }
  function startRest(secs = 90) {
    clearInterval(restInterval);
    restRemaining = secs;
    showRestBar();
    restInterval = setInterval(() => {
      restRemaining--;
      if (restRemaining <= 0) {
        clearInterval(restInterval);
        restRemaining = 0;
        showRestBar();
        if (navigator.vibrate) navigator.vibrate(300);
        setTimeout(() => { const b = body.querySelector("#restbar"); if (b) b.hidden = true; }, 4000);
      } else showRestBar();
    }, 1000);
  }
  function stopRest() {
    clearInterval(restInterval);
    restRemaining = 0;
    const b = body.querySelector("#restbar");
    if (b) b.hidden = true;
  }

  body.addEventListener("input", (e) => {
    const inp = e.target.closest("input"); if (!inp) return;
    const set = session.exercises[+inp.dataset.ex].sets[+inp.dataset.set];
    set[inp.dataset.field] = inp.dataset.field === "reps" ? Math.round(num(inp.value)) : num(inp.value);
    touch();
  });
  body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const act = t.dataset.act;
    if (act === "rest-plus") { restRemaining += 30; showRestBar(); return; }
    if (act === "rest-skip") { stopRest(); return; }
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
  return `<div class="stats-strip" id="sess-stats"></div>`;
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
        <button class="check ${s.completed ? "on" : ""}" data-act="toggle" data-ex="${ei}" data-set="${si}">${s.completed ? "☑" : "○"}</button>
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
    return `<div class="ex-head"><h3>${esc(ex.name)}</h3></div>
      ${lastTxt ? `<div class="sub2" style="margin:-2px 16px 6px;color:var(--muted)">${esc(lastTxt)}</div>` : ""}
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
        <span class="check ${set.completed ? "on" : ""}">${set.completed ? "☑" : "○"}</span>
        ${set.isWarmup ? `<span class="warm-tag">Aufwärmen</span>` : `<span class="warm-tag"></span>`}
        <span class="spacer"></span>
        <span>${set.reps} × ${fmtWeight(set.weight)}</span>
      </div>`).join("")}</div>`).join("") +
    `<div style="margin-top:24px"><button class="btn btn-block btn-ghost btn-danger" id="del">Einheit löschen</button></div>`;
  const modal = openModal(fmtDate(s.date), body);
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
    const targetsHtml = ex.targets.map((t) => `
      <div class="setrow">${t.isWarmup ? `<span class="warm-tag">Aufwärmen</span>` : ``}
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
      const tw = hist.map((h) => ({ y: exerciseTopWeight(h.logged), label: fmtDate(h.date) }));
      const vol = hist.map((h) => ({ y: exerciseVolume(h.logged), label: fmtDate(h.date) }));
      charts = `<div class="section-title">Top-Gewicht</div>
        <div class="card chart-card">${lineChart(tw)}</div>
        <div class="section-title">Volumen (Wdh × kg)</div>
        <div class="card chart-card">${barChart(vol)}</div>`;
    }
    let table = "";
    if (hist.length) {
      table = `<div class="section-title">Verlauf</div><div class="card tbl">` +
        hist.slice().reverse().map((h) => `<div class="trow">
          <div class="d">${fmtDate(h.date)}</div>
          <div class="s">${workingSets(h.logged.sets).map((s) => `${s.reps}×${fmtWeightShort(s.weight)}`).join("  ")}</div>
        </div>`).join("") + `</div>`;
    }
    const pending = store.hasPendingIncrease(ex)
      ? `<div class="row" style="border:none;cursor:default"><span class="grow sub" style="color:var(--green)">
         ✓ Letztes Mal alle Vorgaben erreicht 💪 — Arbeitsgewicht auf ${fmtWeight(topTargetWeight(ex))} erhöht.</span></div>` : "";
    return `<div class="section-title">Aktuelle Vorgabe</div>
      <div class="card">${targetsHtml}${pending}${rmHtml}
        <div class="setrow"><button class="btn-text" id="adjust">⚙ Arbeitsgewicht anpassen</button></div></div>
      ${charts}${table}`;
  }

  const exName = store.routines.find((x) => x.id === routineId)?.exercises.find((x) => x.id === exerciseId)?.name || "";
  const modal = openModal(exName, build());
  modal.body.addEventListener("click", (e) => {
    if (e.target.id === "adjust") {
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
      <div class="sub">${r.exercises.length} Übungen</div></span><span class="chev">›</span></button>`).join("")}</div>`;
  const modal = openModal("Workouts", body);
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
    const inp = e.target.closest("input"); if (!inp) return;
    const f = inp.dataset.field;
    if (f === "rname") routine.name = inp.value;
    else if (f === "ename") routine.exercises[+inp.dataset.ex].name = inp.value;
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
        <button class="check" data-act="warm" data-ex="${ei}" data-t="${ti}"
          style="color:${t.isWarmup ? "var(--orange)" : "var(--faint)"}">${t.isWarmup ? "🔥" : "○"}</button>
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

// ---------- SVG-Charts ----------
function chartFrame(W, H, padL, padB, min, max, fmt) {
  // 3 horizontale Gitterlinien mit Wert-Labels.
  const padT = 18;
  const lines = [0, 0.5, 1].map((f) => {
    const v = min + (max - min) * f;
    const y = H - padB - f * (H - padT - padB);
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - 10}" y2="${y.toFixed(1)}" stroke="#2b3160" stroke-dasharray="${f ? "3 4" : "0"}"/>
      <text x="${padL - 5}" y="${(y + 3.5).toFixed(1)}" fill="#6b7099" font-size="10" text-anchor="end">${fmt(v)}</text>`;
  }).join("");
  return { padT, lines };
}

function lineChart(points) {
  const W = 340, H = 170, padL = 38, padB = 24;
  const ys = points.map((p) => p.y);
  const max = Math.max(...ys), rawMin = Math.min(...ys);
  const min = rawMin === max ? Math.max(0, rawMin - 1) : rawMin;
  const span = max - min || 1;
  const { padT, lines } = chartFrame(W, H, padL, padB, min, max, (v) => nf.format(v));
  const x = (i) => padL + (i * (W - padL - 12)) / (points.length - 1 || 1);
  const y = (v) => H - padB - ((v - min) / span) * (H - padT - padB);
  const coords = points.map((p, i) => [x(i), y(p.y)]);
  const pts = coords.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
  const area = `M ${coords[0][0].toFixed(1)},${(H - padB).toFixed(1)} L ${pts.replace(/ /g, " L ")} L ${coords.at(-1)[0].toFixed(1)},${(H - padB).toFixed(1)} Z`;
  const dots = coords.map(([a, b], i) =>
    `<circle cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="${i === coords.length - 1 ? 5 : 3}" fill="#7c8cf8"/>`).join("");
  const [lx, ly] = coords.at(-1);
  const lastLbl = `<text x="${Math.min(lx, W - 46).toFixed(1)}" y="${Math.max(12, ly - 10).toFixed(1)}" fill="#f2f3f7" font-size="11" font-weight="700">${nf.format(points.at(-1).y)} kg</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7c8cf8" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#7c8cf8" stop-opacity="0.02"/>
    </linearGradient></defs>
    ${lines}
    <path d="${area}" fill="url(#lg)"/>
    <polyline points="${pts}" fill="none" stroke="#7c8cf8" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${lastLbl}
    <text x="${padL}" y="${H - 6}" fill="#6b7099" font-size="10">${points[0].label}</text>
    <text x="${W - 10}" y="${H - 6}" fill="#6b7099" font-size="10" text-anchor="end">${points.at(-1).label}</text>
  </svg>`;
}

function barChart(points) {
  const W = 340, H = 170, padL = 38, padB = 24;
  const max = Math.max(...points.map((p) => p.y)) || 1;
  const { padT, lines } = chartFrame(W, H, padL, padB, 0, max, (v) => String(Math.round(v)));
  const gap = (W - padL - 12) / points.length;
  const bw = gap * 0.62;
  const bars = points.map((p, i) => {
    const h = (p.y / max) * (H - padT - padB);
    const bx = padL + i * gap + (gap - bw) / 2;
    const isLast = i === points.length - 1;
    return `<rect x="${bx.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="3.5" fill="#7c8cf8" opacity="${isLast ? 1 : 0.55}"/>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    ${lines}${bars}
    <text x="${padL}" y="${H - 6}" fill="#6b7099" font-size="10">${points[0].label}</text>
    <text x="${W - 10}" y="${H - 6}" fill="#6b7099" font-size="10" text-anchor="end">${points.at(-1).label}</text>
  </svg>`;
}

render();
