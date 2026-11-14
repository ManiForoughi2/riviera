// the chart room (internships.html and faq.html only). main.js runs the site's own chrome, hero and
// splash; this file runs what lies on the sheet:
//   the shore    the header's sea ends on the chart along the real south bank of Tempe Town Lake.
//                a small WebGL layer draws the shallows there: the paper seen through thinning
//                water, light playing on it, the engraved depth lines bending under the surface,
//                and a wet edge that laps a few pixels up and down the bank
//   the course   the compass leaves its place by the shore, rides a pencilled line down the margin
//                with the scroll, and comes to rest on the Greek Leadership Village at the foot
//   the rest     the card's swing, the brass catching the light, the bar's lacquer

const root = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePtr = matchMedia("(hover: hover) and (pointer: fine)").matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// style writes go through here: skipped when the value hasn't moved
const setVar = (el, k, v) => {
  const c = el._sv || (el._sv = {});
  if (c[k] !== v) { c[k] = v; el.style.setProperty(k, v); }
};
const cssVar = (k) => getComputedStyle(root).getPropertyValue(k).trim();
const rgb = (hex) => { const n = parseInt(hex.replace("#", ""), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

const sheet = $(".sheet");
const compass = $(".sheet > .compass");
const cards = $$(".c-card");

// ---------- the bar: lacquer once the sheet has reached it ----------
function chrome() {
  if (sheet) root.classList.toggle("on-sheet", sheet.getBoundingClientRect().top < 66);
}

// =====================================================================================
// the shore
// =====================================================================================
const SHORE_FRAG = `
precision highp float;
uniform vec2 uRes;        // canvas, device px
uniform vec4 uPlan;       // the whole plan in canvas device px: x, y, w, h
uniform vec2 uSpan;       // lowest and highest shore, as fractions of the plan's height
uniform sampler2D uProf;  // the south bank across the plan, 0..1 inside uSpan
uniform float uTime, uDpr, uL, uLap, uHorizon;
uniform vec3 uPaper, uInk, uTint, uCaus, uWet;
uniform float uCausAmt, uWetAmt, uLine;

float bank(float x) {
  float f = texture2D(uProf, vec2(clamp((x - uPlan.x) / uPlan.z, 0.0, 1.0), 0.5)).r;
  return uPlan.y + uPlan.w * mix(uSpan.x, uSpan.y, f);
}
// light through a moving surface: three ridged waves, each bent by the one before
float caustic(vec2 p, float t) {
  float a = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    p += vec2(sin(p.y * 1.7 + t * (0.9 + fi * 0.23) + fi * 2.1), cos(p.x * 1.9 - t * (0.7 + fi * 0.19) + fi * 1.3)) * 0.55;
    a += 1.0 - abs(sin(p.x * 1.3 + p.y * 1.1 + fi * 1.7));
  }
  a /= 3.0;
  return a * a * a * a;
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 q = px / uDpr;                                         // css px
  float t = uTime;
  // the edge of the water breathes up and down the bank
  float lap = uLap * (0.62 * sin(t * 0.55 + q.x * 0.0063) + 0.38 * sin(t * 0.83 - q.x * 0.0117 + 1.7));
  float d = (bank(px.x) - px.y) / uDpr + lap;                 // css px of water over this point; negative on land

  if (d <= 0.0) {
    // dry side: the paper the water has just left is darker for a little way
    float w = (1.0 - smoothstep(0.0, uLap * 2.4 + 12.0, -d)); w = w * w * uWetAmt;
    gl_FragColor = vec4(uWet * w, w);
    return;
  }
  // the surface tilts with two slow swells; what is under it shifts by that tilt times the depth
  vec2 n = vec2(cos(q.x * 0.045 + t * 1.1) + 0.6 * cos(q.x * 0.021 - q.y * 0.05 + t * 0.7),
                0.8 * sin(q.y * 0.11 + t * 1.3) + 0.5 * sin(q.x * 0.03 + q.y * 0.07 - t * 0.9));
  float bend = min(d, 30.0) * 0.1;
  float dd = d + n.y * bend;
  // how much of the bottom still shows through this much water, and never past the horizon
  float vis = exp(-pow(d / uL, 1.2)) * smoothstep(uHorizon + 4.0, uHorizon + 54.0, q.y);
  // the bottom is the sheet itself, cooler and darker the deeper it lies
  vec3 bottom = mix(uPaper, uTint, 1.0 - exp(-d / (uL * 1.5)));
  // the chart's own depth lines, engraved along the bank and bent by the surface
  float line = 0.0;
  line += (1.0 - smoothstep(0.55, 1.45, abs(dd - 8.0))) * 0.9;
  line += (1.0 - smoothstep(0.5, 1.35, abs(dd - 19.0))) * 0.7;
  line += (1.0 - smoothstep(0.45, 1.25, abs(dd - 32.0))) * 0.52;
  line += (1.0 - smoothstep(0.4, 1.15, abs(dd - 47.0))) * 0.36;
  line += (1.0 - smoothstep(0.4, 1.1, abs(dd - 64.0))) * 0.24;
  bottom = mix(bottom, uInk, clamp(line, 0.0, 1.0) * uLine);
  // light on the bottom, strongest in the shallows
  float c = caustic(q * 0.05 + n * 0.22, t * 0.62);
  bottom += uCaus * c * uCausAmt * exp(-d / (uL * 0.85)) * smoothstep(0.0, 5.0, d);
  // the thin bright lip where the water ends
  bottom += uCaus * exp(-d * d / 1.5) * 0.1;
  gl_FragColor = vec4(bottom * vis, vis);
}`;

function startShore(canvas, band) {
  const page = $(".plan-sheet", band);
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
  if (!gl || !page) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }"));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, SHORE_FRAG));
  gl.bindAttribLocation(prog, 0, "p");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.uniform1i(U("uProf"), 0);

  let prof = null, lo = 0, hi = 1, dpr = 1, phone = false, lost = false;
  // the bank is read out of the same shape the paper is cut with (assets/chart/land.svg)
  const ready = fetch(new URL("assets/chart/land.svg", document.baseURI)).then((r) => r.text()).then((svg) => {
    const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), W = +vb[1], H = +vb[2];
    const pts = [...svg.match(/ d="([^"]+)"/)[1].matchAll(/L([\d.]+) ([\d.]+)/g)].map((m) => [+m[1], +m[2]]).slice(0, -1);
    const N = 512, ys = new Float32Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const x = W * i / (N - 1);
      while (j < pts.length - 2 && pts[j + 1][0] < x) j++;
      const [x0, y0] = pts[j], [x1, y1] = pts[j + 1];
      ys[i] = (y0 + (y1 - y0) * clamp((x - x0) / Math.max(1e-6, x1 - x0), 0, 1)) / H;
    }
    lo = Math.min(...ys); hi = Math.max(...ys);
    const bytes = new Uint8Array(N);
    for (let i = 0; i < N; i++) bytes[i] = Math.round((ys[i] - lo) / (hi - lo) * 255);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, N, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
    gl.uniform2f(U("uSpan"), lo, hi);
    prof = ys;
  });

  function look() {
    const light = root.getAttribute("data-theme") === "light";
    const paper = rgb(cssVar("--s-bg")).map((v) => v * (light ? 0.945 : 1.0));
    gl.uniform3fv(U("uPaper"), paper);
    gl.uniform3fv(U("uInk"), rgb(cssVar("--plan-ink")));
    gl.uniform3fv(U("uTint"), light ? [0.67, 0.73, 0.78] : [0.07, 0.115, 0.21]);
    gl.uniform3fv(U("uCaus"), light ? [1.0, 0.97, 0.88] : [0.6, 0.72, 0.95]);
    gl.uniform1f(U("uCausAmt"), light ? 0.62 : 0.26);
    gl.uniform3fv(U("uWet"), light ? [0.2, 0.17, 0.14] : [0.0, 0.0, 0.02]);
    gl.uniform1f(U("uWetAmt"), light ? 0.2 : 0.36);
    gl.uniform1f(U("uLine"), light ? 0.5 : 0.62);
  }
  function size() {
    if (!prof) return;
    phone = matchMedia("(max-width: 760px)").matches;
    const L = phone ? 36 : 58, lap = phone ? 2.4 : 3.6;
    const br = band.getBoundingClientRect(), pr = page.getBoundingClientRect();
    // the stretch of bank that is actually on screen decides how tall the layer has to be
    const a = clamp((-pr.left) / pr.width, 0, 1), b = clamp((br.width - pr.left) / pr.width, 0, 1);
    let mn = 1, mx = 0;
    for (let i = Math.floor(a * (prof.length - 1)); i <= Math.ceil(b * (prof.length - 1)); i++) { mn = Math.min(mn, prof[i]); mx = Math.max(mx, prof[i]); }
    const top = pr.top - br.top + mn * pr.height - L * 4.4 - lap, bottom = pr.top - br.top + mx * pr.height + lap * 3.2 + 12;
    canvas.style.top = top.toFixed(1) + "px";
    canvas.style.height = (bottom - top).toFixed(1) + "px";
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(br.width * dpr)), h = Math.max(1, Math.round((bottom - top) * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U("uRes"), w, h);
    gl.uniform1f(U("uDpr"), dpr);
    gl.uniform4f(U("uPlan"), (pr.left - br.left) * dpr, (pr.top - br.top - top) * dpr, pr.width * dpr, pr.height * dpr);
    gl.uniform1f(U("uL"), L);
    gl.uniform1f(U("uLap"), reduced ? 0 : lap);
    // the header's horizon, in this canvas's css px: the bottom never shows past it
    const hero = $(".hero"), word = $(".word:not(.word-refl)");
    const hz = hero && word ? word.getBoundingClientRect().top + parseFloat(getComputedStyle(word).fontSize) * 0.87 : -1e4;
    gl.uniform1f(U("uHorizon"), hz - br.top - top);
  }
  const tU = U("uTime");
  function draw(sec) {
    if (lost || !prof) return;
    gl.uniform1f(tU, sec);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // runs at half the display rate, and only while it is on screen
  let raf = 0, seen = false, odd = false;
  const frame = (now) => { raf = requestAnimationFrame(frame); odd = !odd; if (odd) draw(now / 1000); };
  const run = () => {
    const on = seen && !reduced && !lost && document.visibilityState === "visible";
    if (on && !raf) raf = requestAnimationFrame(frame);
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  const redo = () => { look(); size(); draw(reduced ? 4 : performance.now() / 1000); };
  ready.then(() => {
    redo();
    canvas.classList.add("is-live");
    new IntersectionObserver(([e]) => { seen = e.isIntersecting; run(); }, { rootMargin: "80px" }).observe(canvas);
    document.addEventListener("visibilitychange", run);
    let rz = 0;
    const later = () => { clearTimeout(rz); rz = setTimeout(redo, 100); };
    addEventListener("resize", later, { passive: true });
    new ResizeObserver(later).observe(band);
    document.fonts?.ready.then(later);
    new MutationObserver(redo).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  }).catch((e) => console.warn("shore:", e));
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; run(); });
  canvas.addEventListener("webglcontextrestored", () => location.reload());
  return { redo };
}
const shoreBand = $(".shore-band"), shoreCanvas = $("canvas.shore");
if (shoreBand && shoreCanvas) { try { startShore(shoreCanvas, shoreBand); } catch (e) { console.warn("shore:", e); } }

