#!/usr/bin/env node
// runtime benchmark and equivalence check for the site's frame loops, shaders and compositing.
// no dependencies: node 22+ (built-in WebSocket) and Google Chrome, driven headless over the
// DevTools protocol on this machine's real GPU.
//
//   node tools/bench-gpu.mjs real    [--root DIR] [--out FILE.json] [--only a,b] [--cpu 4]
//   node tools/bench-gpu.mjs gpu     [--root DIR] [--out FILE.json] [--only a,b]
//   node tools/bench-gpu.mjs shots   [--root DIR] --out DIR [--only a,b]
//   node tools/bench-gpu.mjs ladder  [--root DIR]
//   node tools/bench-gpu.mjs compare DIR_A DIR_B [--diff DIR]
//
// real    real clock, real input (touch scroll gestures, mouse wheel), tracing. reports frame pacing,
//         main-thread time by kind, raster and gpu-process task time, megapixels shaded per second by
//         each canvas, what the two quality ladders did, layers. phone runs are repeated with the cpu
//         throttled (--cpu, default 4). the gpu itself cannot be throttled: see "gpu".
// gpu     virtual clock (the page only moves when the script steps it, so every run sees the same
//         frames). every WebGL draw is followed by a blocking read, which gives the gpu time of each
//         pass on this machine at each page state. absolute numbers are for this gpu only; the
//         ratio between two builds is what carries to a phone.
// shots   virtual clock again: a fixed list of page states (scroll, theme, size, time) saved as
//         lossless screenshots. run it on two builds, then "compare" them pixel by pixel.
//
// ladder  virtual clock: frames are made as slow as each case says, and the rungs the water's quality
//         ladder takes are printed. it shows the ladder's decisions, not a device.
//
// --root is the site to serve (default: this repository). to measure another commit:
//   git archive <commit> | tar -x -C /tmp/base && node tools/bench-gpu.mjs real --root /tmp/base

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createReadStream, statSync, mkdirSync, writeFileSync, readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import zlib from "node:zlib";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : argv[i + 1]; };
const ROOT = resolve(opt("root", join(dirname(fileURLToPath(import.meta.url)), "..")));
const ONLY = opt("only", "") ? opt("only", "").split(",") : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PHONE = { name: "phone", w: 390, h: 760, dpr: 3, mobile: true };
const DESK = { name: "desktop", w: 1440, h: 900, dpr: 2, mobile: false };

