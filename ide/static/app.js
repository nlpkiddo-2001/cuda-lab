// CUDA Lab front-end: lessons, editor, run, output.
(() => {
  const $ = s => document.querySelector(s);
  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };
  const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  let current = null;      // {id, starter, has_solution}
  let editor = null;       // {get, set, markers, focus}
  let saveTimer = null;
  let busy = false;

  // ---------------------------------------------------------------- editor
  function textareaEditor() {
    const ta = document.createElement("textarea");
    ta.spellcheck = false;
    $("#editor").innerHTML = ""; $("#editor").appendChild(ta);
    ta.addEventListener("input", scheduleSave);
    ta.addEventListener("keydown", e => {
      if (e.key === "Tab") { e.preventDefault(); document.execCommand("insertText", false, "    "); }
    });
    return { get: () => ta.value, set: v => { ta.value = v; }, markers() {}, focus: () => ta.focus() };
  }

  function monacoEditor() {
    return new Promise((resolve, reject) => {
      if (!window.require) return reject(new Error("monaco loader missing"));
      const timer = setTimeout(() => reject(new Error("monaco timeout")), 8000);
      require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" } });
      require(["vs/editor/editor.main"], () => {
        clearTimeout(timer);
        monaco.editor.defineTheme("lab", {
          base: "vs-dark", inherit: true, rules: [],
          colors: { "editor.background": "#1a1a19", "editorLineNumber.foreground": "#5c5b55" },
        });
        const ed = monaco.editor.create($("#editor"), {
          language: "cpp", theme: "lab", automaticLayout: true, fontSize: 13.5, minimap: { enabled: false },
          scrollBeyondLastLine: false, tabSize: 4, insertSpaces: true, renderWhitespace: "selection",
          fontFamily: 'ui-monospace, "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace',
        });
        ed.onDidChangeModelContent(scheduleSave);
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run());
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => save());
        resolve({
          get: () => ed.getValue(),
          set: v => { ed.setValue(v); ed.setScrollTop(0); },
          markers: list => monaco.editor.setModelMarkers(ed.getModel(), "nvcc", list.map(m => ({
            startLineNumber: m.line, endLineNumber: m.line, startColumn: m.col || 1, endColumn: 1000, message: m.msg,
            severity: m.sev === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          }))),
          focus: () => ed.focus(),
        });
      }, err => { clearTimeout(timer); reject(err); });
    });
  }

  // ---------------------------------------------------------------- api
  async function api(path, body) {
    const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || j.error || r.statusText);
    return j;
  }

  function setStatus(text, cls = "") { const s = $("#status"); s.textContent = text; s.className = "status " + cls; }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1500);
  }
  async function save() {
    clearTimeout(saveTimer);
    if (!current) return;
    try { await api("/api/save", { id: current.id, code: editor.get() }); setStatus("saved"); }
    catch (e) { setStatus("save failed: " + e.message, "err"); }
  }

  // ---------------------------------------------------------------- lessons
  async function loadSidebar() {
    const cur = await api("/api/lessons");
    const nav = $("#sidebar"); nav.innerHTML = "";
    const add = (id, num, title, available, started) => {
      const a = document.createElement("a");
      a.dataset.id = id;
      a.className = available ? "" : "locked";
      a.innerHTML = `<span class="num">${num}</span><span>${esc(title)}</span>${started ? '<span class="dot" title="in progress">●</span>' : ""}`;
      a.title = available ? title : "coming soon: ask Claude to create this lesson";
      if (available) a.onclick = () => openLesson(id);
      nav.appendChild(a);
    };
    const h = document.createElement("h4"); h.textContent = "Scratch"; nav.appendChild(h);
    add("playground", "∞", "Playground", true, false);
    for (const m of cur.modules) {
      const h4 = document.createElement("h4"); h4.textContent = m.title; nav.appendChild(h4);
      for (const l of m.lessons) add(l.id, l.id.split("-")[0], l.title, l.available, l.started);
    }
    markActive();
  }
  function markActive() {
    document.querySelectorAll("#sidebar a").forEach(a => a.classList.toggle("active", current && a.dataset.id === current.id));
  }

  async function openLesson(id) {
    if (current) await save();
    let les;
    try { les = await api("/api/lesson/" + id); } catch (e) { setStatus(e.message, "err"); return; }
    current = les;
    store.set("cudalab.lesson", id);
    location.hash = id;
    $("#lessonBody").innerHTML = window.marked ? marked.parse(les.markdown) : `<pre>${esc(les.markdown)}</pre>`;
    $("#lessonPane").scrollTop = 0;
    $("#lessonTitle").textContent = (les.markdown.match(/^#\s+(.*)$/m) || [, id])[1];
    $("#solutionBtn").disabled = !les.has_solution;
    editor.set(les.work ?? les.starter);
    editor.markers([]);
    $("#output").textContent = "Press ▶ Run (Ctrl+Enter) to compile and run on the GPU.";
    Viz.render($("#viz"), []); $("#vizCount").textContent = "";
    $("#resources").innerHTML = '<p class="muted" style="padding:0 14px">Run the code to see per-kernel resources.</p>';
    markActive();
    setStatus(les.work ? "restored your saved work" : "starter code loaded");
  }

  // ---------------------------------------------------------------- run
  function parseDiagnostics(log) {
    const out = [];
    for (const line of log.split("\n")) {
      let m = line.match(/main\.cu\((\d+)\):\s*(error|warning)[^:]*:\s*(.*)/);
      if (m) { out.push({ line: +m[1], sev: m[2], msg: m[3] }); continue; }
      m = line.match(/main\.cu:(\d+):(\d+):\s*(error|warning):\s*(.*)/);
      if (m) out.push({ line: +m[1], col: +m[2], sev: m[3], msg: m[4] });
    }
    return out;
  }

  function colorLog(log) {
    return esc(log).split("\n").map(l =>
      /error/i.test(l) ? `<span class="err">${l}</span>` : /warning/i.test(l) ? `<span class="warn">${l}</span>` : l).join("\n");
  }

  function renderResources(kernels) {
    const box = $("#resources");
    if (!kernels || !kernels.length) { box.innerHTML = '<p class="muted" style="padding:0 14px">No kernels compiled.</p>'; return; }
    // sm_86: 64K regs/SM, 48 warps/SM max, registers allocated per warp in units of 256
    const rows = kernels.map(k => {
      const perWarp = Math.ceil(Math.max(k.registers, 1) * 32 / 256) * 256;
      const warps = Math.min(48, Math.floor(65536 / perWarp));
      const occ = Math.round(warps / 48 * 100);
      const spill = k.spill_stores + k.spill_loads;
      return `<tr><td>${esc(k.name)}</td><td>${k.registers}</td><td>${k.smem}</td><td>${k.cmem}</td><td>${k.stack}</td>
        <td class="${spill ? "bad" : ""}">${k.spill_stores} / ${k.spill_loads}</td><td>${warps * 32} (${occ}%)</td></tr>`;
    }).join("");
    box.innerHTML = `<table class="res-table"><tr><th>kernel</th><th>registers / thread</th><th>static smem (B)</th>
      <th>constant mem (B)</th><th>stack (B)</th><th>spill st / ld (B)</th><th>max threads/SM by regs</th></tr>${rows}</table>
      <p class="res-note">From <code>ptxas -v</code>. Each SM on the A6000 has 65,536 registers and holds at most 1,536 threads (48 warps).
      More registers per thread means fewer threads can be resident at once (lower occupancy). Spills mean registers
      overflowed into slow local memory. Shared memory and block size also limit occupancy (Lesson 16).</p>`;
  }

  async function run(mode = "run") {
    if (busy || !current) return;
    busy = true; $("#runBtn").disabled = true;
    const gpu = +$("#gpuSelect").value;
    setStatus(mode === "ptx" ? "generating PTX…" : `compiling…`);
    const body = { id: current.id, code: editor.get(), gpu, args: $("#args").value, flags: $("#flags").value, mode };
    try {
      if (mode === "run") setTimeout(() => busy && setStatus(`running on GPU ${gpu}…`), 1500);
      const res = await api("/api/run", body);
      const diags = parseDiagnostics(res.compile.log || "");
      editor.markers(diags);
      if (mode === "ptx") {
        $("#ptx").textContent = res.ptx ?? res.compile.log;
        showTab("ptx");
        setStatus(res.compile.ok ? "PTX ready" : "compile failed", res.compile.ok ? "ok" : "err");
        return;
      }
      let html = `<span class="sec">── compile ${res.compile.ok ? "ok" : "FAILED"} (${Math.round(res.compile.ms)} ms) ──</span>\n`;
      if (res.compile.log.trim()) html += colorLog(res.compile.log) + "\n";
      if (res.run) {
        const r = res.run;
        const okRun = r.exit_code === 0 && !r.timed_out;
        html += `<span class="sec">── run on GPU ${r.gpu} · ${Math.round(r.ms)} ms · exit ${r.exit_code} ──</span>\n`;
        html += esc(r.stdout) + (r.stdout && !r.stdout.endsWith("\n") ? "\n" : "");
        if (r.stderr) html += `<span class="err">${esc(r.stderr)}</span>`;
        if (r.timed_out) html += `<span class="err">⏱ killed after 30 s timeout (infinite loop or deadlock?)</span>\n`;
        setStatus(okRun ? `done · ${Math.round(r.ms)} ms` : `exit ${r.exit_code}`, okRun ? "ok" : "err");
        Viz.render($("#viz"), res.viz);
        $("#vizCount").textContent = res.viz.length || "";
        renderResources(res.compile.kernels);
        showTab(res.viz.length && okRun ? "viz" : "output");
      } else {
        setStatus(`compile failed · ${diags.filter(d => d.sev === "error").length} error(s)`, "err");
        showTab("output");
      }
      $("#output").innerHTML = html;
      loadSidebar();
    } catch (e) {
      setStatus("error: " + e.message, "err");
      $("#output").innerHTML = `<span class="err">${esc(e.message)}</span>`;
      showTab("output");
    } finally {
      busy = false; $("#runBtn").disabled = false;
    }
  }

  // ---------------------------------------------------------------- ui wiring
  function showTab(name) {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-body").forEach(b => b.classList.toggle("active", b.id === "tab-" + name));
  }
  document.querySelectorAll(".tab").forEach(t => t.onclick = () => showTab(t.dataset.tab));

  async function loadGpus() {
    const sel = $("#gpuSelect");
    try {
      const { gpus } = await api("/api/gpus");
      const saved = store.get("cudalab.gpu", null);
      sel.innerHTML = gpus.map(g => `<option value="${g.index}">${g.index} · ${(g.mem_used / 1024).toFixed(1)}/${Math.round(g.mem_total / 1024)} GB · ${g.util}%</option>`).join("");
      const freest = gpus.slice().sort((a, b) => a.mem_used - b.mem_used)[0];
      sel.value = saved !== null && gpus.some(g => String(g.index) === saved) ? saved : String(freest ? freest.index : 0);
    } catch { sel.innerHTML = '<option value="0">0</option>'; }
  }
  $("#gpuSelect").onchange = e => store.set("cudalab.gpu", e.target.value);

  $("#runBtn").onclick = () => run();
  $("#ptxBtn").onclick = () => run("ptx");
  $("#resetBtn").onclick = () => {
    if (current && confirm("Replace the editor contents with the starter code? Your current code will be overwritten.")) {
      editor.set(current.starter); save();
    }
  };
  $("#solutionBtn").onclick = async () => {
    if (!current || !confirm("Load the reference solution into the editor? Your current code will be overwritten.\nTip: try the exercise yourself first!")) return;
    const { code } = await api(`/api/lesson/${current.id}/solution`);
    editor.set(code); save();
  };
  $("#toggleSidebar").onclick = () => $("#sidebar").classList.toggle("hidden");
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
  });

  // pane splitters
  function drag(handle, onMove) {
    handle.addEventListener("mousedown", e => {
      e.preventDefault();
      const move = ev => onMove(ev);
      const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.userSelect = ""; };
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
    });
  }
  drag($(".hsplit"), e => {
    const pane = $("#lessonPane"), left = pane.getBoundingClientRect().left;
    pane.style.width = Math.max(240, Math.min(window.innerWidth - 400, e.clientX - left)) + "px";
  });
  drag($(".vsplit"), e => {
    const work = $(".work").getBoundingClientRect();
    $("#bottom").style.height = Math.max(120, Math.min(work.height - 120, work.bottom - e.clientY)) + "px";
  });

  // ---------------------------------------------------------------- boot
  (async () => {
    try { editor = await monacoEditor(); }
    catch (e) { console.warn("Monaco unavailable, using plain editor:", e); editor = textareaEditor(); }
    await Promise.all([loadSidebar(), loadGpus()]);
    const start = location.hash.slice(1) || store.get("cudalab.lesson", "01-hello-gpu");
    await openLesson(start).catch(() => openLesson("01-hello-gpu"));
    if (!current) await openLesson("01-hello-gpu");
  })();
})();
