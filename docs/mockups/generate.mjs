import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

// ---- Palette (from styles.css) ----
const C = {
  bg: "#0a0c1b", bg2: "#12152b", card: "#151a36", card2: "#1d2348",
  text: "#f4f5fa", muted: "#a0a6c8", faint: "#686e99",
  tint: "#8b9bff", tint2: "#b18cff", green: "#3ddc97", orange: "#ffa057",
  line: "#262d58", red: "#ff7a85", cyan: "#5ad1e6", pink: "#ff7a9c",
};
const FONT = "Liberation Sans, DejaVu Sans, sans-serif";
const W = 390, H = 844;

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const t = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${o.size || 14}" font-weight="${o.w || 400}" fill="${o.fill || C.text}" text-anchor="${o.anchor || "start"}" letter-spacing="${o.ls ?? 0}" opacity="${o.op ?? 1}">${esc(s)}</text>`;
const rr = (x, y, w, h, r, fill, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${o.stroke ? `stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ""} opacity="${o.op ?? 1}"/>`;
const circle = (cx, cy, r, fill, o = {}) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${o.stroke ? `stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ""} opacity="${o.op ?? 1}"/>`;

// iOS-ish status bar + frame chrome
function frame(inner, { titleColor } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bgglow" cx="50%" cy="-14%" r="75%">
      <stop offset="0" stop-color="#7c8cf8" stop-opacity="0.16"/>
      <stop offset="0.7" stop-color="#7c8cf8" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="titlegrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0.2" stop-color="${C.text}"/><stop offset="0.95" stop-color="#aab4ff"/>
    </linearGradient>
    <linearGradient id="cardtop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.03"/><stop offset="0.4" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="playgrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.tint}"/><stop offset="1" stop-color="${C.tint2}"/>
    </linearGradient>
    <linearGradient id="areafill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7c8cf8" stop-opacity="0.32"/><stop offset="1" stop-color="#7c8cf8" stop-opacity="0.01"/>
    </linearGradient>
    <linearGradient id="greenbar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.green}"/><stop offset="1" stop-color="#8df0c8"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#bgglow)"/>
  <!-- status bar -->
  ${t(28, 30, "9:41", { size: 15, w: 700 })}
  ${// signal + wifi + battery
    `<g transform="translate(318,15)" fill="${C.text}">
      <rect x="0" y="6" width="3" height="5" rx="1"/><rect x="5" y="3.5" width="3" height="7.5" rx="1"/>
      <rect x="10" y="1.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="11" rx="1"/>
      <path d="M24 3.5c4.5-4 13.5-4 18 0l-2.2 2.4c-3.3-2.8-10.3-2.8-13.6 0z" opacity="0.95"/>
      <circle cx="33" cy="9.5" r="1.8"/>
      <rect x="46" y="1.5" width="20" height="9.5" rx="2.4" fill="none" stroke="${C.text}" stroke-width="1.1" opacity="0.6"/>
      <rect x="47.5" y="3" width="14" height="6.5" rx="1.3"/><rect x="67" y="4.3" width="1.6" height="4" rx="0.8"/>
    </g>`}
  ${inner}
  </svg>`;
}

// Bottom tab bar
function tabbar(active) {
  const tabs = [
    ["Training", "M4 9v6M7 6.5v11M17 6.5v11M20 9v6M7 12h10"],
    ["Verlauf", "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7.5v4.5l3 2"],
    ["Steigerung", "M3 17l6-6 4 4 8-8M17 7h4v4"],
    ["Dashboard", "M4 5v14h16M7.5 14.5l3.5-4 3 3 5-6.5"],
  ];
  const y = H - 74;
  const colW = W / 4;
  let s = `<rect x="0" y="${y}" width="${W}" height="74" fill="#0a0c1be8"/><line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${C.line}"/>`;
  tabs.forEach((tb, i) => {
    const cx = colW * i + colW / 2;
    const on = i === active;
    const col = on ? C.tint : C.faint;
    if (on) s += rr(cx - 26, y + 8, 52, 26, 13, "#8b9bff26");
    s += `<g transform="translate(${cx - 11.5},${y + 11})" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${tb[1]}"/></g>`;
    s += t(cx, y + 50, tb[0], { size: 10, w: 600, fill: col, anchor: "middle" });
  });
  return s;
}

function navTitle(x, y, str) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="32" font-weight="800" letter-spacing="-0.5" fill="url(#titlegrad)">${esc(str)}</text>`;
}
function sectionTitle(x, y, str) {
  return t(x, y, str.toUpperCase(), { size: 11.5, w: 700, fill: C.faint, ls: 0.8 });
}
function card(x, y, w, h, r = 18) {
  return rr(x, y, w, h, r, C.card, { stroke: "#ffffff0c" }) + rr(x, y, w, h, r, "url(#cardtop)");
}

// ---- generic multi-line chart ----
// series: [{name,color,pts:[v...],dashed}], xLabels
function multiLine(bx, by, bw, bh, series, xLabels, opts = {}) {
  const padL = 30, padR = 12, padT = 14, padB = 20;
  const x0 = bx + padL, x1 = bx + bw - padR, y0 = by + padT, y1 = by + bh - padB;
  const all = series.flatMap((s) => s.pts);
  let max = Math.max(...all), min = Math.min(...all);
  if (opts.minZero) min = 0;
  const pad = (max - min) * 0.12 || 1; max += pad; min = Math.max(0, min - pad);
  const n = xLabels.length;
  const X = (i) => x0 + (i / (n - 1)) * (x1 - x0);
  const Y = (v) => y1 - ((v - min) / (max - min || 1)) * (y1 - y0);
  let s = "";
  // grid
  for (let g = 0; g <= 2; g++) {
    const v = min + (max - min) * (g / 2);
    const yy = Y(v);
    s += `<line x1="${x0}" y1="${yy.toFixed(1)}" x2="${x1}" y2="${yy.toFixed(1)}" stroke="${C.line}" ${g ? 'stroke-dasharray="3 4"' : ""}/>`;
    s += t(x0 - 6, yy + 3.5, String(Math.round(v)), { size: 10, fill: C.faint, anchor: "end" });
  }
  // x labels
  xLabels.forEach((l, i) => { if (i === 0 || i === n - 1 || (n <= 7 && i % 2 === 0)) s += t(X(i), y1 + 14, l, { size: 9.5, fill: C.faint, anchor: i === 0 ? "start" : i === n - 1 ? "end" : "middle" }); });
  // area for first solid series
  series.forEach((se) => {
    const pStr = se.pts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    if (se.area) {
      s += `<polygon points="${X(0).toFixed(1)},${y1} ${pStr} ${X(n - 1).toFixed(1)},${y1}" fill="url(#areafill)"/>`;
    }
    s += `<polyline points="${pStr}" fill="none" stroke="${se.color}" stroke-width="${se.dashed ? 2 : 2.5}" stroke-linejoin="round" stroke-linecap="round" ${se.dashed ? 'stroke-dasharray="5 5" opacity="0.85"' : ""}/>`;
    // dots
    se.pts.forEach((v, i) => { if (!se.dashed) s += circle(X(i), Y(v), i === n - 1 ? 4 : 2.6, se.color); });
    // last value label
    if (se.label) s += t(X(n - 1) - 2, Y(se.pts.at(-1)) - 9, se.label, { size: 10.5, w: 700, fill: se.color, anchor: "end" });
  });
  // crosshair + tooltip to suggest interactivity
  if (opts.scrubAt != null) {
    const i = opts.scrubAt, xx = X(i);
    s += `<line x1="${xx}" y1="${y0}" x2="${xx}" y2="${y1}" stroke="#8b9bff" stroke-width="1" stroke-dasharray="2 3" opacity="0.8"/>`;
    series.forEach((se) => { if (!se.dashed) s += circle(xx, Y(se.pts[i]), 4.5, "none", { stroke: C.text, sw: 2 }); });
    if (opts.tip) {
      const tw = opts.tip.length * 6.4 + 18, tx = Math.min(Math.max(xx - tw / 2, bx + 8), bx + bw - tw - 8);
      s += rr(tx, by + 6, tw, 22, 7, C.card2, { stroke: C.line });
      s += t(tx + tw / 2, by + 21, opts.tip, { size: 11.5, w: 650, anchor: "middle" });
    }
  }
  return s;
}

// legend chip
function chip(x, y, label, color, active) {
  const w = label.length * 6.6 + 28;
  let s = rr(x, y, w, 26, 13, active ? "#ffffff10" : "#ffffff06", { stroke: active ? color + "88" : C.line });
  s += circle(x + 13, y + 13, 4.5, color, { op: active ? 1 : 0.4 });
  s += t(x + 22, y + 17, label, { size: 12, w: 600, fill: active ? C.text : C.faint });
  return { svg: s, w };
}

// mini sparkline
function spark(x, y, w, h, pts, color) {
  const max = Math.max(...pts), min = Math.min(...pts);
  const X = (i) => x + (i / (pts.length - 1)) * w;
  const Y = (v) => y + h - ((v - min) / (max - min || 1)) * h;
  const p = pts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  return `<polyline points="${p}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` + circle(X(pts.length - 1), Y(pts.at(-1)), 2.6, color);
}

function pill(x, y, label, fill, color) {
  const w = label.length * 6.4 + 16;
  return { svg: rr(x, y, w, 20, 10, fill) + t(x + w / 2, y + 14, label, { size: 11.5, w: 700, fill: color, anchor: "middle" }), w };
}

// ===== sample data =====
const days = ["3.4", "10.4", "18.4", "25.4", "2.5", "9.5", "16.5", "23.5"];
const data = {
  Brustpresse: [22.5, 22.5, 25, 25, 25, 27.5, 27.5, 27.5],
  Latzug:      [40, 40, 42.5, 42.5, 42.5, 45, 45, 45],
  Rudern:      [37.5, 40, 40, 42.5, 42.5, 42.5, 42.5, 45],
  Seitheben:   [20, 22.5, 22.5, 25, 25, 25, 27.5, 27.5],
};
const targetBrust = [22.5, 22.5, 25, 25, 25, 27.5, 27.5, 30];

// ============================================================
// CONCEPT A — Unified multi-exercise progress chart
// ============================================================
function conceptA() {
  let s = navTitle(20, 78, "Dashboard");
  // range segmented
  const ranges = ["4 W", "12 W", "1 J", "Alle"];
  let rx = 20;
  s += rr(20, 92, 200, 30, 15, C.card, { stroke: "#ffffff0c" });
  ranges.forEach((r, i) => {
    if (i === 1) s += rr(rx + 2, 94, 48, 26, 13, "url(#playgrad)");
    s += t(rx + 25, 111, r, { size: 12.5, w: i === 1 ? 700 : 600, fill: i === 1 ? "#0b0e23" : C.muted, anchor: "middle" });
    rx += 50;
  });
  s += t(370, 111, "Top-Gewicht", { size: 12, fill: C.faint, anchor: "end" });

  // big chart card
  const cy = 134, ch = 250;
  s += card(16, cy, 358, ch);
  s += t(34, cy + 26, "Gewicht über die Tage", { size: 14, w: 700 });
  s += t(356, cy + 26, "kg", { size: 12, fill: C.faint, anchor: "end" });
  const series = [
    { name: "Brustpresse", color: C.tint, pts: data.Brustpresse, area: true },
    { name: "Latzug", color: C.green, pts: data.Latzug.map((v) => v + 0.6) },
    { name: "Rudern", color: C.orange, pts: data.Rudern },
    { name: "Theorie", color: C.tint2, pts: targetBrust, dashed: true },
  ];
  s += multiLine(24, cy + 34, 342, ch - 44, series, days, { scrubAt: 5, tip: "9.5 · 27,5 kg", minZero: false });

  // legend chips (toggle)
  let lx = 22, ly = cy + ch + 12;
  [["Brustpresse", C.tint, true], ["Latzug", C.green, true], ["Rudern", C.orange, true],
   ["Seitheben", C.cyan, false], ["Theorie (Vorgabe)", C.tint2, true]].forEach(([l, c, a]) => {
    const ck = chip(lx, ly, l, c, a);
    if (lx + ck.w > 374) { lx = 22; ly += 32; }
    const ck2 = chip(lx, ly, l, c, a); s += ck2.svg; lx += ck2.w + 8;
  });
  const afterLegend = ly + 40;

  // stat tiles
  s += card(16, afterLegend, 358, 70);
  const stats = [["3", "Diese Woche"], ["12.480", "kg Volumen"], ["48", "Einheiten"]];
  stats.forEach(([b, l], i) => {
    const cx = 16 + 358 / 3 * i + 358 / 6;
    if (i) s += `<line x1="${16 + 358 / 3 * i}" y1="${afterLegend + 14}" x2="${16 + 358 / 3 * i}" y2="${afterLegend + 56}" stroke="${C.line}"/>`;
    s += t(cx, afterLegend + 38, b, { size: 22, w: 800, anchor: "middle" });
    s += t(cx, afterLegend + 56, l.toUpperCase(), { size: 9.5, fill: C.muted, anchor: "middle", ls: 0.4 });
  });

  // compact exercise rows with sparkline
  let ry = afterLegend + 88;
  s += sectionTitle(22, ry, "Push");
  ry += 10;
  s += card(16, ry, 358, 122);
  const rows = [["Brustpresse", C.tint, data.Brustpresse, "Fortschritt", "#3ddc9724", C.green],
                ["Seitheben", C.cyan, data.Seitheben, "Bereit", "#8b9bff33", "#aab4ff"]];
  rows.forEach(([name, col, pts, plabel, pfill, pcol], i) => {
    const yy = ry + i * 61;
    if (i) s += `<line x1="16" y1="${yy}" x2="374" y2="${yy}" stroke="${C.line}"/>`;
    s += t(34, yy + 26, name, { size: 16, w: 650 });
    s += t(34, yy + 45, `Top ${pts.at(-1).toString().replace(".", ",")} kg · vor 4 Tagen`, { size: 12, fill: C.muted });
    s += spark(196, yy + 16, 64, 28, pts, col);
    const plw = plabel.length * 6.4 + 16;
    const pl = pill(352 - plw, yy + 21, plabel, pfill, pcol); s += pl.svg;
    s += t(368, yy + 36, "›", { size: 20, fill: C.faint, anchor: "end" });
  });

  return frame(s) ;
}

// ============================================================
// CONCEPT B — Glanceable cards + focused actual-vs-target chart
// ============================================================
function conceptB() {
  let s = navTitle(20, 78, "Dashboard");

  // hero volume card
  s += card(16, 96, 358, 96);
  s += t(34, 122, "DIESE WOCHE", { size: 11, w: 700, fill: C.faint, ls: 0.7 });
  s += t(34, 158, "12.480", { size: 38, w: 800 });
  s += t(150, 158, "kg", { size: 18, w: 700, fill: C.muted });
  const pl = pill(34, 168, "▲ +8 % vs. Vorwoche", "#3ddc9724", C.green); s += pl.svg;
  s += spark(232, 116, 122, 60, [8, 9.5, 9, 11, 10.5, 12, 11.8, 12.48], C.green);

  // focused chart: actual vs Theorie with exercise dropdown
  s += sectionTitle(22, 222, "Übung im Detail");
  s += card(16, 234, 358, 232);
  // dropdown
  s += rr(30, 250, 168, 32, 10, C.bg2, { stroke: C.line });
  s += circle(46, 266, 5, C.tint);
  s += t(58, 271, "Brustpresse", { size: 14, w: 650 });
  s += t(186, 271, "▾", { size: 13, fill: C.muted, anchor: "end" });
  // legend
  s += `<line x1="240" y1="261" x2="262" y2="261" stroke="${C.tint}" stroke-width="2.5"/>`;
  s += t(266, 265, "Ist", { size: 11.5, fill: C.muted });
  s += `<line x1="294" y1="261" x2="316" y2="261" stroke="${C.tint2}" stroke-width="2" stroke-dasharray="4 4"/>`;
  s += t(320, 265, "Theorie", { size: 11.5, fill: C.muted });
  const series = [
    { name: "Ist", color: C.tint, pts: data.Brustpresse, area: true, label: "27,5" },
    { name: "Theorie", color: C.tint2, pts: targetBrust, dashed: true, label: "" },
  ];
  s += multiLine(24, 292, 342, 168, series, days, { scrubAt: 6, tip: "16.5 · 27,5 kg" });

  // exercise cards grid (2 cols)
  s += sectionTitle(22, 496, "Alle Übungen");
  const cards = [
    ["Brustpresse", "27,5", data.Brustpresse, "+2,5", C.green, C.tint],
    ["Latzug", "45", data.Latzug, "+2,5", C.green, C.green],
    ["Rudern", "45", data.Rudern, "+2,5", C.green, C.orange],
    ["Seitheben", "27,5", data.Seitheben, "Bereit", "#aab4ff", C.cyan],
  ];
  const gw = 173, gh = 96, gx0 = 16, gy0 = 508, gap = 12;
  cards.forEach((cd, i) => {
    const col = i % 2, row = (i / 2) | 0;
    const x = gx0 + col * (gw + gap), y = gy0 + row * (gh + gap);
    const [name, kg, pts, delta, dcol, scol] = cd;
    s += card(x, y, gw, gh, 16);
    s += t(x + 16, y + 28, name, { size: 13.5, w: 650 });
    s += t(x + 16, y + 60, kg, { size: 28, w: 800 });
    s += t(x + 16 + (kg.length * 16.5), y + 60, "kg", { size: 12, fill: C.muted });
    s += spark(x + 16, y + 70, gw - 70, 18, pts, scol);
    const dl = pill(x + gw - 54, y + 16, delta, dcol === C.green ? "#3ddc9724" : "#8b9bff2e", dcol); s += dl.svg;
  });

  return frame(s);
}

// ============================================================
// CONCEPT C — Pro analytics: segmented metric, heatmap, PRs
// ============================================================
function conceptC() {
  let s = navTitle(20, 78, "Analyse");

  // segmented metric control
  const segs = ["Gewicht", "Volumen", "1RM"];
  let sx = 16; const segW = 358 / 3;
  s += rr(16, 92, 358, 34, 12, C.card, { stroke: "#ffffff0c" });
  segs.forEach((sg, i) => {
    if (i === 0) s += rr(19, 95, segW - 6, 28, 10, "url(#playgrad)");
    s += t(16 + segW * i + segW / 2, 113, sg, { size: 13, w: i === 0 ? 700 : 600, fill: i === 0 ? "#0b0e23" : C.muted, anchor: "middle" });
  });

  // big multi-series chart
  const cy = 138, ch = 236;
  s += card(16, cy, 358, ch);
  s += t(34, cy + 26, "Top-Gewicht je Übung", { size: 14, w: 700 });
  s += t(356, cy + 26, "kg", { size: 12, fill: C.faint, anchor: "end" });
  const series = [
    { name: "Latzug", color: C.green, pts: data.Latzug.map((v) => v + 0.6) },
    { name: "Rudern", color: C.orange, pts: data.Rudern },
    { name: "Brustpresse", color: C.tint, pts: data.Brustpresse, area: true },
    { name: "Seitheben", color: C.cyan, pts: data.Seitheben },
  ];
  s += multiLine(24, cy + 34, 342, ch - 44, series, days, { scrubAt: 4, tip: "2.5 · 25 kg", minZero: true });

  // legend row
  let lx = 22, ly = cy + ch + 12;
  [["Latzug", C.green], ["Rudern", C.orange], ["Brustpresse", C.tint], ["Seitheben", C.cyan]].forEach(([l, c]) => {
    s += circle(lx + 5, ly + 8, 4.5, c); s += t(lx + 14, ly + 12, l, { size: 11.5, w: 600, fill: C.muted });
    lx += l.length * 6.6 + 28;
  });

  // training heatmap
  let hy = ly + 34;
  s += sectionTitle(22, hy, "Trainingstage · letzte 10 Wochen");
  hy += 10;
  const hmH = 158;
  s += card(16, hy, 358, hmH);
  const cell = 14, cgap = 5, weeks = 10, gx = 40, gy = hy + 18;
  const dayLab = ["M", "D", "M", "D", "F", "S", "S"];
  dayLab.forEach((d, r) => s += t(gx - 8, gy + r * (cell + cgap) + 10, d, { size: 8.5, fill: C.faint, anchor: "end" }));
  // pseudo-random intensity
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let w = 0; w < weeks; w++) for (let r = 0; r < 7; r++) {
    const x = gx + w * (cell + cgap), y = gy + r * (cell + cgap);
    const v = rnd();
    let fill = C.line, op = 1;
    if ((r === 0 || r === 2 || r === 4) && v > 0.35) { fill = C.green; op = 0.4 + v * 0.6; }
    else if (v > 0.85) { fill = C.green; op = 0.5; }
    s += rr(x, y, cell, cell, 3, fill, { op });
  }
  // legend scale bottom-right
  const lgY = gy + 7 * (cell + cgap) + 4;
  s += t(gx, lgY + 4, "weniger", { size: 9.5, fill: C.faint });
  [0.18, 0.4, 0.65, 0.9].forEach((o, i) => s += rr(gx + 56 + i * 12, lgY - 6, 9, 9, 2, C.green, { op: o }));
  s += t(gx + 56 + 4 * 12 + 4, lgY + 4, "mehr", { size: 9.5, fill: C.faint });

  // PR highlights
  let py = hy + hmH + 16;
  s += sectionTitle(22, py, "Neue Bestwerte");
  py += 10;
  s += card(16, py, 358, 116);
  const prs = [["Latzug", "45 kg", "1RM 56,3 kg", C.green, "★"],
               ["Brustpresse", "27,5 kg", "1RM 33,0 kg", C.tint, "▲"],
               ["Rudern", "45 kg", "1RM 50,6 kg", C.orange, "▲"]];
  prs.forEach((p, i) => {
    const yy = py + i * 38;
    if (i) s += `<line x1="16" y1="${yy}" x2="374" y2="${yy}" stroke="${C.line}"/>`;
    s += circle(38, yy + 19, 13, p[3] + "22");
    s += t(38, yy + 24, p[4], { size: 14, anchor: "middle" });
    s += t(62, yy + 18, p[0], { size: 15, w: 650 });
    s += t(62, yy + 33, p[2], { size: 11.5, fill: C.faint });
    s += t(360, yy + 25, p[1], { size: 16, w: 800, fill: p[3], anchor: "end" });
  });

  return frame(s);
}

// render helper
function render(svg, name) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: W * 2 }, font: { loadSystemFonts: true } });
  writeFileSync(`/home/user/iron-journal/docs/mockups/${name}.png`, r.render().asPng());
  console.log("wrote", name);
}

import { mkdirSync } from "node:fs";
mkdirSync("/home/user/iron-journal/docs/mockups", { recursive: true });
render(conceptA(), "concept-a-unified-plot");
render(conceptB(), "concept-b-cards");
render(conceptC(), "concept-c-analytics");