// ------------------------------------------------------------------ static server (with Range, for video)
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".woff2": "font/woff2", ".json": "application/json" };
function serve(root) {
  const srv = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const file = join(root, p);
    let st;
    try { if (!file.startsWith(root)) throw 0; st = statSync(file); if (!st.isFile()) throw 0; } catch { res.writeHead(404).end(); return; }
    const head = { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (m) {
      const a = m[1] ? +m[1] : 0, b = m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      res.writeHead(206, { ...head, "Content-Range": `bytes ${a}-${b}/${st.size}`, "Content-Length": b - a + 1 });
      createReadStream(file, { start: a, end: b }).pipe(res);
    } else { res.writeHead(200, { ...head, "Content-Length": st.size }); createReadStream(file).pipe(res); }
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}

// ------------------------------------------------------------------ chrome + a minimal protocol client
async function launch() {
  const dir = mkdtempSync(join(tmpdir(), "bench-gpu-"));
  const proc = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${dir}`,
    "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu-rasterization",
    "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--mute-audio",
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-component-update",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--disable-features=CalculateNativeWinOcclusion,Translate", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const url = await new Promise((res, rej) => {
    let buf = "";
    proc.stderr.on("data", (d) => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) res(m[1]); });
    proc.on("exit", () => rej(new Error("chrome exited: " + buf.slice(-400))));
  });
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map(), subs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.rej(new Error(p.method + ": " + m.error.message)) : p.res(m.result); return; }
    for (const s of subs) if (s.method === m.method && (!s.sessionId || s.sessionId === m.sessionId)) s.fn(m.params);
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { pending.set(++id, { res, rej, method }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
  const on = (method, sessionId, fn) => { const s = { method, sessionId, fn }; subs.push(s); return () => subs.splice(subs.indexOf(s), 1); };
  const close = async () => { try { await send("Browser.close"); } catch {} await sleep(300); try { proc.kill(); } catch {} try { rmSync(dir, { recursive: true, force: true }); } catch {} };
  return { send, on, close };
}

// ------------------------------------------------------------------ the script every page gets before its own
// it counts and times WebGL work per canvas, records frame pacing, and (virtual mode) replaces every
// clock the page can see with one that only moves when the benchmark steps it
function shim(cfg) {
  const B = (window.__bench = { cfg, gl: {}, frames: [], rec: false, timeDraws: false });
  const realNow = performance.now.bind(performance);
  const realRAF = window.requestAnimationFrame.bind(window);
  B.realNow = realNow;
  B.realFrames = (n = 2) => new Promise((r) => { const f = () => (--n <= 0 ? r() : realRAF(f)); realRAF(f); });
  try { if (!cfg.splash) sessionStorage.setItem("asufiji-in", "1"); } catch {}

  // ---- WebGL: draws, shaded area (scissor aware), the page's own blocking reads
  const info = new WeakMap();
  const getCtx = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    const gl = getCtx.call(this, type, ...a);
    if (gl && /^webgl/.test(type) && !info.has(gl)) {
      const name = this.id || String(this.className).split(" ")[0] || "canvas";
      const s = (B.gl[name] = { draws: 0, px: 0, w: 0, h: 0, sync: [], pass: {}, sizes: {}, sc: null, scOn: false, progs: new WeakMap(), nprog: 0, canvas: this });
      info.set(gl, s);
    }
    return gl;
  };
  const px1 = new Uint8Array(4);
  for (const P of [window.WebGLRenderingContext && WebGLRenderingContext.prototype, window.WebGL2RenderingContext && WebGL2RenderingContext.prototype]) {
    if (!P) continue;
    const { drawArrays, readPixels, scissor, enable, disable, useProgram } = P;
    P.scissor = function (x, y, w, h) { const s = info.get(this); if (s) s.sc = [x, y, w, h]; return scissor.call(this, x, y, w, h); };
    P.enable = function (c) { const s = info.get(this); if (s && c === this.SCISSOR_TEST) s.scOn = true; return enable.call(this, c); };
    P.disable = function (c) { const s = info.get(this); if (s && c === this.SCISSOR_TEST) s.scOn = false; return disable.call(this, c); };
    P.useProgram = function (p) { const s = info.get(this); if (s && p) { if (!s.progs.has(p)) s.progs.set(p, s.nprog++); s.cur = s.progs.get(p); } return useProgram.call(this, p); };
    P.drawArrays = function (...a) {
      const s = info.get(this);
      if (!s) return drawArrays.apply(this, a);
      const W = this.drawingBufferWidth, H = this.drawingBufferHeight;
      let area = W * H;
      if (s.scOn && s.sc) {
        const x0 = Math.max(0, s.sc[0]), y0 = Math.max(0, s.sc[1]), x1 = Math.min(W, s.sc[0] + s.sc[2]), y1 = Math.min(H, s.sc[1] + s.sc[3]);
        area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
      }
      s.w = W; s.h = H;
      if (B.rec || B.timeDraws) { s.draws++; s.px += area; s.sizes[W + "x" + H] = (s.sizes[W + "x" + H] || 0) + 1; }
      if (!B.timeDraws) return drawArrays.apply(this, a);
      // one pass is too quick to time (a fast gpu, a 0.1 ms page clock, and a third of a millisecond
      // just to ask), so it is drawn K times and read once: the read returns when the gpu has finished
      // them all. blending is on for those draws, or a tile gpu would shade only the last of them
      // (what the canvas holds afterwards is not the page's picture; timing runs are never looked at)
      const K = 24, blend = this.isEnabled(this.BLEND);
      enable.call(this, this.BLEND); this.blendColor(0, 0, 0, 0.5); this.blendFunc(this.CONSTANT_ALPHA, this.ONE_MINUS_CONSTANT_ALPHA);
      readPixels.call(this, 0, 0, 1, 1, this.RGBA, this.UNSIGNED_BYTE, px1);        // empty the queue first
      const t0 = realNow();
      for (let i = 0; i < K; i++) drawArrays.apply(this, a);
      readPixels.call(this, 0, 0, 1, 1, this.RGBA, this.UNSIGNED_BYTE, px1);
      const k = "p" + (s.cur || 0);
      (s.pass[k] || (s.pass[k] = { ms: [], px: 0 })).ms.push((realNow() - t0) / K);
      this.blendFunc(this.ONE, this.ZERO); if (!blend) disable.call(this, this.BLEND);
      s.pass[k].px = area;
    };
    P.readPixels = function (...a) {
      const s = info.get(this);
      if (!s || !B.rec) return readPixels.apply(this, a);
      const t0 = realNow(); const r = readPixels.apply(this, a); s.sync.push(realNow() - t0); return r;
    };
  }
  B.glReset = () => { for (const k in B.gl) { const s = B.gl[k]; s.draws = 0; s.px = 0; s.sync = []; s.pass = {}; s.sizes = {}; } B.frames = []; };
  B.glRead = () => { const o = {}; for (const k in B.gl) { const s = B.gl[k]; o[k] = { draws: s.draws, px: s.px, w: s.w, h: s.h, sync: s.sync, pass: s.pass, sizes: s.sizes, cssH: s.canvas.clientHeight }; } return o; };

  if (!cfg.virtual) {
    // real clock: note the spacing of the frames the page itself asks for
    let last = 0;
    window.requestAnimationFrame = (cb) => realRAF((ts) => { if (ts !== last) { if (last && B.rec) B.frames.push(ts - last); last = ts; } cb(ts); });
    return;
  }

  // ---- virtual clock: rAF, performance.now, Date.now, timers, css animations and transitions, video
  let vnow = 0, seq = 0;
  const rafQ = new Map(), timers = new Map();
  window.requestAnimationFrame = (cb) => { rafQ.set(++seq, cb); return seq; };
  window.cancelAnimationFrame = (id) => { rafQ.delete(id); };
  performance.now = () => vnow;
  Date.now = () => 1.7e12 + vnow;
  window.setTimeout = (fn, ms = 0, ...args) => { timers.set(++seq, { due: vnow + Math.max(0, +ms || 0), fn, args, every: 0 }); return seq; };
  window.setInterval = (fn, ms = 0, ...args) => { timers.set(++seq, { due: vnow + Math.max(1, +ms || 0), fn, args, every: Math.max(1, +ms || 0) }); return seq; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  let rs = 0x2f6e2b1;                              // Math.random: the same sequence every run
  Math.random = () => { rs = (rs + 0x6d2b79f5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  HTMLMediaElement.prototype.play = function () { this.__on = true; return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () { this.__on = false; };
  // css animations are pinned to the virtual clock from the step they first appear in. transitions
  // are finished the moment they start: one held part-way on the compositor did not always show the
  // value the page had computed for it, and a capture has to show the page's own state
  const born = new WeakMap();
  const pin = () => {
    for (const a of document.getAnimations()) {
      if (typeof CSSTransition !== "undefined" && a instanceof CSSTransition) { try { a.finish(); } catch {} continue; }
      if (!born.has(a)) { born.set(a, vnow); try { a.pause(); } catch {} }
      try { a.currentTime = vnow - born.get(a); } catch {}
    }
    for (const svg of document.querySelectorAll("svg")) { try { svg.pauseAnimations(); svg.setCurrentTime(0); } catch {} }
  };
  const once = (advance) => {
    vnow += advance;
    for (const [id, t] of [...timers].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])) {
      if (t.due > vnow || !timers.has(id)) continue;
      if (t.every) t.due += t.every; else timers.delete(id);
      try { typeof t.fn === "function" && t.fn(...t.args); } catch (e) { console.error(e); }
    }
    const q = [...rafQ]; rafQ.clear();
    for (const [, cb] of q) { try { cb(vnow); } catch (e) { console.error(e); } }
    pin();
  };
  const keep = () => { pin(); realRAF(keep); };
  realRAF(keep);
  B.now = () => vnow;
  // one real frame between virtual ones, so scroll events, observers and style all land in the step they belong to
  B.step = async (n = 1, dt = 1000 / 60) => { for (let i = 0; i < n; i++) { once(dt); await B.realFrames(1); } return vnow; };
  B.pump = async (n = 1) => { for (let i = 0; i < n; i++) { once(0); await B.realFrames(1); } };
  B.run = (n = 1, dt = 1000 / 60) => { for (let i = 0; i < n; i++) once(dt); return vnow; };      // no real frames between: for long runs
  // every clip the page has asked to play shows the same frame
  B.videos = async (t = 0.6) => {
    const vs = [...document.querySelectorAll("video")].filter((v) => v.__on);
    for (const v of vs) { v.preload = "auto"; v.currentTime = t; }
    const t0 = realNow();
    while (realNow() - t0 < 6000 && vs.some((v) => v.readyState < 2 || v.seeking)) await B.realFrames(2);
    await B.realFrames(3);
    return vs.length;
  };
}

async function openPage(cdp, base, dev, { virtual = false, splash = false, theme = "dark", cpu = 1 } = {}) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", newWindow: true, width: dev.w, height: dev.h });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S("Page.enable"); await S("Runtime.enable"); await S("Network.enable");
  await S("Network.setCacheDisabled", { cacheDisabled: true });
  await S("Emulation.setDeviceMetricsOverride", { width: dev.w, height: dev.h, deviceScaleFactor: dev.dpr, mobile: dev.mobile, screenWidth: dev.w, screenHeight: dev.h });
  if (dev.mobile) { await S("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }); await S("Emulation.setEmitTouchEventsForMouse", { enabled: false }); }
  await S("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
  if (cpu > 1) await S("Emulation.setCPUThrottlingRate", { rate: cpu });
  await S("Page.addScriptToEvaluateOnNewDocument", { source: `(${shim})(${JSON.stringify({ virtual, splash })})` });
  const errors = [];
  cdp.on("Runtime.exceptionThrown", sessionId, (p) => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  cdp.on("Runtime.consoleAPICalled", sessionId, (p) => { if (p.type === "error" || p.type === "warning") errors.push(p.args.map((a) => a.value || a.description).join(" ")); });
  const ev = async (expression) => {
    const r = await S("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const goto = async (path) => {
    const loaded = new Promise((r) => { const off = cdp.on("Page.loadEventFired", sessionId, () => { off(); r(); }); });
    await S("Page.navigate", { url: base + path });
    await loaded;
  };
  const close = async () => { const t = Date.now(); await cdp.send("Target.closeTarget", { targetId }); if (process.env.BENCH_T) console.log("close", Date.now() - t); };
  return { S, ev, goto, close, errors, dev, sessionId };
}

// the hero's sky is in (the canvas has faded up) and the type has landed
const READY = `(async () => { const B = window.__bench; const t0 = B.realNow();
  await document.fonts.ready;
  for (;;) { const c = document.getElementById("sea"); const ok = !c || (c.style.opacity === "1" && (B.pump || getComputedStyle(c).opacity === "1"));
    if (ok || B.realNow() - t0 > 8000) break; await B.realFrames(2); }
  return B.realNow() - t0; })()`;

// ------------------------------------------------------------------ real mode
const CATS = ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "toplevel", "benchmark", "cc", "gpu", "viz"];
async function traced(cdp, page, fn) {
  const events = [];
  const off = cdp.on("Tracing.dataCollected", null, (p) => { for (const e of p.value) events.push(e); });
  await page.S("Tracing.start", { transferMode: "ReportEvents", traceConfig: { recordMode: "recordAsMuchAsPossible", includedCategories: CATS } });
  const t0 = Date.now();
  await fn();
  const secs = (Date.now() - t0) / 1000;
  const done = new Promise((r) => { const o = cdp.on("Tracing.tracingComplete", null, () => { o(); r(); }); });
  await page.S("Tracing.end");
  await done; off();
  return { events, secs };
}
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r2 = (v) => Math.round(v * 100) / 100;
function analyse({ events, secs }, rendererPid) {
  const threads = new Map(), procs = new Map();
  for (const e of events) {
    if (e.ph !== "M") continue;
    if (e.name === "thread_name") threads.set(e.pid + ":" + e.tid, e.args.name);
    if (e.name === "process_name") procs.set(e.pid, e.args.name);
  }
  const sum = {}, add = (k, v) => { sum[k] = (sum[k] || 0) + v; };
  let long = 0, longMs = 0, dropped = 0, presented = 0, mainFrames = 0, draws = 0;
  const NAMES = new Set(["FireAnimationFrame", "EventDispatch", "TimerFire", "FunctionCall", "UpdateLayoutTree", "Layout", "PrePaint", "Paint", "Layerize", "Commit", "RasterTask", "GPUTask", "ImageDecodeTask", "Decode Image", "MinorGC", "MajorGC", "BeginMainThreadFrame", "IntersectionObserverController::computeIntersections"]);
  for (const e of events) {
    const tn = threads.get(e.pid + ":" + e.tid) || "", pn = procs.get(e.pid) || "";
    if (e.ph === "X" && e.dur) {
      const ms = e.dur / 1000;
      const top = e.name === "ThreadControllerImpl::RunTask" || e.name === "RunTask";
      if (top) {
        if (e.pid === rendererPid && tn === "CrRendererMain") { add("main.busy", ms); if (ms > 50) { long++; longMs += ms; } }
        else if (e.pid === rendererPid && /^Compositor$/.test(tn)) add("rendererCompositor.busy", ms);
        else if (pn === "GPU Process" && tn === "CrGpuMain") add("gpuMain.busy", ms);
        else if (pn === "GPU Process" && tn === "VizCompositorThread") add("viz.busy", ms);
      } else if (NAMES.has(e.name)) {
        if (e.name === "GPUTask" || e.name === "RasterTask" || e.name === "ImageDecodeTask" || e.name === "Decode Image") add(e.name, ms);
        else if (e.pid === rendererPid && tn === "CrRendererMain") add(e.name, ms);
      }
    }
    if (e.name === "BeginMainThreadFrame" && e.pid === rendererPid) mainFrames++;
    if (e.name === "DrawFrame" && e.pid === rendererPid) draws++;
    if (e.name === "DroppedFrame" && e.pid === rendererPid) dropped++;
    if (e.name === "PipelineReporter" && e.ph === "b") { const st = e.args?.chrome_frame_reporter?.state; if (st === "STATE_DROPPED") dropped++; else if (st) presented++; }
  }
  const per = (k) => r2((sum[k] || 0) / secs);          // ms of work per second of wall time
  return {
    secs: r2(secs), mainFramesPerSec: r2(mainFrames / secs), drawFramesPerSec: r2(draws / secs), dropped, presented, longTasks: long, longTaskMs: r2(longMs),
    msPerSec: {
      mainBusy: per("main.busy"), raf: per("FireAnimationFrame"), events: per("EventDispatch"), timers: per("TimerFire"),
      style: per("UpdateLayoutTree"), layout: per("Layout"), prepaint: per("PrePaint"), paint: per("Paint"), layerize: per("Layerize"), commit: per("Commit"),
      gc: r2(((sum.MinorGC || 0) + (sum.MajorGC || 0)) / secs), raster: per("RasterTask"), imageDecode: r2(((sum.ImageDecodeTask || 0) + (sum["Decode Image"] || 0)) / secs),
      gpuTasks: per("GPUTask"), gpuMainBusy: per("gpuMain.busy"), vizBusy: per("viz.busy"), rendererCompositor: per("rendererCompositor.busy"),
    },
  };
}
async function layers(page) {
  let last = null;
  const off = page.cdp.on("LayerTree.layerTreeDidChange", page.sessionId, (p) => { if (p.layers) last = p.layers; });
  await page.S("LayerTree.enable"); await sleep(400);
  await page.S("LayerTree.disable"); off();
  if (!last) return null;
  const d = page.dev.dpr; let area = 0, n = 0;
  for (const l of last) { if (!l.drawsContent) continue; n++; area += l.width * l.height; }
  if (process.env.BENCH_LAYERS) {                                     // which element each layer belongs to, and why it is one
    await page.S("LayerTree.enable"); await sleep(300);
    for (const l of last.filter((x) => x.drawsContent)) {
      let who = "?", why = "";
      try { const { node } = await page.S("DOM.describeNode", { backendNodeId: l.backendNodeId }); const a = node.attributes || []; const c = a.indexOf("class"); who = node.nodeName.toLowerCase() + (c >= 0 ? "." + a[c + 1].replace(/ /g, ".") : ""); } catch {}
      try { why = (await page.S("LayerTree.compositingReasons", { layerId: l.layerId })).compositingReasonIds.join(","); } catch {}
      console.log(`    ${String(l.width).padStart(5)}x${String(l.height).padEnd(6)} ${who.padEnd(34)} ${why}`);
    }
    await page.S("LayerTree.disable");
  }
  return { layers: last.length, drawing: n, drawingMP: r2(area * d * d / 1e6), estMB: r2(area * d * d * 4 / 1048576) };
}
const touchScroll = (page, dy, speed = 450, y0) => page.S("Input.synthesizeScrollGesture", { x: page.dev.w / 2, y: y0 ?? (dy > 0 ? page.dev.h * 0.78 : page.dev.h * 0.22), yDistance: -dy, speed, gestureSourceType: "touch", preventFling: true });
async function touchTo(page, target, speed = 450) {                    // drag in screen-sized pulls until the page is there
  for (let i = 0; i < 60; i++) {
    const y = await page.ev("scrollY"), max = await page.ev("document.documentElement.scrollHeight - innerHeight");
    const left = Math.min(target, max) - y;
    if (Math.abs(left) < 4) break;
    await touchScroll(page, Math.sign(left) * Math.min(Math.abs(left), page.dev.h * 0.55), speed);
  }
}
async function wheelTo(page, target, tick = 100, every = 110) {
  for (let i = 0; i < 400; i++) {
    const y = await page.ev("scrollY"), max = await page.ev("document.documentElement.scrollHeight - innerHeight");
    const left = Math.min(target, max) - y;
    if (Math.abs(left) < tick * 0.6) break;
    await page.S("Input.dispatchMouseEvent", { type: "mouseWheel", x: page.dev.w / 2, y: page.dev.h / 2, deltaX: 0, deltaY: Math.sign(left) * tick });
    await sleep(every);
  }
}
const scrollTo = (page, to, speed) => (page.dev.mobile ? touchTo(page, to, speed) : wheelTo(page, to));
const jump = async (page, y) => { await page.ev(`scrollTo(0, ${y})`); await sleep(1500); };
const vh = (page) => page.dev.h;
const BOTTOM = 1e7;
// name: [page, devices, splash?, setup (not measured), run (measured)]
const REAL = {
  "hero-idle": ["index.html", [PHONE, DESK], false, async () => { await sleep(1500); }, async () => { await sleep(6000); }],
  "sub-idle": ["join.html", [PHONE, DESK], false, async () => { await sleep(1500); }, async () => { await sleep(5000); }],
  "crossing": ["index.html", [PHONE, DESK], false, async () => { await sleep(1000); }, async (p) => {
    for (let i = 0; i < 2; i++) {
      if (p.dev.mobile) { await touchScroll(p, 400, 420); await sleep(900); await touchScroll(p, -400, 420); await sleep(900); }
      else { await wheelTo(p, 300); await sleep(1700); await wheelTo(p, 0); await sleep(1700); }
    }
  }],
  "covered": ["index.html", [PHONE, DESK], false, async (p) => { await sleep(600); await jump(p, Math.round(vh(p) * 0.9)); }, async () => { await sleep(5000); }],
  "film": ["index.html", [PHONE, DESK], false, async (p) => { await sleep(600); await jump(p, Math.round(vh(p) * 0.9)); }, async (p) => { await scrollTo(p, BOTTOM, 480); await sleep(500); }],
  "panes": ["index.html", [PHONE, DESK], false, async (p) => { await sleep(600); await p.ev(`document.querySelector(".strips").scrollIntoView({ block: "center" })`); await sleep(2500); }, async () => { await sleep(5000); }],
  "chart-idle": ["internships.html", [PHONE, DESK], false, async () => { await sleep(1500); }, async () => { await sleep(5000); }],
  "chart-scroll": ["internships.html", [PHONE, DESK], false, async () => { await sleep(1200); }, async (p) => { await scrollTo(p, BOTTOM, 480); await sleep(600); await scrollTo(p, 0, 900); await sleep(600); }],
  // at rest in the middle of a chart page, once the compass has stopped swinging: nothing on screen moves
  "chart-rest": ["internships.html", [PHONE, DESK], false, async (p) => { await sleep(600); await jump(p, 1400); await sleep(6500); }, async () => { await sleep(4000); }],
  // at rest at the foot of the home page
  "deep-rest": ["index.html", [PHONE, DESK], false, async (p) => { await sleep(600); await jump(p, BOTTOM); await sleep(2500); }, async () => { await sleep(4000); }],
  "faq-scroll": ["faq.html", [PHONE], false, async () => { await sleep(1200); }, async (p) => { await scrollTo(p, BOTTOM, 480); await sleep(600); }],
  "splash": ["index.html", [PHONE, DESK], true, null, async () => { await sleep(4500); }],
};
async function runReal(cdp, base, cpuPhone) {
  const out = [];
  for (const [name, [path, devs, splash, setup, run]] of Object.entries(REAL)) {
    if (ONLY && !ONLY.includes(name)) continue;
    for (const dev of devs) for (const cpu of dev.mobile ? [1, cpuPhone] : [1]) {
      const page = await openPage(cdp, base, dev, { splash, cpu }); page.cdp = cdp;
      let tr, readyMs = 0;
      const pidOf = async () => (await cdp.send("SystemInfo.getProcessInfo")).processInfo;
      if (setup) { await page.goto(path); readyMs = await page.ev(READY); await setup(page); }
      const cpu0 = await pidOf();
      if (setup) tr = await traced(cdp, page, async () => { await page.ev("__bench.glReset(); __bench.rec = true"); await run(page); await page.ev("__bench.rec = false"); });
      else tr = await traced(cdp, page, async () => { await page.goto(path); await page.ev("__bench.rec = true"); await run(page); await page.ev("__bench.rec = false"); });
      const snap = await page.ev(`(() => { const B = __bench; B.rec = false; const w = window.__water; return { frames: B.frames, gl: B.glRead(), water: w ? { frameMs: w.frameMs, scale: w.scale } : null, y: scrollY, heap: performance.memory ? performance.memory.usedJSHeapSize : 0, playing: [...document.querySelectorAll("video")].filter((v) => !v.paused).length, anims: [...document.querySelectorAll(".strip")].flatMap((el) => el.getAnimations({ subtree: true }).map((a) => [a.animationName, a.playState, Math.round(a.startTime), a._t0 == null ? null : Math.round(a._t0), Math.round(a.currentTime), Math.round(document.timeline.currentTime)])), mq: [matchMedia("(hover: none) and (pointer: coarse)").matches, innerWidth, devicePixelRatio] }; })()`);
      const cpu1 = await pidOf();
      if (process.env.BENCH_SHOT) writeFileSync(join(process.env.BENCH_SHOT, `${name}-${dev.name}-cpu${cpu}.png`), Buffer.from((await page.S("Page.captureScreenshot", { format: "png" })).data, "base64"));   // what the page looked like at the end
      if (process.env.BENCH_DUMP) writeFileSync(join(process.env.BENCH_DUMP, `${name}-${dev.name}-cpu${cpu}.json`), JSON.stringify(tr.events));   // the raw trace, for a closer look
      const cpuDelta = {};
      for (const p of cpu1) { const b = cpu0.find((q) => q.id === p.id); cpuDelta[p.type] = r2((cpuDelta[p.type] || 0) + (p.cpuTime - (b ? b.cpuTime : 0)) * 1000 / tr.secs); }
      // the renderer of this page: the process whose main thread ran the most animation frames
      const count = new Map();
      for (const e of tr.events) if (e.name === "FireAnimationFrame" || e.name === "UpdateLayoutTree") count.set(e.pid, (count.get(e.pid) || 0) + 1);
      const pid = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
      const a = analyse(tr, pid);
      const f = snap.frames, gl = {};
      for (const [k, s] of Object.entries(snap.gl)) gl[k] = { drawsPerSec: r2(s.draws / tr.secs), MPperSec: r2(s.px / 1e6 / tr.secs), size: Object.keys(s.sizes).join(" "), syncN: s.sync.length, syncMs: s.sync.length ? { p50: r2(pct(s.sync, 0.5)), max: r2(Math.max(...s.sync)) } : null };
      const row = {
        scenario: name, device: dev.name, cpu, readyMs: r2(readyMs),
        frames: { n: f.length, perSec: r2(f.length / tr.secs), p50: r2(pct(f, 0.5)), p95: r2(pct(f, 0.95)), p99: r2(pct(f, 0.99)), max: r2(Math.max(0, ...f)), over20: f.filter((v) => v > 20).length, over34: f.filter((v) => v > 34).length, over50: f.filter((v) => v > 50).length },
        ...a, gl, water: snap.water, anims: snap.anims, endY: snap.y, heapMB: r2(snap.heap / 1048576), videosPlaying: snap.playing, procCpuMsPerSec: cpuDelta,
        layers: await layers(page).catch(() => null), errors: page.errors.slice(0, 3),
      };
      out.push(row);
      const m = row.msPerSec;
      console.log(`${name.padEnd(13)} ${dev.name.padEnd(7)} cpu${cpu}  frames ${String(row.frames.perSec).padStart(5)}/s p95 ${String(row.frames.p95).padStart(5)} max ${String(row.frames.max).padStart(6)} >34ms ${String(row.frames.over34).padStart(3)} drop ${String(row.dropped).padStart(3)} | main ${String(m.mainBusy).padStart(6)} raf ${String(m.raf).padStart(5)} style ${String(m.style).padStart(5)} paint ${String(r2(m.prepaint + m.paint + m.layerize + m.commit)).padStart(5)} raster ${String(m.raster).padStart(5)} gpuTask ${String(m.gpuTasks).padStart(6)} | ` + Object.entries(gl).map(([k, s]) => `${k} ${s.MPperSec}MP/s@${s.drawsPerSec}/s`).join(" ") + (row.errors.length ? "  ERR " + row.errors[0] : ""));
      await page.close();
    }
  }
  return out;
}

// ------------------------------------------------------------------ virtual mode: page states
// each state: [name, page, device, theme, steps]. a step is ["y", px] (scroll there), ["s", frames]
// (run that many 60 Hz frames), ["js", code], ["vid"] (seek the clips the page wants playing)
const H = (dev, k) => Math.round(dev.h * k);
function states() {
  const L = [];
  for (const dev of [PHONE, DESK]) {
    const d = dev.name[0];
    for (const theme of ["dark", "light"]) {
      const t = theme[0];
      L.push([`${d}-${t}-home-rest`, "index.html", dev, theme, [["s", 40]]]);
      L.push([`${d}-${t}-home-rest2`, "index.html", dev, theme, [["s", 173]]]);
      L.push([`${d}-${t}-home-cross1`, "index.html", dev, theme, dev.mobile ? [["y", H(dev, 0.12)], ["s", 30]] : [["y", 120], ["s", 14]]]);
      L.push([`${d}-${t}-home-cross2`, "index.html", dev, theme, dev.mobile ? [["y", H(dev, 0.24)], ["s", 30]] : [["y", 120], ["s", 27]]]);
      L.push([`${d}-${t}-home-cross3`, "index.html", dev, theme, dev.mobile ? [["y", H(dev, 0.36)], ["s", 30]] : [["y", 120], ["s", 44]]]);
      L.push([`${d}-${t}-home-under`, "index.html", dev, theme, dev.mobile ? [["y", H(dev, 0.5)], ["s", 30]] : [["y", 120], ["s", 70]]]);
      L.push([`${d}-${t}-home-under2`, "index.html", dev, theme, [["y", 120], ["s", 60], ["y", H(dev, 0.9)], ["s", 90]]]);
      L.push([`${d}-${t}-home-back`, "index.html", dev, theme, dev.mobile ? [["y", H(dev, 0.5)], ["s", 30], ["y", H(dev, 0.2)], ["s", 20]] : [["y", 120], ["s", 70], ["y", 10], ["s", 20]]]);
      L.push([`${d}-${t}-home-back0`, "index.html", dev, theme, dev.mobile ? [["y", H(dev, 0.5)], ["s", 30], ["y", 0], ["s", 20]] : [["y", 120], ["s", 70], ["y", 0], ["s", 80]]]);
      L.push([`${d}-${t}-join-rest`, "join.html", dev, theme, [["s", 40]]]);
      L.push([`${d}-${t}-join-rise`, "join.html", dev, theme, [["y", H(dev, 0.2)], ["s", 30]]]);
      L.push([`${d}-${t}-join-rise2`, "join.html", dev, theme, [["y", H(dev, 0.45)], ["s", 30]]]);
      L.push([`${d}-${t}-join-over`, "join.html", dev, theme, [["y", H(dev, 0.62)], ["s", 30]]]);
      L.push([`${d}-${t}-join-under`, "join.html", dev, theme, [["y", H(dev, 0.8)], ["s", 30]]]);
      L.push([`${d}-${t}-chart-rest`, "internships.html", dev, theme, [["s", 41]]]);
    }
    L.push([`${d}-d-home-film1`, "index.html", dev, "dark", [["y", 120], ["s", 60], ["js", `document.querySelector(".shot").scrollIntoView({ block: "center" })`], ["s", 40], ["vid"], ["s", 2]]]);
    L.push([`${d}-d-home-film2`, "index.html", dev, "dark", [["y", 120], ["s", 60], ["js", `document.querySelectorAll(".shot")[1].scrollIntoView({ block: "start" })`], ["s", 40], ["vid"], ["s", 2]]]);
    L.push([`${d}-d-home-panes`, "index.html", dev, "dark", [["y", 120], ["s", 60], ["js", `document.querySelector(".strips").scrollIntoView({ block: "center" })`], ["s", 50], ["vid"], ["s", 2]]]);
    L.push([`${d}-l-home-panes`, "index.html", dev, "light", [["y", 120], ["s", 60], ["js", `document.querySelector(".strips").scrollIntoView({ block: "start" })`], ["s", 50], ["vid"], ["s", 2]]]);
    L.push([`${d}-d-home-relic`, "index.html", dev, "dark", [["y", 120], ["s", 60], ["js", `document.querySelector(".relic").scrollIntoView({ block: "center" })`], ["s", 40], ["vid"], ["s", 2]]]);
    L.push([`${d}-d-home-foot`, "index.html", dev, "dark", [["y", 120], ["s", 60], ["y", BOTTOM], ["s", 40]]]);
    L.push([`${d}-d-club-rest`, "club1848.html", dev, "dark", [["s", 40]]]);
    L.push([`${d}-d-404-rest`, "404.html", dev, "dark", [["s", 40]]]);
    L.push([`${d}-d-chart-mid`, "internships.html", dev, "dark", [["y", H(dev, 0.5)], ["s", 45]]]);
    L.push([`${d}-l-chart-mid`, "internships.html", dev, "light", [["y", H(dev, 1.3)], ["s", 45]]]);
    L.push([`${d}-d-chart-foot`, "internships.html", dev, "dark", [["y", BOTTOM], ["s", 90]]]);
    L.push([`${d}-d-faq-rest`, "faq.html", dev, "dark", [["s", 40]]]);
    L.push([`${d}-l-faq-mid`, "faq.html", dev, "light", [["y", H(dev, 0.7)], ["s", 45]]]);
    for (const k of [20, 55, 80, 97, 104, 112, 125]) L.push([`${d}-d-splash-${k}`, "index.html", dev, "dark", [["s", k]], true]);
  }
  return L.filter((s) => !ONLY || ONLY.some((o) => s[0].includes(o)));
}
async function reach(page, steps) {
  for (const [op, v] of steps) {
    if (op === "y") { await page.ev(`scrollTo(0, ${v})`); await page.ev(`__bench.realFrames(3)`); }
    else if (op === "js") { await page.ev(v); await page.ev(`__bench.realFrames(3)`); }
    else if (op === "s") await page.ev(`__bench.step(${v})`);
    else if (op === "vid") await page.ev(`__bench.videos()`);
  }
}
async function boot(cdp, base, st) {
  const [, path, dev, theme, , splash] = st;
  const page = await openPage(cdp, base, dev, { virtual: true, theme, splash: !!splash });
  await page.goto(path);
  if (splash) await page.ev(`(async () => { const B = __bench, t0 = B.realNow(); for (;;) { await B.pump(1); if (document.querySelectorAll(".splash-stage canvas").length >= 2 || B.realNow() - t0 > 6000) break; } await B.pump(6); })()`);
  // no page frame runs while it loads (how long that takes varies): the first one is the first step.
  // 40 frames in, the sky's fade-in is over
  else { await page.ev(READY); await page.ev(`__bench.realFrames(6)`); await page.ev(`__bench.step(40)`); }
  return page;
}
async function runShots(cdp, base, dir) {
  mkdirSync(dir, { recursive: true });
  for (const st of states()) {
    const T0 = Date.now();
    const page = await boot(cdp, base, st);
    const T1 = Date.now();
    await reach(page, st[4]);
    const T2 = Date.now();
    await page.ev(`__bench.realFrames(4)`);
    const { data } = await page.S("Page.captureScreenshot", { format: "png" });
    if (process.env.BENCH_T) console.log("boot", T1 - T0, "reach", T2 - T1, "shot", Date.now() - T2);
    writeFileSync(join(dir, st[0] + ".png"), Buffer.from(data, "base64"));
    const y = await page.ev("scrollY");
    console.log(st[0].padEnd(24), "y", String(y).padStart(5), page.errors.length ? "ERR " + page.errors[0] : "", process.env.BENCH_EVAL ? JSON.stringify(await page.ev(process.env.BENCH_EVAL)) : "");
    await page.close();
  }
}
const GPU_FRAMES = 16;
async function runGpu(cdp, base) {
  const out = [];
  for (const st of states()) {
    if (st[5] || /film|panes|relic|foot|404|club|faq|rest2|back/.test(st[0])) continue;
    const page = await boot(cdp, base, st);
    await reach(page, st[4]);
    await page.ev(`(async () => { const B = __bench; B.timeDraws = true; await B.step(6); B.glReset(); await B.step(${GPU_FRAMES}); B.timeDraws = false; })()`);
    const gl = await page.ev(`__bench.glRead()`);
    const row = { state: st[0], passes: {} };
    let total = 0, mp = 0;
    for (const [k, s] of Object.entries(gl)) for (const [p, v] of Object.entries(s.pass)) {
      const n = v.ms.length / GPU_FRAMES;               // draws of this pass per frame
      const med = pct(v.ms, 0.5);
      row.passes[k + "." + p] = { ms: r2(med), min: r2(Math.min(...v.ms)), MP: r2(v.px / 1e6), perFrame: r2(n) };
      total += med * n; mp += v.px / 1e6 * n;
    }
    row.msPerFrame = r2(total); row.MPperFrame = r2(mp);
    out.push(row);
    console.log(st[0].padEnd(22), `gpu ${String(row.msPerFrame).padStart(6)} ms/frame  ${String(row.MPperFrame).padStart(5)} MP |`, Object.entries(row.passes).map(([k, v]) => `${k} ${v.ms}ms ${v.MP}MP x${v.perFrame}`).join("  "));
    await page.close();
  }
  return out;
}

// what the water's quality ladder does with slow frames. the virtual clock makes the frames as slow as
// each case says, so this is the ladder's logic alone: [seconds, canvas px per css px] at every change
async function runLadder(cdp, base) {
  const cases = {
    "every frame 33 ms whatever is drawn (a 30 fps cap, as in Low Power Mode)": "() => 1000 / 30",
    "33 ms above 1.2x, 16.7 ms at or below (a gpu that needs two rungs)": "() => (__water.scale > 1.2 ? 1000 / 30 : 1000 / 60)",
    "33 ms above 0.6x, 16.7 ms at the bottom rung": "() => (__water.scale > 0.6 ? 1000 / 30 : 1000 / 60)",
    "16.7 ms, but 45 ms from 5 s to 9 s (a stall)": "(t) => (t > 5000 && t < 9000 ? 45 : 1000 / 60)",
    "24 ms on every rung (a busy main thread)": "() => 24",
    "16.7 ms throughout": "() => 1000 / 60",
  };
  for (const [name, fn] of Object.entries(cases)) {
    const page = await boot(cdp, base, ["ladder", "index.html", PHONE, "dark", []]);
    const out = await page.ev(`(() => { const f = ${fn}, B = __bench, w = window.__water, out = [[0, +w.scale.toFixed(2)]]; let last = w.scale;
      while (B.now() < 90000) { B.run(1, f(B.now())); if (w.scale !== last) { last = w.scale; out.push([Math.round(B.now() / 100) / 10, +last.toFixed(2)]); } } return out; })()`);
    console.log(name + "\n   " + out.map(([t, s]) => `${t}s ${s}x`).join("  ->  "));
    await page.close();
  }
}

// ------------------------------------------------------------------ png in, png out, compare
function readPng(file) {
  const b = readFileSync(file);
  let o = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString("latin1", o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8) throw new Error("png depth"); }
    if (type === "IDAT") idat.push(d);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!bpp) throw new Error("png colour type " + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), line = w * bpp, px = Buffer.alloc(w * h * 4, 255);
  let prev = Buffer.alloc(line);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (line + 1)], cur = Buffer.from(raw.subarray(y * (line + 1) + 1, (y + 1) * (line + 1)));
    for (let i = 0; i < line; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, u = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = u; else if (f === 3) p = (a + u) >> 1;
      else if (f === 4) { const q = a + u - c, pa = Math.abs(q - a), pb = Math.abs(q - u), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      cur[i] = (cur[i] + p) & 255;
    }
    for (let x = 0; x < w; x++) { px[(y * w + x) * 4] = cur[x * bpp]; px[(y * w + x) * 4 + 1] = cur[x * bpp + 1]; px[(y * w + x) * 4 + 2] = cur[x * bpp + 2]; }
    prev = cur;
  }
  return { w, h, px };
}
function writePng(file, w, h, px) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const chunk = (type, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(type, 4, "latin1"); d.copy(b, 8); b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
function compare(dirA, dirB, diffDir) {
  if (diffDir) mkdirSync(diffDir, { recursive: true });
  let worst = 0, differing = 0, n = 0, missing = 0;
  const inB = new Set(readdirSync(dirB));
  for (const f of readdirSync(dirA).filter((x) => x.endsWith(".png")).sort()) {
    if (ONLY && !ONLY.some((o) => f.includes(o))) continue;
    if (!inB.has(f)) { missing++; continue; }
    let A, Bm;
    try { A = readPng(join(dirA, f)); Bm = readPng(join(dirB, f)); } catch (e) { console.log(f.padEnd(28), "unreadable:", e.message); continue; }
    n++;
    if (A.w !== Bm.w || A.h !== Bm.h) { console.log(f.padEnd(28), "SIZE DIFFERS"); differing++; continue; }
    let max = 0, cnt = 0, cnt1 = 0, cnt3 = 0, sum = 0, y0 = A.h, y1 = -1;
    const d = diffDir ? Buffer.alloc(A.px.length) : null;
    for (let i = 0; i < A.px.length; i += 4) {
      const m = Math.max(Math.abs(A.px[i] - Bm.px[i]), Math.abs(A.px[i + 1] - Bm.px[i + 1]), Math.abs(A.px[i + 2] - Bm.px[i + 2]));
      if (m) { cnt++; sum += m; if (m > 1) cnt1++; if (m > 3) cnt3++; if (m > max) max = m; const y = (i / 4 / A.w) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (d) { const v = Math.min(255, m * 48); d[i] = v; d[i + 1] = m > 1 ? 0 : v; d[i + 2] = m > 1 ? 0 : v; d[i + 3] = 255; }
    }
    const tot = A.w * A.h;
    if (cnt) { differing++; if (d) writePng(join(diffDir, f), A.w, A.h, d); }
    worst = Math.max(worst, max);
    console.log(f.padEnd(28), cnt ? `DIFF max ${max}/255  px ${cnt} (${(cnt / tot * 100).toFixed(4)}%)  >1: ${cnt1}  >3: ${cnt3}  mean of differing ${(sum / cnt).toFixed(2)}  rows ${y0}..${y1}` : "identical");
  }
  console.log(`\n${n} states compared, ${differing} differ, largest difference ${worst}/255` + (missing ? `, ${missing} only in the first set` : ""));
}

// ------------------------------------------------------------------ main
if (cmd === "compare") { compare(resolve(argv[1]), resolve(argv[2]), opt("diff", null) && resolve(opt("diff"))); process.exit(0); }
if (!["real", "gpu", "shots", "ladder"].includes(cmd)) { console.log("usage: bench-gpu.mjs real|gpu|shots|ladder|compare (see the head of this file)"); process.exit(1); }
const srv = await serve(ROOT);
const base = `http://127.0.0.1:${srv.address().port}/`;
const cdp = await launch();
try {
  const probe = await openPage(cdp, base, DESK, {});
  await probe.goto("404.html");
  const gpu = await probe.ev(`(() => { const g = document.createElement("canvas").getContext("webgl"); const e = g.getExtension("WEBGL_debug_renderer_info"); return g.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : g.RENDERER) + " | timer query: " + !!g.getExtension("EXT_disjoint_timer_query"); })()`);
  await probe.close();
  console.log("serving", ROOT, "\nrenderer:", gpu, "\n");
  let result = null;
  if (cmd === "real") result = await runReal(cdp, base, +opt("cpu", 4));
  if (cmd === "gpu") result = await runGpu(cdp, base);
  if (cmd === "ladder") await runLadder(cdp, base);
  if (cmd === "shots") { if (!opt("out")) throw new Error("shots needs --out DIR"); await runShots(cdp, base, resolve(opt("out"))); }
  if (result && opt("out")) writeFileSync(resolve(opt("out")), JSON.stringify({ root: ROOT, renderer: gpu, date: new Date().toISOString(), result }, null, 1));
} finally { await cdp.close(); srv.close(); }
