import {
  Store, routine as mkRoutine, exercise as mkExercise, setTarget as mkTarget,
  exerciseVolume, exerciseTopWeight, sessionVolume, sessionCompletedSetCount,
  topTargetWeight, workingSets, fmtWeight, fmtWeightShort, fmtDate,
} from "./model.js";

const store = new Store(window.localStorage);
const screen = document.getElementById("screen");
const modalRoot = document.getElementById("modal-root");
let activeTab = "training";

// ---------- Helfer ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };

function relDate(iso) {
  const days = Math.round((Date.now() - new Date(iso)) / 86400000);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 14) return "vor 1 Woche";
  if (days < 30) return `vor ${Math.floor(days / 7)} Wochen`;
  return fmtDate(iso);
}

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
    ${store.routines.length
      ? `<div class="card">${rows}</div>
         <div class="card" style="margin-top:12px"><button class="row" data-action="new-routine">
           <span class="grow"><h3 style="color:var(--tint)">＋ Workout anlegen</h3></span></button></div>`
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
  screen.innerHTML = html;
}

// ---------- Aktionen (Event-Delegation) ----------
screen.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action;
  if (a === "start") openSession(store.makeSession(store.routines[+b.dataset.i]));
  else if (a === "new-routine") openRoutineEdit(mkRoutine("Neues Workout", [mkExercise("", [mkTarget(8, 0)])]), true);
  else if (a === "edit-routine-list") openRoutinePicker();
  else if (a === "session-detail") openSessionDetail(b.dataset.id);
  else if (a === "progress") openProgress(b.dataset.r, b.dataset.e);
});

// ---------- Modal-Grundgerüst ----------
function openModal(title, bodyHtml, { onDone, doneLabel = "Fertig", onClose } = {}) {
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `
    <div class="modal-bar">
      <button class="btn-text" data-x="close">Abbrechen</button>
      <h2>${esc(title)}</h2>
      <button class="btn-text" data-x="done" style="font-weight:700">${onDone ? doneLabel : "Fertig"}</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>`;
  modalRoot.appendChild(m);
  document.body.style.overflow = "hidden";
  const close = () => { m.remove(); document.body.style.overflow = ""; };
  m.querySelector('[data-x="close"]').onclick = () => { onClose && onClose(); close(); render(); };
  m.querySelector('[data-x="done"]').onclick = () => { onDone && onDone(); close(); render(); };
  return { el: m, body: m.querySelector(".modal-body"), close };
}

// ---------- Aktive Einheit ----------
function openSession(session) {
  const modal = openModal(session.routineName, sessionBody(session), {
    doneLabel: "Fertig",
    onDone: () => store.saveSession(session),
  });
  const body = modal.body;
  function refresh() { body.innerHTML = sessionBody(session); }

  body.addEventListener("input", (e) => {
    const inp = e.target.closest("input"); if (!inp) return;
    const set = session.exercises[+inp.dataset.ex].sets[+inp.dataset.set];
    set[inp.dataset.field] = inp.dataset.field === "reps" ? Math.round(num(inp.value)) : num(inp.value);
  });
  body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const ex = session.exercises[+t.dataset.ex];
    if (t.dataset.act === "toggle") { const s = ex.sets[+t.dataset.set]; s.completed = !s.completed; refresh(); }
    else if (t.dataset.act === "add-set") {
      const base = [...ex.sets].reverse().find((s) => !s.isWarmup);
      ex.sets.push({ id: crypto.randomUUID(), reps: base?.reps ?? 8, weight: base?.weight ?? 0, isWarmup: false, completed: false });
      refresh();
    }
  });
}

function sessionBody(session) {
  return session.exercises.map((ex, ei) => {
    const last = store.lastSession(ex.exerciseId);
    const lastTxt = last ? "Zuletzt: " + workingSets(last.logged.sets)
      .map((s) => `${s.reps}×${fmtWeightShort(s.weight)}`).join("  ") : "";
    const sets = ex.sets.map((s, si) => `
      <div class="setrow">
        <button class="check ${s.completed ? "on" : ""}" data-act="toggle" data-ex="${ei}" data-set="${si}">${s.completed ? "☑" : "○"}</button>
        ${s.isWarmup ? `<span class="warm-tag">Aufwärmen</span>` : `<span class="warm-tag"></span>`}
        <span class="spacer"></span>
        <span class="numwrap">
          <input class="w-reps" type="number" inputmode="numeric" value="${s.reps}" data-ex="${ei}" data-set="${si}" data-field="reps">
          <span class="times">×</span>
          <input class="w-kg" type="number" inputmode="decimal" step="0.25" value="${s.weight}" data-ex="${ei}" data-set="${si}" data-field="weight">
          <span class="unit">kg</span>
        </span>
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
      ? `<div class="row" style="border:none"><span class="grow sub" style="color:var(--green)">
         ✓ Letztes Mal alle Vorgaben erreicht 💪 — Arbeitsgewicht auf ${fmtWeight(topTargetWeight(ex))} erhöht.</span></div>` : "";
    return `<div class="section-title">Aktuelle Vorgabe</div>
      <div class="card">${targetsHtml}${pending}
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
        <button class="check ${t.isWarmup ? "" : ""}" data-act="warm" data-ex="${ei}" data-t="${ti}"
          style="color:${t.isWarmup ? "var(--orange)" : "var(--faint)"}">${t.isWarmup ? "🔥" : "○"}</button>
        <span class="spacer"></span>
        <span class="numwrap">
          <input class="w-reps" type="number" inputmode="numeric" value="${t.reps}" data-ex="${ei}" data-t="${ti}" data-field="reps">
          <span class="times">×</span>
          <input class="w-kg" type="number" inputmode="decimal" step="0.25" value="${t.weight}" data-ex="${ei}" data-t="${ti}" data-field="weight">
          <span class="unit">kg</span>
        </span>
        <button class="btn-text btn-danger" data-act="del-set" data-ex="${ei}" data-t="${ti}" style="padding-left:8px">✕</button>
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

// ---------- Mini-SVG-Charts ----------
function lineChart(points) {
  const W = 320, H = 150, pad = 24;
  const ys = points.map((p) => p.y), max = Math.max(...ys), min = Math.min(...ys, 0);
  const span = max - min || 1;
  const x = (i) => pad + (i * (W - 2 * pad)) / (points.length - 1 || 1);
  const y = (v) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="3.5" fill="#7c8cf8"/>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#2b3160"/>
    <polyline points="${pts}" fill="none" stroke="#7c8cf8" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}
    <text x="${pad}" y="14" fill="#9aa0c0" font-size="11">${fmtWeightShort(max)} kg</text>
  </svg>`;
}
function barChart(points) {
  const W = 320, H = 150, pad = 24;
  const max = Math.max(...points.map((p) => p.y)) || 1;
  const bw = (W - 2 * pad) / points.length * 0.6;
  const gap = (W - 2 * pad) / points.length;
  const bars = points.map((p, i) => {
    const h = (p.y / max) * (H - 2 * pad);
    const bx = pad + i * gap + (gap - bw) / 2;
    return `<rect x="${bx.toFixed(1)}" y="${(H - pad - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="#7c8cf8"/>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#2b3160"/>
    ${bars}
    <text x="${pad}" y="14" fill="#9aa0c0" font-size="11">${Math.round(max)} kg</text>
  </svg>`;
}

render();
