// Sunset slam (https://design.how/vault/sunset-slam) and Spray burst (https://design.how/vault/spray-burst),
// MIT, Arlan Marat (see LICENSE in this folder). the vault's engines bundled unchanged with esbuild; only the
// VARIABLE values differ: the rush logo's colours (teal dusk sky, red-to-sunset fan, cream), and the word FIJI RUSH
// drawn on sunset slam's own block grid. exports mountSlam(host) and mountSpray(host).
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: !0, configurable: !0, writable: !0, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key != "symbol" ? key + "" : key, value);

// slam/params.ts
var BG_TOP = "#0e2731", BG_BOTTOM = "#2a5f74";
var FACE_TOP = "#ffffff", FACE_MID = "#f4f4fb", FACE_BOTTOM = "#c9cbe4";
var RAMP = [
  [0, [16, 38, 50]],
  [0.22, [20, 50, 64]],
  [0.42, [28, 68, 86]],
  [0.58, [36, 84, 108]],
  [0.7, [47, 100, 120]],
  [0.79, [122, 84, 72]],
  [0.86, [176, 80, 58]],
  [0.885, [190, 92, 62]],
  [0.91, [204, 106, 68]],
  [0.945, [217, 119, 74]],
  [0.968, [232, 152, 96]],
  [0.985, [240, 196, 140]],
  [1, [244, 236, 219]]
], VP_DEPTH = 2.17, OUTLINE = 0.084, IGNITE_AT = 15, WW = [
  506,
  552,
  600,
  617,
  625,
  631,
  635,
  636,
  634,
  631,
  625,
  617,
  593,
  412,
  302,
  309,
  335,
  403,
  612,
  726,
  792,
  835,
  864,
  885,
  901,
  913,
  922,
  930,
  937,
  942,
  946,
  950,
  952,
  952,
  949,
  937,
  919,
  904,
  870,
  476,
  519,
  545,
  582,
  611,
  621,
  628,
  632,
  635,
  635,
  635,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637,
  637
], WCY = [
  500,
  495,
  489.5,
  487.5,
  486.5,
  486,
  485.5,
  485.5,
  485.5,
  486,
  486.5,
  487.5,
  492,
  515,
  532,
  529.5,
  527,
  507.5,
  425,
  393.5,
  378,
  367.5,
  360,
  353,
  345,
  338,
  332,
  328,
  324,
  321,
  318,
  316.5,
  315.5,
  315.5,
  316,
  320,
  325.5,
  329,
  341,
  545,
  540,
  513,
  499,
  491,
  487,
  485.5,
  485.5,
  486,
  486,
  486,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5,
  485.5
], D = [
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  17,
  29,
  63,
  160,
  215,
  246,
  267,
  281,
  290,
  298,
  304,
  309,
  312,
  315,
  318,
  320,
  321,
  322,
  322,
  321,
  314,
  305,
  291,
  259,
  47,
  44,
  50,
  56,
  60,
  63,
  65,
  66,
  66,
  66,
  66,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67,
  67
], OFF = [
  0.784,
  0.884,
  0.055,
  1.031,
  0.952,
  0.774,
  0.65,
  0.518,
  0.397,
  0.312,
  0.246,
  0.173,
  0.133,
  1e-3,
  -0.018,
  -1e-3,
  -0.024,
  0.104,
  0.104,
  0.104,
  3e-3,
  -3e-3,
  0.163,
  0.177,
  0.15,
  0.12,
  0.1,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08
], SPAN = [
  -0.025,
  0.097,
  0.635,
  -0.539,
  -0.156,
  0.117,
  0.282,
  0.446,
  0.578,
  0.654,
  0.716,
  0.791,
  0.806,
  0.934,
  0.959,
  0.925,
  0.965,
  0.799,
  0.799,
  0.804,
  0.923,
  0.952,
  0.768,
  0.598,
  0.1,
  0.06,
  0.04,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0
], TIPP = [
  0.756,
  0.977,
  0.673,
  0.37,
  0.7,
  0.773,
  0.845,
  0.878,
  0.908,
  0.932,
  0.95,
  0.977,
  1,
  0.977,
  0.977,
  0.977,
  0.977,
  0.977,
  0.977,
  0.977,
  0.967,
  0.967,
  0.977,
  0.87,
  0.4,
  0.252,
  0.252,
  0.254,
  0.252,
  0.252,
  0.252,
  0.254,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252,
  0.252
], TIP_BAND_FROM = 0.9, TIP_BAND_FULL = 0.97, REST_OFF = 0.06, REST_SPAN = 0.42, REST_TIPP = 0.62, REST_FROM = 42, REST_FULL = 52, BLOOM_LAYERS = [
  [2.6, 0.3, 0.62],
  [1.5, 0.42, 0.8],
  [0.85, 0.62, 0.9],
  [0.42, 0.8, 0.97]
], BLOOM_R = 0.95, BLOOM_ALPHA = 0.26, BLOOM_REST = 0.08, BLOOM_DROP = 0.35;
var WINDOW_SMOOTH = 2.2, OUTRO = 11, OUTRO_HOLD = 0.28, HOVER_WARM = 0.075, HOVER_SPREAD = 0.06, HOVER_BLOOM = 1.35, HOVER_IN = 0.24, HOVER_OUT = 0.48, BANDS = 0, CUTS = /* @__PURE__ */ new Set([88]), SETTLE_BRIDGE = 5, BRIDGE_AT = 38, WORD_W = 880, WORD_H = 122;
var RECTS = [
  // F
  [0, 0, 40, 122],
  [0, 0, 100, 24],
  [0, 49, 84, 24],
  // I
  [118, 0, 40, 122],
  // J
  [236, 0, 40, 122],
  [176, 98, 100, 24],
  [176, 70, 40, 52],
  // I
  [294, 0, 40, 122],
  // R
  [394, 0, 40, 122],
  [394, 0, 108, 24],
  [462, 0, 40, 73],
  [394, 49, 108, 24],
  [436, 73, 40, 25],
  [462, 98, 40, 24],
  // U
  [520, 0, 40, 122],
  [588, 0, 40, 122],
  [520, 98, 108, 24],
  // S
  [646, 0, 108, 24],
  [646, 0, 40, 73],
  [646, 49, 108, 24],
  [714, 49, 40, 73],
  [646, 98, 108, 24],
  // H
  [772, 0, 40, 122],
  [840, 0, 40, 122],
  [772, 49, 108, 24]
], V_POLY = [], CONTENT_MID = 467.5;

