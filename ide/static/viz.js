// Renderers for @@VIZ records emitted by cudalearn.h. Each returns a DOM card.
const Viz = (() => {
  const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
  // sequential blue ramp, low (recedes into dark surface) -> high (bright)
  const RAMP = ["#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef", "#9ec5f4", "#b7d3f6", "#cde2fb"];
  const PEAK_GBPS = 768;   // RTX A6000
  const NS = "http://www.w3.org/2000/svg";
  const tip = () => document.getElementById("tooltip");

  function showTip(e, html) {
    const t = tip(); t.innerHTML = html; t.hidden = false;
    const x = Math.min(e.clientX + 14, window.innerWidth - t.offsetWidth - 8);
    const y = Math.max(8, e.clientY - t.offsetHeight - 10);
    t.style.left = x + "px"; t.style.top = y + "px";
  }
  const hideTip = () => { tip().hidden = true; };

  function el(tag, attrs = {}, parent) {
    const n = tag.startsWith("svg:") ? document.createElementNS(NS, tag.slice(4)) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") n.textContent = v; else if (k === "html") n.innerHTML = v; else n.setAttribute(k, v);
    }
    if (parent) parent.appendChild(n);
    return n;
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  function card(title, sub, wide) {
    const c = el("div", { class: "card" + (wide ? " wide" : "") });
    el("h5", { text: title }, c);
    if (sub) el("div", { class: "sub", html: sub }, c);
    return c;
  }
  function stats(parent, items) {
    const s = el("div", { class: "stats" }, parent);
    for (const [label, val] of items) { const d = el("div", { class: "stat" }, s); el("b", { text: val }, d); el("span", { text: label }, d); }
  }
  function fmt(v) {
    if (v === null || v === undefined) return "NaN";
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(2);
    return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(a >= 100 ? 1 : 3)));
  }
  function rampColor(t) {
    t = Math.max(0, Math.min(1, isFinite(t) ? t : 0));
    return RAMP[Math.round(t * (RAMP.length - 1))];
  }
  function inkFor(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 120 ? "#0b0b0b" : "#f0efec";
  }
  function tableToggle(parent, headers, rows) {
    const b = el("button", { class: "toggle-table", text: "Show table" }, parent);
    let t = null;
    b.onclick = () => {
      if (t) { t.remove(); t = null; b.textContent = "Show table"; return; }
      t = el("table", { class: "data-table" });
      const hr = el("tr", {}, t); headers.forEach(h => el("th", { text: h }, hr));
      rows.slice(0, 2000).forEach(r => { const tr = el("tr", {}, t); r.forEach(v => el("td", { text: v }, tr)); });
      parent.appendChild(t); b.textContent = "Hide table";
    };
  }

  // ---------------------------------------------------------------- launch
  function launch(r) {
    const [gx, gy, gz] = r.grid, [bx, by, bz] = r.block;
    const blocks = gx * gy * gz, tpb = bx * by * bz, warps = Math.ceil(tpb / 32);
    const idle = warps * 32 - tpb;
    const c = card(r.title, `&lt;&lt;&lt;dim3(${gx},${gy},${gz}), dim3(${bx},${by},${bz})&gt;&gt;&gt;`, true);
    stats(c, [["blocks", blocks.toLocaleString()], ["threads / block", tpb], ["total threads", (blocks * tpb).toLocaleString()],
              ["warps / block", warps], ["idle lanes / block", idle]]);
    if (tpb > 1024) el("div", { class: "sub bad", text: "⚠ more than 1024 threads per block, so this launch will fail" }, c);

    const wrap = el("div", { style: "display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start" }, c);

    // grid overview
    const showX = Math.min(gx, 16), showY = Math.min(gy, 8);
    const cw = Math.max(18, Math.min(44, Math.floor(360 / showX))), ch = Math.min(30, cw);
    const W = showX * (cw + 2) + 4, H = showY * (ch + 2) + 24;
    const g = el("svg:svg", { width: W, height: H + (gx > showX || gy > showY ? 16 : 0) });
    el("svg:text", { x: 0, y: 12, text: `Grid (${gx}×${gy}${gz > 1 ? "×" + gz : ""} blocks)` }, g);
    for (let y = 0; y < showY; y++) for (let x = 0; x < showX; x++) {
      const id = y * gx + x;
      const rc = el("svg:rect", { x: x * (cw + 2), y: 20 + y * (ch + 2), width: cw, height: ch, rx: 3,
        fill: id === 0 ? SERIES[0] : "#2c2c2a", stroke: "#4a4a45" }, g);
      if (cw >= 30) el("svg:text", { x: x * (cw + 2) + cw / 2, y: 20 + y * (ch + 2) + ch / 2 + 4, "text-anchor": "middle",
        class: "mono", text: gy > 1 ? `${x},${y}` : x, style: id === 0 ? "fill:#0b0b0b" : "" }, g);
      rc.addEventListener("mousemove", e => showTip(e, `blockIdx = (${x}, ${y})<br>threads ${id * tpb}…${id * tpb + tpb - 1}`));
      rc.addEventListener("mouseleave", hideTip);
    }
    if (gx > showX || gy > showY) el("svg:text", { x: 0, y: H + 12, text: `… showing ${showX}×${showY} of ${gx}×${gy}` }, g);
    wrap.appendChild(g);

    // block 0 detail: one row per warp, 32 lanes each
    const showW = Math.min(warps, 32), lane = 9, rowH = 11;
    const bw = 32 * lane + 70, bh = showW * rowH + 24;
    const b = el("svg:svg", { width: bw, height: bh });
    el("svg:text", { x: 0, y: 12, text: `Block 0: ${tpb} threads → ${warps} warp${warps > 1 ? "s" : ""} × 32 lanes` }, b);
    for (let w = 0; w < showW; w++) {
      const col = warps <= 8 ? SERIES[w] : rampColor(w / Math.max(1, warps - 1));
      el("svg:text", { x: 0, y: 22 + w * rowH + 8, class: "mono", text: `warp ${w}` }, b);
      for (let l = 0; l < 32; l++) {
        const t = w * 32 + l, active = t < tpb;
        const rc = el("svg:rect", { x: 60 + l * lane, y: 22 + w * rowH, width: lane - 2, height: rowH - 2, rx: 2,
          fill: active ? col : "none", stroke: active ? "none" : "#6a6a63", "stroke-dasharray": active ? "" : "2 1" }, b);
        rc.addEventListener("mousemove", e => {
          const tx = t % bx, ty = Math.floor(t / bx) % by, tz = Math.floor(t / (bx * by));
          showTip(e, active ? `threadIdx = (${tx}, ${ty}, ${tz})<br>warp ${w}, lane ${l}` : `idle lane ${l} of warp ${w}<br>(no thread, wasted)`);
        });
        rc.addEventListener("mouseleave", hideTip);
      }
    }
    wrap.appendChild(b);
    return c;
  }

  // ---------------------------------------------------------------- array
  function array(r) {
    const d = r.data, n = d.length, s = r.stride;
    const c = card(r.title, `${r.n.toLocaleString()} elements${s > 1 ? ` (every ${s}th shown)` : ""}`);
    const vals = d.filter(v => v !== null);
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    if (lo === hi) hi = lo + 1;
    const W = 440, H = 190, L = 44, R = 8, T = 8, B = 22, pw = W - L - R, ph = H - T - B;
    const y = v => T + (hi - v) / (hi - lo) * ph;
    const svg = el("svg:svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, c);
    for (let k = 0; k <= 4; k++) {
      const v = lo + (hi - lo) * k / 4;
      el("svg:line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "#2e2e2b" }, svg);
      el("svg:text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", text: fmt(+v.toPrecision(3)) }, svg);
    }
    el("svg:line", { x1: L, x2: W - R, y1: y(0), y2: y(0), stroke: "#6a6a63" }, svg);
    [0, Math.floor((n - 1) / 2), n - 1].forEach(k =>
      el("svg:text", { x: L + (k + 0.5) / n * pw, y: H - 6, "text-anchor": "middle", text: k * s }, svg));

    const hl = el("svg:line", { y1: T, y2: T + ph, stroke: "#8e8d84", "stroke-width": 1, visibility: "hidden" }, svg);
    if (n <= 128) {
      const bw = pw / n, gap = bw > 4 ? 2 : 0;
      d.forEach((v, k) => {
        if (v === null) return;
        const y0 = y(0), y1 = y(v), h = Math.abs(y1 - y0), rr = Math.min(4, (bw - gap) / 2, h);
        const x = L + k * bw + gap / 2, w = bw - gap, top = Math.min(y0, y1);
        // rounded data-end, square at the baseline
        const p = v >= 0
          ? `M${x},${y0}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${y0}Z`
          : `M${x},${y0}V${top + h - rr}Q${x},${top + h} ${x + rr},${top + h}H${x + w - rr}Q${x + w},${top + h} ${x + w},${top + h - rr}V${y0}Z`;
        el("svg:path", { d: p, fill: SERIES[0] }, svg);
      });
    } else {
      let p = "";
      d.forEach((v, k) => { if (v !== null) p += (p ? "L" : "M") + (L + (k + 0.5) / n * pw).toFixed(1) + "," + y(v).toFixed(1); });
      el("svg:path", { d: p, fill: "none", stroke: SERIES[0], "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    }
    const dot = el("svg:circle", { r: 4, fill: SERIES[0], stroke: "#222220", "stroke-width": 2, visibility: "hidden" }, svg);
    const hit = el("svg:rect", { x: L, y: T, width: pw, height: ph, fill: "transparent" }, svg);
    hit.addEventListener("mousemove", e => {
      const box = svg.getBoundingClientRect(), sx = W / box.width;
      const k = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - box.left) * sx - L) / pw * n)));
      const cx = L + (k + 0.5) / n * pw;
      hl.setAttribute("x1", cx); hl.setAttribute("x2", cx); hl.setAttribute("visibility", "visible");
      if (d[k] !== null) { dot.setAttribute("cx", cx); dot.setAttribute("cy", y(d[k])); dot.setAttribute("visibility", "visible"); }
      showTip(e, `[${k * s}] = ${fmt(d[k])}`);
    });
    hit.addEventListener("mouseleave", () => { hideTip(); hl.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); });
    tableToggle(c, ["index", "value"], d.map((v, k) => [k * s, fmt(v)]));
    return c;
  }

  // ---------------------------------------------------------------- matrix
  function matrix(r) {
    const d = r.data, rows = d.length, cols = rows ? d[0].length : 0;
    const c = card(r.title, `${r.rows}×${r.cols}${r.rstride > 1 || r.cstride > 1 ? ` (downsampled ${r.rstride}×${r.cstride})` : ""}`);
    const flat = d.flat().filter(v => v !== null);
    const lo = Math.min(...flat), hi = Math.max(...flat), span = hi - lo || 1;
    const cell = Math.max(2, Math.min(24, Math.floor(420 / Math.max(rows, cols))));
    const cv = el("canvas", { width: cols * cell, height: rows * cell, style: "border-radius:4px;cursor:crosshair" }, c);
    const ctx = cv.getContext("2d");
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const v = d[i][j];
      ctx.fillStyle = v === null ? "#e66767" : rampColor((v - lo) / span);
      ctx.fillRect(j * cell, i * cell, cell - (cell > 6 ? 1 : 0), cell - (cell > 6 ? 1 : 0));
    }
    cv.addEventListener("mousemove", e => {
      const b = cv.getBoundingClientRect(), sx = cv.width / b.width;
      const j = Math.floor((e.clientX - b.left) * sx / cell), i = Math.floor((e.clientY - b.top) * sx / cell);
      if (i >= 0 && i < rows && j >= 0 && j < cols) showTip(e, `[${i * r.rstride}][${j * r.cstride}] = ${fmt(d[i][j])}`);
    });
    cv.addEventListener("mouseleave", hideTip);
    const lg = el("div", { class: "legend", style: "align-items:center" }, c);
    el("span", { text: fmt(lo) }, lg); el("div", { class: "ramp" }, lg); el("span", { text: fmt(hi) }, lg);
    tableToggle(c, ["row", ...d[0].map((_, j) => j * r.cstride)], d.map((row, i) => [i * r.rstride, ...row.map(fmt)]));
    return c;
  }

  // ---------------------------------------------------------------- labels
  function labels(r) {
    const { rows, cols, data } = r;
    const c = card(r.title, `${rows}×${cols} cells · hatched = never written (-1)`);
    const distinct = [...new Set(data.filter(v => v >= 0))].sort((a, b) => a - b);
    const lo = distinct[0] ?? 0, hi = distinct[distinct.length - 1] ?? 1;
    const colorOf = v => distinct.length <= 8 ? SERIES[distinct.indexOf(v)] : rampColor((v - lo) / ((hi - lo) || 1));
    const size = Math.max(8, Math.min(34, Math.floor(440 / cols)));
    const g = el("div", { class: "labels-grid", style: `grid-template-columns:repeat(${cols}, ${size}px)` }, c);
    data.forEach((v, k) => {
      const cell = el("div", {}, g);
      if (v < 0) cell.className = "empty";
      else { const col = colorOf(v); cell.style.background = col; cell.style.color = inkFor(col); }
      if (size >= 16) cell.textContent = v < 0 ? "·" : v;
      cell.addEventListener("mousemove", e => showTip(e, `element ${k} (row ${Math.floor(k / cols)}, col ${k % cols})<br>value = ${v < 0 ? "unwritten" : v}`));
      cell.addEventListener("mouseleave", hideTip);
    });
    if (distinct.length <= 8 && distinct.length > 1) {
      const lg = el("div", { class: "legend" }, c);
      distinct.forEach(v => { const s = el("span", {}, lg); el("i", { style: `background:${colorOf(v)}` }, s); s.append(String(v)); });
    }
    return c;
  }

  // ---------------------------------------------------------------- timing + bandwidth (grouped)
  function hbars(title, sub, items, max, unit, extra) {
    const c = card(title, sub);
    const W = 440, rowH = 26, L = 150, R = 110, H = items.length * rowH + 4;
    const svg = el("svg:svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, c);
    const pw = W - L - R;
    items.forEach((it, k) => {
      const y = k * rowH + 4, w = Math.max(2, (it.v / max) * pw);
      el("svg:text", { x: L - 8, y: y + 14, "text-anchor": "end", text: it.label.length > 22 ? it.label.slice(0, 21) + "…" : it.label }, svg);
      if (unit === "GB/s") el("svg:rect", { x: L, y: y + 3, width: pw, height: 14, rx: 4, fill: "#2c2c2a" }, svg);
      const bar = el("svg:path", { d: `M${L},${y + 3}H${L + w - 4}Q${L + w},${y + 3} ${L + w},${y + 7}V${y + 13}Q${L + w},${y + 17} ${L + w - 4},${y + 17}H${L}Z`, fill: SERIES[0] }, svg);
      el("svg:text", { x: L + (unit === "GB/s" ? pw : w) + 8, y: y + 14, class: "mono", text: `${fmt(it.v)} ${unit}${extra ? extra(it, k) : ""}` }, svg);
      const hit = el("svg:rect", { x: 0, y, width: W, height: rowH, fill: "transparent" }, svg);
      hit.addEventListener("mousemove", e => showTip(e, `${esc(it.label)}<br>${fmt(it.v)} ${unit}${extra ? extra(it, k) : ""}`));
      hit.addEventListener("mouseleave", hideTip);
      void bar;
    });
    tableToggle(c, ["label", unit], items.map(it => [it.label, fmt(it.v)]));
    return c;
  }
  function timings(list) {
    const items = list.map(r => ({ label: r.title, v: r.ms ?? 0 }));
    const base = items[0].v;
    return hbars("Timings", "GPU time per measurement (lower is better)", items, Math.max(...items.map(i => i.v)) || 1, "ms",
      (it, k) => (k > 0 && it.v > 0 ? `  ${(base / it.v).toFixed(2)}×` : ""));
  }
  function bandwidths(list) {
    const items = list.map(r => ({ label: r.title, v: r.gbps ?? 0 }));
    return hbars("Effective bandwidth", `vs RTX A6000 peak ≈ ${PEAK_GBPS} GB/s`, items, PEAK_GBPS, "GB/s",
      it => `  (${Math.round(it.v / PEAK_GBPS * 100)}%)`);
  }

  function render(container, records) {
    container.innerHTML = "";
    if (!records.length) { el("p", { class: "muted", text: "No viz:: output from this run. Call viz::array / viz::matrix / viz::launch …" }, container); return; }
    const T = records.filter(r => r.type === "timing"), B = records.filter(r => r.type === "bandwidth");
    const R = { launch, array, matrix, labels };
    for (const r of records) {
      if (R[r.type]) {
        try { container.appendChild(R[r.type](r)); }
        catch (e) { container.appendChild(card(r.title || r.type, `<span class="bad">render error: ${esc(e.message)}</span>`)); }
      }
    }
    if (T.length) container.appendChild(timings(T));
    if (B.length) container.appendChild(bandwidths(B));
  }
  return { render };
})();