// =====================================================================================
// the compass: a damped card. scrolling drags it, a flick spins it, and it always finds north again
// =====================================================================================
let ang = 0, vel = 0, held = false;
const STIFF = 30, DAMP = 3.1;
function kick(v) { if (reduced) return; vel = clamp(vel + v, -900, 900); wake(); }
function stepSpring(dt) {
  if (held) return true;
  vel += (-STIFF * ang - DAMP * vel) * dt;
  ang += vel * dt;
  if (Math.abs(ang) < 0.03 && Math.abs(vel) < 0.4) { ang = 0; vel = 0; }
  const v = ang.toFixed(2) + "deg";
  for (const c of cards) setVar(c, "--rot", v);
  return ang !== 0 || vel !== 0;
}
if (compass && !reduced) {
  // drag the card round by hand (mouse or pen), or tap it for a spin
  const el = compass;
  let lastA = 0, lastT = 0, moved = 0;
  const angleAt = (e) => { const r = el.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return;
    held = true; moved = 0; vel = 0; lastA = angleAt(e); lastT = performance.now();
    el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  el.addEventListener("pointermove", (e) => {
    if (!held) return;
    const a = angleAt(e), now = performance.now();
    let d = a - lastA; if (d > 180) d -= 360; if (d < -180) d += 360;
    ang += d; moved += Math.abs(d);
    vel = clamp(d / Math.max(8, now - lastT) * 1000, -1100, 1100);
    lastA = a; lastT = now;
    const v = ang.toFixed(2) + "deg";
    for (const c of cards) setVar(c, "--rot", v);
  });
  const letGo = (e) => {
    if (!held) return;
    held = false;
    ang = ((ang + 180) % 360 + 360) % 360 - 180;             // nearest way back to north
    if (moved < 3) kick((e.clientX > el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 ? 1 : -1) * 520);
    wake();
  };
  el.addEventListener("pointerup", letGo);
  el.addEventListener("pointercancel", letGo);
  el.addEventListener("click", (e) => { if (e.pointerType === "touch" || !finePtr) kick((Math.random() < 0.5 ? -1 : 1) * 520); });
}
// the day / night switch gives it a nudge too
$(".theme-toggle")?.addEventListener("click", () => kick(root.getAttribute("data-theme") === "light" ? -260 : 260));

// ---------- the brass and the glass catch the light from wherever the pointer is ----------
let px = -1, py = -1, lit = null, lightDirty = false;
if (finePtr && compass) addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; lightDirty = true; wake(); }, { passive: true });
function stepLight() {
  if (px < 0 || !compass) return false;
  const r = compass.getBoundingClientRect();
  lightDirty = false;
  if (r.bottom < 0 || r.top > innerHeight) return false;
  const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2);
  const w = { a: Math.atan2(dx, -dy) * 180 / Math.PI, gx: clamp(dx / 520, -1, 1), gy: clamp(dy / 520, -1, 1) };
  const c = lit || (lit = { ...w });
  let d = w.a - c.a; d = ((d + 180) % 360 + 360) % 360 - 180;
  c.a += d * 0.14; c.gx += (w.gx - c.gx) * 0.14; c.gy += (w.gy - c.gy) * 0.14;
  setVar(compass, "--lit", c.a.toFixed(1) + "deg");
  setVar(compass, "--gx", c.gx.toFixed(3));
  setVar(compass, "--gy", c.gy.toFixed(3));
  return Math.abs(d) > 0.3 || Math.abs(w.gx - c.gx) > 0.004 || Math.abs(w.gy - c.gy) > 0.004;
}