// slam/engine.ts
function at(table2, u) {
  let last = table2.length - 1;
  if (u <= 0) return table2[0];
  if (u >= last) return table2[last];
  let i = Math.floor(u);
  return CUTS.has(i) ? table2[i] : table2[i] + (table2[i + 1] - table2[i]) * (u - i);
}
function bridged(u) {
  if (SETTLE_BRIDGE <= 0 || u < BRIDGE_AT) return u;
  let span = 1 + SETTLE_BRIDGE;
  if (u < BRIDGE_AT + span) {
    let k = (u - BRIDGE_AT) / span;
    return BRIDGE_AT + (1 - (1 - k) ** 3);
  }
  return u - SETTLE_BRIDGE;
}
function atFrom(table2, base, u) {
  return at(table2, u - base < 0 ? 0 : u - base);
}
function window3(table2, base, u) {
  if (WINDOW_SMOOTH <= 0) return atFrom(table2, base, u);
  let r = WINDOW_SMOOTH, steps = 5, sum = 0, wsum = 0;
  for (let i = -steps; i <= steps; i++) {
    let o = i / steps * r, w = 1 - Math.abs(i) / (steps + 1);
    sum += atFrom(table2, base, u + o) * w, wsum += w;
  }
  return sum / wsum;
}
var clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v, smooth = (v) => v * v * (3 - 2 * v), lerp = (a, b, k) => a + (b - a) * k;
function outroK(u) {
  if (OUTRO <= 0) return 0;
  let start = 88;
  return u <= start ? 0 : smooth(clamp01((u - start) / OUTRO));
}
function outroGeo(u) {
  let k = outroK(u);
  return k <= OUTRO_HOLD ? 0 : smooth((k - OUTRO_HOLD) / (1 - OUTRO_HOLD));
}
var SunsetSlam = class {
  constructor(canvas) {
    this.canvas = canvas;
    __publicField(this, "ctx");
    __publicField(this, "raf", 0);
    __publicField(this, "t0", 0);
    __publicField(this, "running", !1);
    __publicField(this, "dpr", 1);
    __publicField(this, "word");
    __publicField(this, "lut", []);
    __publicField(this, "lastKey", "");
    __publicField(this, "hover", 0);
    __publicField(this, "hoverTo", 0);
    __publicField(this, "lastNow", 0);
    __publicField(this, "ok");
    this.ctx = canvas.getContext("2d"), this.ok = !!this.ctx, this.word = this.buildWord(), this.buildLut(), this.ok && this.resize();
  }
  buildWord() {
    let p = new Path2D();
    if (V_POLY.length > 1) {
      p.moveTo(V_POLY[0][0], V_POLY[0][1]);
      for (let i = 1; i < V_POLY.length; i++) p.lineTo(V_POLY[i][0], V_POLY[i][1]);
      p.closePath();
    }
    for (let [x, y, w, h] of RECTS) p.rect(x, y, w, h);
    return p;
  }
  buildLut() {
    let raw = [];
    for (let i = 0; i < 256; i++) {
      let u = i / 255, k = RAMP.length - 2;
      for (let j = 0; j < RAMP.length - 1; j++)
        if (u <= RAMP[j + 1][0]) {
          k = j;
          break;
        }
      let [p0, c0] = RAMP[k], [p1, c1] = RAMP[k + 1], t = p1 > p0 ? (u - p0) / (p1 - p0) : 0, e = t * t * (3 - 2 * t);
      raw.push([
        c0[0] + (c1[0] - c0[0]) * e,
        c0[1] + (c1[1] - c0[1]) * e,
        c0[2] + (c1[2] - c0[2]) * e
      ]);
    }
    let R = 7, src = raw;
    for (let pass = 0; pass < 2; pass++) {
      let out = [];
      for (let i = 0; i < 256; i++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let o = -R; o <= R; o++) {
          let j = Math.max(0, Math.min(255, i + o));
          r += src[j][0], g += src[j][1], b += src[j][2], n++;
        }
        out.push([r / n, g / n, b / n]);
      }
      src = out;
    }
    for (let i = 0; i < 256; i++)
      this.lut[i] = `rgb(${Math.round(src[i][0])},${Math.round(src[i][1])},${Math.round(src[i][2])})`;
  }
  ramp(u) {
    let q = BANDS > 0 ? Math.round(u * BANDS) / BANDS : u, i = Math.max(0, Math.min(255, Math.round(q * 255)));
    return this.lut[i];
  }
  rampRGB(u) {
    let m = this.lut[Math.max(0, Math.min(255, Math.round(u * 255)))].match(/\d+/g);
    return [+m[0], +m[1], +m[2]];
  }
  resize() {
    let c = this.canvas, r = c.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2), c.width = Math.round(r.width * this.dpr), c.height = Math.round(r.height * this.dpr), this.lastKey = "", this.running || this.renderStill();
  }
  start() {
    if (this.running || !this.ok) return;
    this.running = !0, this.t0 = performance.now(), this.lastKey = "", this.lastNow = performance.now();
    let tick = (now) => {
      if (!this.running) return;
      let dt = Math.min(Math.max((now - this.lastNow) / 1e3, 1 / 240), 0.1);
      this.lastNow = now;
      let rate = this.hoverTo > this.hover ? HOVER_IN : HOVER_OUT;
      this.hover += (this.hoverTo - this.hover) * (1 - Math.exp(-dt / rate));
      let span = 89 + SETTLE_BRIDGE + OUTRO;
      this.draw(bridged((now - this.t0) / 1e3 * 25 % span)), this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  setHover(on) {
    this.hoverTo = on ? 1 : 0;
  }
  stop() {
    this.running = !1, this.raf && cancelAnimationFrame(this.raf), this.raf = 0;
  }
  renderStill() {
    this.ok && this.draw(60);
  }
  destroy() {
    this.stop(), this.ctx = null;
  }
  draw(u) {
    let ctx = this.ctx;
    if (!ctx) return;
    let ok = outroK(u), og = outroGeo(u), ww = lerp(at(WW, u), WW[0], og), wcy = lerp(at(WCY, u), WCY[0], og), depth = at(D, u) * (1 - ok), off = window3(OFF, IGNITE_AT, u), span = window3(SPAN, IGNITE_AT, u), tipp = window3(TIPP, IGNITE_AT, u), ignited = u >= IGNITE_AT;
    if (u > REST_FROM) {
      let k = smooth(clamp01((u - REST_FROM) / (REST_FULL - REST_FROM)));
      off += (REST_OFF - off) * k, span += (REST_SPAN - span) * k, tipp += (REST_TIPP - tipp) * k;
    }
    let hv = this.hover;
    hv > 1e-3 && (off += HOVER_WARM * hv, span += HOVER_SPREAD * hv * Math.sign(span || 1), tipp += HOVER_WARM * hv);
    let key = `${ww.toFixed(1)}|${wcy.toFixed(1)}|${depth.toFixed(1)}|${off.toFixed(4)}|${span.toFixed(4)}|${tipp.toFixed(4)}|${ignited}|${hv.toFixed(3)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    let { dpr } = this, W = this.canvas.width / dpr, H = this.canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, BG_TOP), sky.addColorStop(0.78, BG_BOTTOM), sky.addColorStop(1, BG_TOP), ctx.fillStyle = sky, ctx.fillRect(0, 0, W, H);
    let sc = W / 1500;
    ctx.translate(0, H / 2 - CONTENT_MID * sc), ctx.scale(sc, sc);
    let ws = ww / WORD_W, wh = WORD_H * ws, wx = 1500 / 2 - ww / 2, wy = wcy - wh / 2, baseline = wy + wh, vpDist = VP_DEPTH * wh, strokeW = 2 * OUTLINE * WORD_H, copy = (f2) => {
      let q = 1 - f2;
      ctx.save(), ctx.translate(1500 / 2, baseline + vpDist), ctx.scale(q, q), ctx.translate(-1500 / 2, -(baseline + vpDist)), ctx.translate(wx, wy), ctx.scale(ws, ws);
    };
    {
      let k = clamp01(depth / 322), a = (BLOOM_REST + (BLOOM_ALPHA - BLOOM_REST) * smooth(k)) * (1 + (HOVER_BLOOM - 1) * hv) * (1 - ok), cx = 1500 / 2, cy = baseline + BLOOM_DROP * wh, base = BLOOM_R * ww * (0.75 + 0.45 * k);
      for (let [rMul, aMul, pos] of BLOOM_LAYERS) {
        let r = base * rMul, la = a * aMul;
        if (la < 4e-3) continue;
        let [br, bg, bb] = this.rampRGB(pos), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(${br},${bg},${bb},${la.toFixed(3)})`), g.addColorStop(0.45, `rgba(${br},${bg},${bb},${(la * 0.35).toFixed(3)})`), g.addColorStop(1, `rgba(${br},${bg},${bb},0)`), ctx.fillStyle = g, ctx.fillRect(-1500, -1500, 1500 * 3, 1500 * 3);
      }
    }
    if (ignited && depth > 1) {
      let n = Math.min(260, Math.max(12, Math.ceil(depth)));
      ctx.lineJoin = "miter", ctx.lineWidth = strokeW;
      for (let i = n; i >= 0; i--) {
        let dd = depth * i / n;
        copy(dd / vpDist);
        let df = dd / depth, p = off + span * df;
        if (df > TIP_BAND_FROM) {
          let t = Math.min(1, (df - TIP_BAND_FROM) / (TIP_BAND_FULL - TIP_BAND_FROM));
          p += (tipp - p) * t;
        }
        let col = this.ramp(p);
        ctx.fillStyle = col, ctx.strokeStyle = col, ctx.fill(this.word), ctx.stroke(this.word), ctx.restore();
      }
    }
    copy(0);
    let faceG = ctx.createLinearGradient(0, 0, 0, WORD_H);
    if (faceG.addColorStop(0, FACE_MID), faceG.addColorStop(0.18, FACE_TOP), faceG.addColorStop(1, FACE_BOTTOM), ctx.fillStyle = faceG, ctx.fill(this.word), ignited) {
      let [rr, rg, rb] = this.rampRGB(Math.min(1, off + span * 0.55)), grad = ctx.createLinearGradient(0, WORD_H * (1 - 0.45), 0, WORD_H), rimA = 0.3 * (1 - ok);
      grad.addColorStop(0, `rgba(${rr},${rg},${rb},0)`), grad.addColorStop(1, `rgba(${rr},${rg},${rb},${rimA.toFixed(3)})`), ctx.fillStyle = grad, ctx.fill(this.word);
    }
    ctx.restore(), ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
};

// spray/runtime/dispose.ts
function watchContextLoss(canvas, onLost) {
  let lost = () => onLost();
  return canvas.addEventListener("webglcontextlost", lost), () => canvas.removeEventListener("webglcontextlost", lost);
}
function disposeGl(gl, objects = {}) {
  if (gl) {
    for (let p of objects.programs ?? []) p && gl.deleteProgram(p);
    for (let s of objects.shaders ?? []) s && gl.deleteShader(s);
    for (let b of objects.buffers ?? []) b && gl.deleteBuffer(b);
    for (let t of objects.textures ?? []) t && gl.deleteTexture(t);
    for (let f2 of objects.framebuffers ?? []) f2 && gl.deleteFramebuffer(f2);
    for (let r of objects.renderbuffers ?? []) r && gl.deleteRenderbuffer(r);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

// spray/params.ts
var ORDER = [1, 4, 0, 5, 2, 3], TRANSIT = [
  0.022,
  0.055,
  0.1,
  0.187,
  0.679,
  0.882,
  0.937,
  0.97,
  0.987,
  1
], TRANSIT_OUT = 20, TRANSIT_SPLIT = 24 - TRANSIT_OUT, STATION = 0.553, POSES = [
  { u: -1, v: -1, corner: !0 },
  { u: 1, v: -1, corner: !0 },
  { u: 1, v: 1, corner: !0 },
  { u: -1, v: 1, corner: !0 },
  { u: 0, v: 0, corner: !1 }
], FAN = [-100.4, -67.6, -28.4, 0, 28.4, 67.6, 100.4], MARGIN = 0.108, CORE_TROUGH = 0.388, CORE_A = 0.167, CORE_B = 0.252, CORE_CAP = 0.62, CORE_TIP_MIN = 1.15, CORE_TIP_MAX = 1.6, BAND = 0.143, CORE_FALLOFF = 1.6, RAY_W0 = 0.388, RAY_WTIP = 0.026, RAY_TAPER = 1.05, TIP_GROW = 0.051, SPRAY_INK = 0.028, SPRAY_PLATE = 0.033, SPRAY_SCALE = [
  1,
  0.72,
  1.15,
  1.3,
  0.85,
  1.5
], GRAIN_SCALE = [1, 0.9, 1.35, 1.1, 0.8, 0.6], SPATTER = 0.02, SPATTER_DECAY = 0.056, WOBBLE_INK = 0.0128, WOBBLE_PLATE = 0.0153, WOBBLE_SCALE = 0.0714, GRAIN_PAPER = 1, GRAIN_PLATE = 4, GRAIN_INK = 1, PALETTES = [
  { paper: [244, 236, 219], plate: [176, 80, 58], ink: [35, 35, 35] },
  { paper: [242, 234, 216], plate: [47, 100, 120], ink: [244, 236, 219] },
  { paper: [244, 235, 218], plate: [35, 35, 35], ink: [217, 119, 74] },
  { paper: [241, 233, 215], plate: [217, 119, 74], ink: [36, 84, 108] },
  { paper: [243, 235, 217], plate: [233, 201, 143], ink: [176, 80, 58] },
  { paper: [242, 234, 216], plate: [36, 84, 108], ink: [233, 201, 143] }
], CARD_BG = PALETTES[0].paper, SNAP = [0, 0.012, 0.03, 0.055, 0.09, 0.42, 0.78, 0.9, 0.955, 0.985, 1], GLIDE = [0, 0.03, 0.08, 0.17, 0.34, 0.62, 0.82, 0.92, 0.97, 1];
function ease(table2, u) {
  let n = table2.length - 1, x = Math.min(Math.max(u, 0), 1) * n, i = Math.min(Math.floor(x), n - 1);
  return table2[i] + (table2[i + 1] - table2[i]) * (x - i);
}
var RING_BEATS = 2, BAR_BEATS = 2, DISC_BEATS = 1, WEDGE_BEATS = 3, DOT_BEATS = 2, RING_R = [0.3, 0.47, 0.64, 0.82, 1.02], RING_W = [0.055, 0.038, 0.062, 0.03, 0.045], RING_GAP_AT = [0, 0.31, 0.62, 0.14, 0.79], RING_GAP_W = [0.12, 0.2, 0.09, 0.16, 0.13], RING_SPIN = [0.35, -0.52, 0.81, -0.29, 0.63], RING_OFF = [0, 0], BAR_Y = [-0.78, -0.44, -0.12, 0.19, 0.5, 0.84], BAR_H = [0.028, 0.062, 0.021, 0.045, 0.034, 0.055], BAR_L = [0.52, 0.78, 0.34, 0.95, 0.61, 0.44], BAR_V = [0.9, -1.4, 1.9, -0.7, 1.2, -1.6], BAR_OFF = [0, 0.17, 0.34, 0.5, 0.67, 0.83], DISC_R = [0.42, 0.16, 0.11, 0.2, 0.09, 0.14, 0.07], DISC_OX = [0.05, 0.62, 0.78, 0.52, 0.88, 0.7, 0.95], DISC_OY = [0.04, 0.4, 0.62, 0.72, 0.3, 0.55, 0.48], DISC_SPIN = [0.18, 0.62, -0.44, 0.35, -0.71, 0.51, -0.28], DISC_PHASE = [0, 0.12, 0.38, 0.55, 0.71, 0.84, 0.93];
var WEDGE_W = [0.052, 0.031, 0.068, 0.024, 0.045, 0.06, 0.037], WEDGE_AT = [0, 0.13, 0.27, 0.41, 0.56, 0.7, 0.86], WEDGE_SPIN = 0.22, WEDGE_R0 = 0.22, WEDGE_R1 = 1.25, DOT_INSET = 0.05, DOT_STEP = 0.26, DOT_MAX = 0.44, DOT_MIN = 0.06, DOT_FREQ = 1.35, DOT_ANGLE = 0.08, DOT_SPEED = 1, CURSOR_R = 1.6, CURSOR_SPRAY = 0.35, CURSOR_GRAIN = 0.5, CURSOR_GESTURE = [
  "reach",
  "face",
  "drag",
  "gather",
  "aim",
  "swell"
], CURSOR_AMOUNT = [0.55, 0.7, 0.45, 0.5, 0.6, 0.8], CURSOR_LOCAL_R = 1.1, CURSOR_EASE = 0.28;

// spray/engine.ts
var DPR_CAP = 1.5, TAU = Math.PI * 2, DEG = Math.PI / 180, STILL_FRAME = ORDER.indexOf(0) * 72 + 6, STAR_TOUR = [4, 0, 2], f = (n) => Number.isInteger(n) ? `${n}.0` : `${n}`, table = (name, vals) => {
  let chain = vals.slice(0, -1).map((v, i) => `i == ${i} ? ${f(v)} : `).join("");
  return `float ${name}(int i) { return ${chain}${f(vals[vals.length - 1])}; }`;
}, VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`, FRAG = `
precision highp float;

uniform vec2  uRes;    // canvas size in device px
uniform vec2  uC;      // star centre, top-left origin
uniform vec4  uRect;   // plate x0,y0,x1,y1
uniform float uUnit;   // radial unit: half the plate's height
uniform float uSeed;   // per-frame, so the grain and the wobble both boil
uniform int   uScene;  // which drawing, 0..3
uniform vec3  uPaper;  // the three inks, in the order they are laid down
uniform vec3  uPlate;
uniform vec3  uInk;
uniform vec3  uGrain;  // grain step size for paper, plate, ink
uniform float uSprayI; // this scene's ink spray width, device px
uniform vec3  uCursor; // pointer x, y in device px, and its strength 0..1

// The two general-purpose parameter arrays. Every scene packs its own per-frame
// numbers into these rather than adding uniforms of its own, so one program
// serves all six drawings:
//
//   scene 0 (star)   uA = ray bearings (rad)     uT = ray tip radii (px)
//   scene 1 (rings)  uA = gap centre (turns)     uT = unused
//   scene 2 (bars)   uA = bar centre x (px)      uT = unused
//   scene 3 (discs)  uA = disc centre x (px)     uT = disc centre y (px)
uniform float uA[8];
uniform float uT[8];

const float TAU = 6.28318530718;

// The scene tables, baked in as lookup functions.
//
// GLSL ES 1.0 has no array initialisers, and indexing a const array by a loop
// variable is only guaranteed for constant expressions, so a plain T[i] is
// not portable here. A chain of ternaries is: the compiler folds it, the index
// is never dynamic, and it costs nothing at runtime. Uniform arrays would also
// work and would be worse \u2014 these never change, and uploading them every frame
// to say the same thing is pure ceremony.
${table("RING_R", RING_R)}
${table("RING_W", RING_W)}
${table("RING_GAP_W", RING_GAP_W)}
${table("BAR_Y", BAR_Y)}
${table("BAR_H", BAR_H)}
${table("BAR_L", BAR_L)}
${table("DISC_R", DISC_R)}
${table("WEDGE_W", WEDGE_W)}

// One hash for everything. Each consumer offsets uSeed so the plate dither,
// the ink dither, the two wobbles and the three grains are independent; using
// one stream for all of them correlates the plate and ink edges and produces
// visible seams where they cross.
// Each input is scaled by an irrational and folded to a fraction, then two rounds
// multiply every lane by a neighbouring lane and fold again, so a one-pixel step
// lands anywhere in 0..1. Every product stays under about 820, which keeps 14 bits
// below the point in a 32-bit float at any pixel and seed this card reaches.
float hash(vec2 p, float s) {
  vec3 q = fract(vec3(p, s) * vec3(0.7548777, 0.5698403, 0.6180340));
  q = fract(q * (q.yzx + 0.4310) * 571.3);
  q = fract(q * (q.zxy + 0.1897) * 433.7);
  return fract(q.x + q.y + q.z);
}

float vnoise(vec2 p, float s) {
  vec2 i = floor(p), fr = fract(p);
  fr = fr * fr * (3.0 - 2.0 * fr);
  return mix(mix(hash(i, s),                 hash(i + vec2(1.0, 0.0), s), fr.x),
             mix(hash(i + vec2(0.0, 1.0), s), hash(i + vec2(1.0, 1.0), s), fr.x), fr.y);
}

float sdBox(vec2 p, vec2 c, vec2 h) {
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float angDist(float a, float b) {
  float d = mod(abs(a - b), TAU);
  return min(d, TAU - d);
}

/** Core radius at a ray, growing with that ray's length and then capped. */
float corePeak(float tip) {
  return min(uUnit * (${f(CORE_A)} + ${f(CORE_B)} * clamp(tip / uUnit, ${f(CORE_TIP_MIN)}, ${f(CORE_TIP_MAX)})),
             ${f(CORE_CAP)} * uUnit);
}

/** A tapered spike, as a box SDF whose half-width varies along its length. The
 *  taper is shallow (about 11deg off the axis), so treating the edge as
 *  locally parallel costs under 2% in the distance and nothing visible once
 *  the spray is applied on top. */
float rayDist(vec2 q, float a, float tip, float base) {
  vec2 dir = vec2(cos(a), sin(a));
  float along = dot(q, dir);
  float perp = abs(q.x * dir.y - q.y * dir.x);
  float t = clamp((along - base) / max(1.0, tip - base), 0.0, 1.0);
  float w0 = ${f(RAY_W0)} * uUnit, wt = ${f(RAY_WTIP)} * uUnit;
  float hw = 0.5 * (wt + (w0 - wt) * pow(1.0 - t, ${f(RAY_TAPER)}));
  vec2 d = vec2(max(base - along, along - tip), perp - hw);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

/** Scene 1. Concentric annuli, one gap each, the whole set pushed off centre.
 *
 *  Distance to an annulus is exact and cheap: abs(length(q) - r) - w. The gap
 *  is cut by taking a max against a wedge rather than by clipping the arc, so
 *  the two cut ends carry a real signed distance and spray exactly like every
 *  other edge in the piece. Clipping would give them a hard vector end, which
 *  is the one thing that would announce this scene as different machinery. */
float ringsDist(vec2 p) {
  vec2 q = p - uC;
  float th = atan(q.y, q.x) / TAU;
  float r = length(q);
  float d = 1e5;
  for (int i = 0; i < 5; i++) {
    float ri = RING_R(i) * uUnit;
    float wi = RING_W(i) * uUnit;
    float ring = abs(r - ri) - wi;
    // How far into this ring's gap the bearing sits, in turns, wrapped.
    float g = th - uA[i];
    g = g - floor(g + 0.5);
    // Inside the wedge the distance is pushed out by the arc-length shortfall,
    // which is what makes the ends round off the way a stroke end does.
    float halfGap = RING_GAP_W(i) * 0.5;
    float cut = (halfGap - abs(g)) * TAU * ri;
    d = min(d, max(ring, cut));
  }
  return d;
}

/** Scene 2. Horizontal bars of unequal thickness sliding at unequal speeds.
 *  The one drawing in the set made of straight edges, which is most of why the
 *  other three read as curved. */
float barsDist(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < 6; i++) {
    vec2 c = vec2(uA[i], uC.y + BAR_Y(i) * uUnit);
    d = min(d, sdBox(p, c, vec2(BAR_L(i) * uUnit, BAR_H(i) * uUnit)));
  }
  return d;
}

/** Scene 3. One big disc and six satellites on slow ellipses, min-combined so
 *  that where two overlap they FUSE into one compound blob rather than crossing
 *  as outlines. That fusing is the whole scene: min on signed distance is a
 *  union, and a union of circles is a shape you cannot get by drawing circles. */
float discsDist(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < 7; i++) {
    d = min(d, length(p - vec2(uA[i], uT[i])) - DISC_R(i) * uUnit);
  }
  return d;
}

/** Scene 4. A pinwheel of hard-edged sectors with a hole at the middle.
 *  Distinct from the starburst on purpose: those are tapered spikes growing out
 *  of a fat core, these are wedges of constant angular width cut out of a ring.
 *  One reads as a drawn object, the other as a stencil. */
float wedgeDist(vec2 p) {
  vec2 q = p - uC;
  float r = max(length(q), 1e-4);
  float th = atan(q.y, q.x) / TAU;
  float rad = max(${f(WEDGE_R0)} * uUnit - r, r - ${f(WEDGE_R1)} * uUnit);
  float d = 1e5;
  for (int i = 0; i < 7; i++) {
    float g = th - uA[i];
    g = g - floor(g + 0.5);
    // Angular half-width converted to an arc length at this radius, so a wedge
    // has parallel sides in the print rather than sides that spray wider the
    // further out they go.
    float ang = (abs(g) - WEDGE_W(i)) * TAU * r;
    d = min(d, max(ang, rad));
  }
  return d;
}

/** Scene 5. A halftone: a lattice of dots swelling and shrinking under a wave
 *  crossing the plate. The radius is capped below half a cell, which is what
 *  lets the whole infinite field be evaluated from one mod() instead of a
 *  search over the neighbouring cells. */
float dotsDist(vec2 p) {
  float step = ${f(DOT_STEP)} * uUnit;
  vec2 q = p - uC;
  vec2 cell = floor(q / step);
  vec2 local = q - (cell + 0.5) * step;
  // uA[0] carries the wave's travelled phase; uA[1] and uA[2] its direction.
  float phase = dot(cell + 0.5, vec2(uA[1], uA[2])) + uA[0];
  float wave = 0.5 + 0.5 * sin(phase * TAU);
  float rr = mix(${f(DOT_MIN)}, ${f(DOT_MAX)}, wave);

  // SWELL. Dots fatten under the pointer, as if the sheet took more ink there.
  // Measured from the CELL CENTRE, not the fragment: per-fragment it would be a
  // gradient across each dot and every one near the pointer would come out a
  // teardrop. Per cell, each dot stays a circle and only its radius changes,
  // which is what a halftone actually does under pressure.
  vec2 cc = uC + (cell + 0.5) * step;
  float swell = uA[3] * (1.0 - smoothstep(0.0, ${f(CURSOR_LOCAL_R)} * uUnit,
                                          distance(cc, uCursor.xy)));
  // Clamped below half a cell, or a swollen dot reaches into its neighbour's
  // cell and the single-mod() shortcut this whole field relies on breaks.
  rr = min(rr * (1.0 + swell), 0.48) * step;

  float dots = length(local) - rr;

  // Clipped to the plate, which no other scene is. A halftone is a fill, not an
  // object, and a fill that reaches the card edges swallows the plate and the
  // paper margin with it. max() against the plate's own inset distance keeps the
  // boundary a real signed distance, so it sprays like every other edge instead
  // of ending on a hard line.
  vec2 rc = vec2((uRect.x + uRect.z) * 0.5, (uRect.y + uRect.w) * 0.5);
  vec2 rh = vec2((uRect.z - uRect.x) * 0.5, (uRect.w - uRect.y) * 0.5)
          - ${f(DOT_INSET)} * uUnit;
  return max(dots, sdBox(p, rc, rh));
}

float starDist(vec2 p) {
  vec2 q = p - uC;
  float r = length(q);
  float th = atan(q.y, q.x);

  // The two nearest rays, which bracket this bearing. The core's radius is
  // read off them: it peaks on a ray and dips to a constant trough midway.
  float d1 = 99.0, d2 = 99.0, t1 = 0.0;
  for (int i = 0; i < 8; i++) {
    float dd = angDist(th, uA[i]);
    if (dd < d1) { d2 = d1; d1 = dd; t1 = uT[i]; }
    else if (dd < d2) { d2 = dd; }
  }
  float bump = pow(1.0 - clamp(d1 / max(d2, 1e-4), 0.0, 1.0), ${f(CORE_FALLOFF)});
  float coreR = mix(${f(CORE_TROUGH)} * uUnit, corePeak(t1), bump);

  // The band joining the spike bases into a ring, then the spikes themselves.
  float d = max(coreR - r, r - (coreR + ${f(BAND)} * uUnit));
  for (int i = 0; i < 8; i++) {
    d = min(d, rayDist(q, uA[i], uT[i], corePeak(uT[i])));
  }
  return d;
}

/** Coverage from signed distance. The logistic is a cheap stand-in for the
 *  measured normal CDF (they agree to about 1% over the range that matters),
 *  plus the sparse far tail that carries the overspray. */
float coverage(float d, float sigma) {
  float c = 1.0 / (1.0 + exp(clamp(d * 1.702 / sigma, -20.0, 20.0)));
  if (d > 0.0) {
    c = max(c, ${f(SPATTER)} * exp(-d / (${f(SPATTER_DECAY)} * uUnit)));
  }
  return c;
}

/** 0, 1 or 2 steps, weighted toward 0 to match the measured 62/25/12 split.
 *  Squaring the hash does that in one operation; a uniform pick reads as a
 *  flat 33% noise and grays the ink down too far. */
float grainStep(vec2 p, float s) {
  float h = hash(p, s);
  return floor(h * h * 3.0);
}

/** Whichever drawing is being printed this frame. A uniform branch, so it is
 *  the same path for every fragment in the draw and costs nothing. */
float sceneDist(vec2 p) {
  if (uScene == 0) return starDist(p);
  if (uScene == 1) return ringsDist(p);
  if (uScene == 2) return barsDist(p);
  if (uScene == 3) return discsDist(p);
  if (uScene == 4) return wedgeDist(p);
  return dotsDist(p);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float wob = ${f(WOBBLE_SCALE)} * uUnit;

  // The pointer's reach at this pixel. Applied to the PRINT, identically in
  // every drawing: near the cursor the ink sprays wider and the interiors grain
  // harder, as if that part of the sheet took more ink. This half needs no
  // per-scene code, which is what makes it scale \u2014 a drawing added later gets
  // it without being told.
  float near = uCursor.z * (1.0 - smoothstep(0.0, ${f(CURSOR_R)} * uUnit,
                                             distance(p, uCursor.xy)));

  vec3 col = uPaper - grainStep(p, uSeed + 71.3) * uGrain.x;

  vec2 rc = vec2((uRect.x + uRect.z) * 0.5, (uRect.y + uRect.w) * 0.5);
  vec2 rh = vec2((uRect.z - uRect.x) * 0.5, (uRect.w - uRect.y) * 0.5);
  float dp = sdBox(p, rc, rh)
           + (vnoise(p / wob, uSeed + 11.0) - 0.5) * 2.0 * ${f(WOBBLE_PLATE)} * uUnit;
  if (hash(p, uSeed + 3.7) < coverage(dp, ${f(SPRAY_PLATE)} * uUnit)) {
    col = uPlate - grainStep(p, uSeed + 91.1) * uGrain.y * (1.0 + ${f(CURSOR_GRAIN)} * near);
  }

  float db = sceneDist(p)
           + (vnoise(p / wob, uSeed + 29.0) - 0.5) * 2.0 * ${f(WOBBLE_INK)} * uUnit;
  if (hash(p, uSeed + 5.1) < coverage(db, uSprayI * (1.0 + ${f(CURSOR_SPRAY)} * near))) {
    col = uInk - grainStep(p, uSeed + 53.9) * uGrain.z * (1.0 + ${f(CURSOR_GRAIN)} * near);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}
function turnDelta(a, b) {
  return b - a - Math.round(b - a);
}
function poseCentre(pose, rect) {
  let hw = (rect.x1 - rect.x0) * 0.5, hh = (rect.y1 - rect.y0) * 0.5;
  return [
    rect.x0 + hw + pose.u * STATION * hw,
    rect.y0 + hh + pose.v * STATION * hh
  ];
}
function poseRays(pose, cx, cy, rect) {
  let norm = (a) => (a % TAU + TAU) % TAU, out;
  if (pose.corner) {
    let fx = pose.u > 0 ? rect.x0 : rect.x1, fy = pose.v > 0 ? rect.y0 : rect.y1, far = Math.atan2(fy - cy, fx - cx);
    out = [...FAN.map((o) => far + o * DEG), far + Math.PI];
  } else {
    let corners = [
      [rect.x1, rect.y1],
      [rect.x0, rect.y1],
      [rect.x0, rect.y0],
      [rect.x1, rect.y0]
    ];
    out = [
      0,
      Math.PI / 2,
      Math.PI,
      -Math.PI / 2,
      ...corners.map(([x, y]) => Math.atan2(y - cy, x - cx))
    ];
  }
  return out.map(norm).sort((a, b) => a - b);
}
function tipRadius(cx, cy, a, r) {
  let dx = Math.cos(a), dy = Math.sin(a), t = 1 / 0;
  return dx > 1e-6 ? t = Math.min(t, (r.x1 - cx) / dx) : dx < -1e-6 && (t = Math.min(t, (r.x0 - cx) / dx)), dy > 1e-6 ? t = Math.min(t, (r.y1 - cy) / dy) : dy < -1e-6 && (t = Math.min(t, (r.y0 - cy) / dy)), Number.isFinite(t) ? t : 0;
}
var SprayBurst = class {
  constructor(canvas) {
    __publicField(this, "ok", !1);
    __publicField(this, "canvas");
    __publicField(this, "gl", null);
    __publicField(this, "prog", null);
    __publicField(this, "quad", null);
    __publicField(this, "u", {});
    __publicField(this, "raf", 0);
    __publicField(this, "running", !1);
    __publicField(this, "start0", 0);
    __publicField(this, "lastFrame", -1);
    __publicField(this, "rect", { x0: 0, y0: 0, x1: 0, y1: 0 });
    __publicField(this, "unit", 1);
    __publicField(this, "angles", new Float32Array(8));
    __publicField(this, "tips", new Float32Array(8));
    __publicField(this, "px", 0);
    __publicField(this, "py", 0);
    __publicField(this, "over", !1);
    __publicField(this, "cursor", 0);
    __publicField(this, "lastT", 0);
    __publicField(this, "star", { cx: 0, cy: 0, a: new Float32Array(8), t: new Float32Array(8) });
    __publicField(this, "unwatch", () => {
    });
    __publicField(this, "frame", (now) => {
      if (!this.running) return;
      this.start0 || (this.start0 = now);
      let dt = this.lastT ? Math.min((now - this.lastT) / 1e3, 0.05) : 0;
      this.lastT = now;
      let target = this.over ? 1 : 0;
      dt > 0 && (this.cursor += (target - this.cursor) * (1 - Math.exp(-dt / CURSOR_EASE)));
      let moved = Math.abs(this.cursor - target) > 1e-3, idx = Math.floor((now - this.start0) / 1e3 * 24) % 432;
      (idx !== this.lastFrame || moved) && (this.lastFrame = idx, this.render(idx)), this.raf = requestAnimationFrame(this.frame);
    });
    this.canvas = canvas;
    let gl = canvas.getContext("webgl", {
      antialias: !1,
      alpha: !1,
      depth: !1,
      stencil: !1,
      preserveDrawingBuffer: !1
    }) ?? canvas.getContext("experimental-webgl");
    if (!gl) return;
    this.gl = gl, this.unwatch = watchContextLoss(canvas, () => {
      this.stop(), this.ok = !1;
    });
    let prog = this.link(VERT, FRAG);
    if (!prog) return;
    this.prog = prog, this.quad = gl.createBuffer(), gl.bindBuffer(gl.ARRAY_BUFFER, this.quad), gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    let loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc), gl.vertexAttribPointer(loc, 2, gl.FLOAT, !1, 0, 0);
    for (let n of [
      "uRes",
      "uC",
      "uRect",
      "uUnit",
      "uSeed",
      "uScene",
      "uPaper",
      "uPlate",
      "uInk",
      "uGrain",
      "uSprayI",
      "uCursor"
    ])
      this.u[n] = gl.getUniformLocation(prog, n);
    this.u.uA = gl.getUniformLocation(prog, "uA[0]"), this.u.uT = gl.getUniformLocation(prog, "uT[0]"), this.ok = !0, this.resize();
  }
  compile(type, src) {
    let gl = this.gl;
    if (!gl) return null;
    let sh = gl.createShader(type);
    return sh ? (gl.shaderSource(sh, src), gl.compileShader(sh), gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : (gl.deleteShader(sh), null)) : null;
  }
  link(vs, fs) {
    let gl = this.gl;
    if (!gl) return null;
    let v = this.compile(gl.VERTEX_SHADER, vs), f2 = this.compile(gl.FRAGMENT_SHADER, fs);
    if (!v || !f2) return null;
    let p = gl.createProgram();
    return p ? (gl.attachShader(p, v), gl.attachShader(p, f2), gl.linkProgram(p), gl.deleteShader(v), gl.deleteShader(f2), gl.getProgramParameter(p, gl.LINK_STATUS) ? (gl.useProgram(p), p) : (gl.deleteProgram(p), null)) : null;
  }
  resize() {
    let gl = this.gl;
    if (!gl || !this.ok) return;
    let dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP), w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    (this.canvas.width !== w || this.canvas.height !== h) && (this.canvas.width = w, this.canvas.height = h), gl.viewport(0, 0, w, h);
    let m = h * MARGIN;
    this.rect = { x0: m, y0: m, x1: w - m, y1: h - m }, this.unit = (this.rect.y1 - this.rect.y0) * 0.5, this.lastFrame = -1;
  }
  starFrame(k0, out) {
    let beat = Math.floor(k0 / 24) % 3, k = k0 % 24, from = beat, to = beat, p = 1;
    k >= TRANSIT_OUT ? (to = (beat + 1) % 3, p = TRANSIT[k - TRANSIT_OUT]) : k < TRANSIT.length - TRANSIT_SPLIT && (from = (beat + 3 - 1) % 3, p = TRANSIT[k + TRANSIT_SPLIT]);
    let [ax, ay] = poseCentre(POSES[STAR_TOUR[from]], this.rect), [bx, by] = poseCentre(POSES[STAR_TOUR[to]], this.rect);
    out.cx = ax + (bx - ax) * p, out.cy = ay + (by - ay) * p;
    let ra = poseRays(POSES[STAR_TOUR[from]], ax, ay, this.rect), rb = poseRays(POSES[STAR_TOUR[to]], bx, by, this.rect), grow = TIP_GROW * this.unit, tipRect = {
      x0: this.rect.x0 - grow,
      y0: this.rect.y0 - grow,
      x1: this.rect.x1 + grow,
      y1: this.rect.y1 + grow
    };
    for (let i = 0; i < 8; i++) {
      let a = lerpAngle(ra[i], rb[i], p);
      out.a[i] = a, out.t[i] = tipRadius(out.cx, out.cy, a, tipRect);
    }
  }
  render(frame) {
    let gl = this.gl;
    if (!gl || !this.prog) return;
    let slot = Math.floor(frame / 72) % 6, scene = ORDER[slot], k = frame % 72, u = k / 72, pal = PALETTES[slot], paced = (table2, beats) => {
      let b = u * beats;
      return Math.floor(b) + ease(table2, b % 1);
    }, amt = this.cursor * CURSOR_AMOUNT[scene], gesture = CURSOR_GESTURE[scene], localR = CURSOR_LOCAL_R * this.unit, nearness = (x, y) => Math.max(0, 1 - Math.hypot(x - this.px, y - this.py) / localR), angles = this.angles, tips = this.tips, cx = (this.rect.x0 + this.rect.x1) * 0.5, cy = (this.rect.y0 + this.rect.y1) * 0.5;
    if (scene === 0) {
      if (this.starFrame(k, this.star), cx = this.star.cx, cy = this.star.cy, angles.set(this.star.a), tips.set(this.star.t), gesture === "reach" && amt > 0) {
        let toCur = Math.atan2(this.py - cy, this.px - cx);
        for (let i = 0; i < 8; i++) {
          let align = Math.max(0, Math.cos(angles[i] - toCur));
          tips[i] *= 1 + amt * align * align;
        }
      }
    } else if (scene === 1) {
      cx += RING_OFF[0] * this.unit, cy += RING_OFF[1] * this.unit;
      let g = paced(SNAP, RING_BEATS), toCur = Math.atan2(this.py - cy, this.px - cx) / TAU;
      for (let i = 0; i < RING_SPIN.length; i++) {
        let own = RING_GAP_AT[i] + RING_SPIN[i] * g;
        angles[i] = own + amt * turnDelta(own, toCur);
      }
    } else if (scene === 2) {
      let reach = Math.max(...BAR_L) * this.unit, span = this.rect.x1 - this.rect.x0 + 2 * reach;
      for (let i = 0; i < BAR_V.length; i++) {
        let b = u * BAR_BEATS + BAR_OFF[i], g = Math.floor(b) + ease(SNAP, b % 1), t = (BAR_V[i] * g % 1 + 1) % 1, x = this.rect.x0 - reach + t * span;
        angles[i] = x + amt * nearness(x, this.rect.y0 + (this.rect.y1 - this.rect.y0) * 0.5 + BAR_Y[i] * this.unit) * (this.px - x);
      }
    } else if (scene === 3) {
      let g = paced(GLIDE, DISC_BEATS);
      for (let i = 0; i < DISC_R.length; i++) {
        let th = (DISC_PHASE[i] + DISC_SPIN[i] * g) * TAU, x = cx + Math.cos(th) * DISC_OX[i] * this.unit, y = cy + Math.sin(th) * DISC_OY[i] * this.unit, pull = amt * nearness(x, y) * (DISC_R[0] / DISC_R[i]);
        x += pull * (this.px - x), y += pull * (this.py - y), angles[i] = x, tips[i] = y;
      }
    } else if (scene === 4) {
      let g = WEDGE_SPIN * paced(SNAP, WEDGE_BEATS);
      if (amt > 0) {
        let toCur = Math.atan2(this.py - cy, this.px - cx) / TAU, best = 0;
        for (let i = 0; i < WEDGE_AT.length; i++) {
          let d = turnDelta(WEDGE_AT[i] + g, toCur);
          (Math.abs(d) < Math.abs(best) || i === 0) && (best = d);
        }
        g += amt * best;
      }
      for (let i = 0; i < WEDGE_AT.length; i++) angles[i] = WEDGE_AT[i] + g;
    } else {
      let th = DOT_ANGLE * TAU;
      angles[0] = DOT_SPEED * paced(GLIDE, DOT_BEATS), angles[1] = Math.cos(th) * DOT_FREQ * DOT_STEP, angles[2] = Math.sin(th) * DOT_FREQ * DOT_STEP, angles[3] = amt;
    }
    gl.useProgram(this.prog), gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height), gl.uniform2f(this.u.uC, cx, cy), gl.uniform4f(
      this.u.uRect,
      this.rect.x0,
      this.rect.y0,
      this.rect.x1,
      this.rect.y1
    ), gl.uniform1f(this.u.uUnit, this.unit), gl.uniform1i(this.u.uScene, scene), gl.uniform3f(this.u.uPaper, pal.paper[0] / 255, pal.paper[1] / 255, pal.paper[2] / 255), gl.uniform3f(this.u.uPlate, pal.plate[0] / 255, pal.plate[1] / 255, pal.plate[2] / 255), gl.uniform3f(this.u.uInk, pal.ink[0] / 255, pal.ink[1] / 255, pal.ink[2] / 255), gl.uniform1f(this.u.uSprayI, SPRAY_INK * this.unit * SPRAY_SCALE[scene]), gl.uniform3f(this.u.uCursor, this.px, this.py, this.cursor);
    let gs = GRAIN_SCALE[scene];
    gl.uniform3f(
      this.u.uGrain,
      GRAIN_PAPER * gs / 255,
      GRAIN_PLATE * gs / 255,
      GRAIN_INK * gs / 255
    ), gl.uniform1f(this.u.uSeed, frame * 7.13 + 0.5), gl.uniform1fv(this.u.uA, angles), gl.uniform1fv(this.u.uT, tips), gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  start() {
    !this.ok || this.running || (this.running = !0, this.start0 = performance.now() - (this.lastFrame < 0 ? 0 : this.lastFrame / 24 * 1e3), this.raf = requestAnimationFrame(this.frame));
  }
  stop() {
    this.running = !1, this.raf && cancelAnimationFrame(this.raf), this.raf = 0;
  }
  setPointer(x, y) {
    if (x == null || y == null) {
      this.over = !1;
      return;
    }
    let scale = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    this.px = x * scale, this.py = y * scale, this.over = !0;
  }
  renderStill() {
    this.ok && (this.lastFrame = STILL_FRAME, this.render(STILL_FRAME));
  }
  destroy() {
    this.stop(), this.unwatch(), disposeGl(this.gl, { programs: [this.prog], buffers: [this.quad] }), this.gl = null, this.quad = null, this.prog = null, this.ok = !1;
  }
};

// entry.js
var still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function pause(el, engine) {
  let on = !1, hidden = document.hidden, running = !1, sync = () => {
    let next = on && !hidden && !still();
    next !== running && (running = next, next ? engine.start() : engine.stop());
  }, io = new IntersectionObserver((es) => {
    on = es.some((e) => e.isIntersecting), sync();
  }, { threshold: 0.2 });
  return io.observe(el), document.addEventListener("visibilitychange", () => {
    hidden = document.hidden, sync();
  }), () => io.disconnect();
}
function mountSlam(host) {
  let canvas = host.querySelector("canvas"), engine = new SunsetSlam(canvas);
  if (!engine.ok) return null;
  still() && engine.renderStill(), pause(host, engine), canvas.addEventListener("pointerenter", (e) => {
    e.pointerType === "mouse" && engine.setHover(!0);
  }), canvas.addEventListener("pointerleave", () => engine.setHover(!1)), addEventListener("blur", () => engine.setHover(!1));
  let t = 0;
  return addEventListener("resize", () => {
    clearTimeout(t), t = setTimeout(() => engine.resize(), 120);
  }), engine;
}
function mountSpray(host) {
  let canvas = host.querySelector("canvas"), engine = new SprayBurst(canvas);
  if (!engine.ok) return null;
  still() && engine.renderStill(), pause(host, engine);
  let at2 = (e) => {
    let r = canvas.getBoundingClientRect();
    engine.setPointer(e.clientX - r.left, e.clientY - r.top);
  };
  canvas.addEventListener("pointermove", at2), canvas.addEventListener("pointerdown", at2);
  for (let t2 of ["pointerleave", "pointercancel"]) canvas.addEventListener(t2, () => engine.setPointer(null, null));
  let t = 0;
  return addEventListener("resize", () => {
    clearTimeout(t), t = setTimeout(() => {
      engine.resize(), still() && engine.renderStill();
    }, 120);
  }), engine;
}
export {
  mountSlam,
  mountSpray
};