// =====================================================================================
// the course: from the compass's place by the shore, down the margin, to the Greek Leadership Village
// =====================================================================================
let course = null;
function buildCourse() {
  if (!sheet || !compass) return;
  const marks = $$("[data-fix]", sheet).filter((el) => el.getClientRects().length);
  if (marks.length < 2) return;
  const box = sheet.getBoundingClientRect();
  const pts = marks.map((el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top }; });
  // each leg leaves and arrives heading straight down the sheet, so the line never doubles back
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], h = (b.y - a.y) * 0.5;
    d += `C${a.x.toFixed(1)} ${(a.y + h).toFixed(1)} ${b.x.toFixed(1)} ${(b.y - h).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  if (!course) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "course"); svg.setAttribute("aria-hidden", "true");
    const plan = document.createElementNS(ns, "path"); plan.setAttribute("class", "course-plan");
    const run = document.createElementNS(ns, "path"); run.setAttribute("class", "course-run");
    svg.append(plan, run);
    sheet.insertBefore(svg, compass);
    compass.classList.add("is-under-way");
    course = { svg, plan, run, at: -1 };
  }
  const c = course;
  c.svg.setAttribute("width", box.width); c.svg.setAttribute("height", box.height);
  c.svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  c.plan.setAttribute("d", d); c.run.setAttribute("d", d);
  c.total = c.plan.getTotalLength();
  c.run.style.strokeDasharray = `${c.total} ${c.total}`;
  // sample the line once; the scroll frame only looks things up
  const N = Math.max(160, Math.round(c.total / 6));
  c.xs = new Float32Array(N + 1); c.ys = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) { const p = c.plan.getPointAtLength(c.total * i / N); c.xs[i] = p.x; c.ys[i] = p.y; }
  c.N = N; c.top = box.top + scrollY; c.endY = pts[pts.length - 1].y; c.width = box.width;
  // the first leg is where it shrinks to its travelling size, the last where it opens up again to land
  c.n1 = N * (Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / Math.max(1, c.total));
  c.n3 = N * (Math.hypot(pts[pts.length - 1].x - pts[pts.length - 2].x, pts[pts.length - 1].y - pts[pts.length - 2].y) / Math.max(1, c.total));
  const cs = getComputedStyle(compass);
  c.size = compass.offsetWidth;
  c.mini = (parseFloat(cs.getPropertyValue("--mini")) || 40) / c.size;
  c.land = (parseFloat(cs.getPropertyValue("--dock")) || 56) / c.size;
  c.at = -1;
}
// where the compass should be for the current scroll: level with a line across the screen. the line
// sits at mid-screen and slides lower over the last screen of the page, so that the very end of the
// scroll is always the end of the course
function courseTarget() {
  const c = course, vh = innerHeight, s = scrollY;
  const maxS = Math.max(1, document.documentElement.scrollHeight - vh);
  const need = (c.top + c.endY - maxS) / vh + 0.03;
  const k = 0.5 + Math.max(0, need - 0.5) * smooth(maxS - vh * 1.1, maxS - 2, s);
  const y = s + vh * k - c.top;
  if (y <= c.ys[0]) return 0;
  if (y >= c.ys[c.N]) return c.N;
  let lo = 0, hi = c.N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.ys[m] <= y) lo = m; else hi = m; }
  return lo + (y - c.ys[lo]) / Math.max(0.001, c.ys[hi] - c.ys[lo]);
}
function stepCourse() {
  const c = course; if (!c) return false;
  const want = courseTarget();
  if (c.at < 0 || reduced) c.at = want; else c.at += (want - c.at) * 0.17;
  const settled = Math.abs(want - c.at) < 0.02;
  if (settled) c.at = want;
  const i = Math.min(c.N - 1, Math.floor(c.at)), f = c.at - i;
  const x = c.xs[i] + (c.xs[i + 1] - c.xs[i]) * f, y = c.ys[i] + (c.ys[i + 1] - c.ys[i]) * f;
  const out = smooth(0, c.n1 * 0.6, c.at), back = smooth(c.N - c.n3 * 0.7, c.N, c.at);
  const scale = (1 + (c.mini - 1) * out) + (c.land - c.mini) * back;
  // while it is still large it keeps its whole rim on the sheet, however near the margin the line runs
  const r = c.size * scale / 2 + 4, cx = clamp(x, r, Math.max(r, c.width - r));
  compass.style.transform = `translate3d(${(cx - c.size / 2).toFixed(1)}px, ${(y - c.size / 2).toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
  compass.classList.toggle("is-small", out > 0.5);
  setVar(c.run, "stroke-dashoffset", (c.total * (1 - c.at / c.N)).toFixed(1));
  return !settled;
}

// ---------- one rAF loop for the compass and the course; it sleeps whenever nothing is moving ----------
let raf = 0, prev = 0;
function loop(now) {
  raf = 0;
  const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0.016;
  prev = now;
  const a = stepSpring(dt);
  const b = stepCourse();
  const c = lightDirty ? stepLight() : false;
  if (a || b || c || lightDirty) raf = requestAnimationFrame(loop); else prev = 0;
}
function wake() { if (!raf) raf = requestAnimationFrame(loop); }

let lastY = scrollY;
addEventListener("scroll", () => {
  const y = scrollY, dy = y - lastY;
  lastY = y;
  chrome();
  // the sheet moving under the compass drags the card with it; the further off north, the less it gives
  if (!reduced && cards.length && !held) vel = clamp(vel - dy * 0.55 * (1 - Math.min(1, Math.abs(ang) / 75)), -900, 900);
  wake();
}, { passive: true });
let rz = 0;
const relayout = () => { buildCourse(); chrome(); wake(); };
const later = () => { clearTimeout(rz); rz = setTimeout(relayout, 120); };
addEventListener("resize", later, { passive: true });
if (sheet) {
  buildCourse();
  // the line is measured from the layout: measure again when the type lands or an answer opens
  document.fonts?.ready.then(relayout);
  addEventListener("load", relayout);
  if ("ResizeObserver" in window) new ResizeObserver(later).observe(sheet);
  // an answer opening moves everything under it: redraw the line in the same frame (toggle does not bubble)
  sheet.addEventListener("toggle", relayout, true);
}
chrome();
stepCourse();
wake();
