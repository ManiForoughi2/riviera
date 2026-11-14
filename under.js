// the water below the surface: one small WebGL pass on a canvas that rides with the viewport.
// it draws the waterline as you cross it (a soft-lit meniscus, not a shape), the underside of the
// surface receding overhead in perspective, shafts of light with caustics moving in them, and the
// base water colour for the first stretch, matched stop for stop to the css gradient it fades into,
// so there is one continuous column and no seam. the pointer rings the surface and leans the light.
// returns null when WebGL is missing: the css column (feathered at the top) stands in by itself.

const VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";

const FRAG = `
precision highp float;
uniform vec2 uRes;        // canvas px
uniform float uTime;
uniform float uSurf;      // the still waterline, canvas px from the top (negative once it is overhead)
uniform float uVH;        // one screen height, canvas px
uniform float uPx;        // canvas px per css px
uniform float uFeather, uBand;   // css gradient geometry, canvas px
uniform vec3 uW0, uW1, uW2;      // the css gradient's first three stops
uniform vec3 uSky, uRay;         // what shows through the surface, and the colour of the shafts
uniform float uLight;            // overall strength of the light (day is brighter than night)
uniform float uFloor;            // how much light is left far below the surface
uniform vec3 uMouse;             // pointer x, y in canvas px, z = presence 0..1
uniform float uLean;             // -0.5..0.5, the light leans toward the pointer
uniform float uAmp;              // swell size (smaller on phones)

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// water caustics: the well known iterated-sine pattern (after Dave Hoskins' "tileable water caustic")
float caustic(vec2 uv, float t){
  vec2 p = mod(uv * 6.2831853, 6.2831853) - 250.0;
  vec2 i = p; float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
  }
  c /= 4.0; c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}

void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);      // px from the top-left
  float asp = uRes.x / uVH;
  float xa = fc.x / uVH;                                        // x in screen heights
  float t = uTime;

  // the waterline: a slow swell, a shorter one crossing it, a little chop
  float sw = (vnoise(vec2(xa * 1.1 + t * 0.10, t * 0.06)) - 0.5) * 0.050
           + (vnoise(vec2(xa * 3.7 - t * 0.21, 3.0 + t * 0.12)) - 0.5) * 0.016
           + (vnoise(vec2(xa * 13.0 + t * 0.5, 7.0 - t * 0.3)) - 0.5) * 0.004;
  float d = fc.y - (uSurf + sw * uVH * uAmp);                   // px below the waterline
  if (d < -4.0 * uPx) { gl_FragColor = vec4(0.0); return; }
  float s = max(d, 0.0) / uVH;                                  // screens below it

  // base colour, the same linear stops the css column uses below this canvas
  float dd = max(d - uFeather, 0.0);
  float b1 = uBand * 0.34;
  vec3 base = dd < b1 ? mix(uW0, uW1, dd / b1) : mix(uW1, uW2, clamp((dd - b1) / (uBand - b1), 0.0, 1.0));
  float aBase = 1.0 - smoothstep(uFeather + uBand * 0.30, uFeather + uBand * 0.92, d);

  // the underside of the surface, overhead: near at the waterline, running away from it below
  float D = 0.34 * uVH;
  float v = clamp(d / D, 0.0, 1.0);
  float z = 1.0 / (1.0 - v * 0.965);
  vec2 pl = vec2((fc.x / uRes.x - 0.5) * asp * z * 0.62, z * 0.62);
  // the pointer rings the surface
  vec2 m = (fc - uMouse.xy) / uVH;
  float ml = length(m * vec2(1.0, 2.4));
  pl += normalize(m + 0.0001) * sin(ml * 44.0 - t * 5.5) * 0.05 * exp(-ml * 6.5) * uMouse.z;
  float c = caustic(pl * 0.42 + vec2(t * 0.012, t * 0.02), t * 0.6);
  float fog = exp(-(z - 1.0) * 0.20) * (1.0 - smoothstep(0.66, 1.0, v));
  float window = exp(-v * 4.2);                                 // straight up, the sky shows through
  vec3 ceilc = uSky * (c * 1.05 + window * 0.26 + c * window * 0.9) * fog;
  ceilc = ceilc / (1.0 + ceilc * 0.75);                         // roll the highlights off, never a white slab
  // right under the lip the surface mirrors the dark below it
  base *= 1.0 - 0.34 * exp(-max(d, 0.0) / (9.0 * uPx)) * (0.6 + 0.4 * vnoise(vec2(xa * 21.0, t * 0.4)));

  // shafts of light from the surface, with caustics travelling down them
  float u1 = xa + s * (-0.46 + uLean * 0.5);
  float r = pow(vnoise(vec2(u1 * 2.6 + t * 0.04, t * 0.07)), 2.4) * 1.0
          + pow(vnoise(vec2(u1 * 6.4 - t * 0.06, 5.0 + t * 0.11)), 3.2) * 0.7
          + pow(vnoise(vec2(u1 * 15.0 + t * 0.09, 9.0 - t * 0.15)), 4.0) * 0.35;
  float fall = max(exp(-s * 1.15), uFloor) * smoothstep(0.0, 0.10, s);
  float c2 = caustic(vec2(u1 * 0.33, s * 0.7 - t * 0.02), t * 0.42);
  vec3 light = uRay * r * fall * (0.62 + c2 * 1.6) * uLight;

  // the lip: light caught along the waterline, thicker and thinner as it goes
  float lw = (1.3 + 2.4 * vnoise(vec2(xa * 8.0 - t * 0.5, t * 0.35))) * uPx;
  float lip = exp(-(d * d) / (lw * lw)) * (0.5 + 1.0 * vnoise(vec2(xa * 26.0 + t * 0.7, 2.0)));
  vec3 lipc = uSky * lip * 1.15;

  float edge = smoothstep(-1.6 * uPx, 0.6 * uPx, d);
  vec3 rgb = (base * aBase + ceilc + light) * edge + lipc;
  float a = clamp(aBase * edge + dot(ceilc + light + lipc, vec3(0.34)), 0.0, 1.0);
  rgb += (hash(fc + fract(t) * 91.0) - 0.5) * (2.0 / 255.0);     // dither, so the long fades do not band
  gl_FragColor = vec4(rgb, a);
}`;

const hex = (h) => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

export function startWater(canvas, { deep, reduced, phone }) {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  let prog, U = {};
  const build = () => {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    U = {};
    for (const n of ["uRes", "uTime", "uSurf", "uVH", "uPx", "uFeather", "uBand", "uW0", "uW1", "uW2", "uSky", "uRay", "uLight", "uFloor", "uMouse", "uLean", "uAmp"]) U[n] = gl.getUniformLocation(prog, n);
  };
  try { build(); } catch (e) { console.warn("water shader:", e); return null; }

  // a soft subject: half resolution is plenty, and it keeps phones cool
  const want = phone ? 0.5 : Math.min(1, 0.6 * (window.devicePixelRatio || 1));
  let scale = want, W = 1, H = 1, band = 400, feather = 90, lost = false;
  const probe = document.createElement("i");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:var(--feather);height:var(--band)";
  deep.append(probe);
  const css = getComputedStyle(document.documentElement);
  function look() {
    const light = document.documentElement.getAttribute("data-theme") === "light";
    const v = (n) => hex(css.getPropertyValue(n).trim());
    gl.uniform3fv(U.uW0, v("--w0")); gl.uniform3fv(U.uW1, v("--w1")); gl.uniform3fv(U.uW2, v("--w2"));
    gl.uniform3fv(U.uSky, light ? [1.0, 0.95, 0.84] : [0.62, 0.72, 0.92]);
    gl.uniform3fv(U.uRay, light ? [1.0, 0.86, 0.62] : [0.56, 0.68, 0.95]);
    gl.uniform1f(U.uLight, light ? 0.40 : 0.22);
    gl.uniform1f(U.uFloor, phone ? 0.0 : 0.16);
    gl.uniform1f(U.uAmp, phone ? 0.9 : 1.0);
  }
  function size() {
    // never more than about 1.5 million pixels, however large the window
    scale = Math.min(want, Math.sqrt(1.5e6 / Math.max(1, canvas.clientWidth * canvas.clientHeight)));
    W = Math.max(1, Math.round(canvas.clientWidth * scale)); H = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    gl.viewport(0, 0, W, H);
    band = probe.offsetHeight; feather = probe.offsetWidth;
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uVH, window.innerHeight * scale);
    gl.uniform1f(U.uPx, scale);
    gl.uniform1f(U.uBand, band * scale); gl.uniform1f(U.uFeather, feather * scale);
  }

  // pointer: eased toward, so the rings and the lean never snap
  let mx = -9999, my = -9999, mOn = 0, mTarget = 0, lean = 0, leanTarget = 0, cx = 0, cy = 0;
  if (!phone && !reduced) {
    addEventListener("pointermove", (e) => { cx = e.clientX; cy = e.clientY; mTarget = 1; leanTarget = e.clientX / innerWidth - 0.5; }, { passive: true });
    document.addEventListener("pointerleave", () => { mTarget = 0; });
  }

  let raf = 0, visible = true, last = 0, t0 = performance.now(), blank = false;
  function draw(now) {
    const cr = canvas.getBoundingClientRect();
    const surf = deep.getBoundingClientRect().top - cr.top;
    // phones: once the surface is well overhead there is no light left to draw, so stop painting
    if (phone && surf < -innerHeight * 3.2) {
      if (!blank) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); blank = true; }
      return;
    }
    blank = false;
    mOn += (mTarget - mOn) * 0.06; lean += (leanTarget - lean) * 0.04;
    mx = (cx - cr.left) * scale; my = (cy - cr.top) * scale;
    gl.uniform1f(U.uTime, reduced ? 12.0 : (now - t0) / 1000);
    gl.uniform1f(U.uSurf, surf * scale);
    gl.uniform3f(U.uMouse, mx, my, mOn);
    gl.uniform1f(U.uLean, lean);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const iv = phone ? 1000 / 30 : 1000 / 60;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < iv * 0.75) return;
    last = now;
    draw(now);
  }
  const run = (on) => {
    if (on && !raf && !lost && !reduced) raf = requestAnimationFrame(loop);
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  const redraw = () => { if (!lost) { look(); size(); draw(performance.now()); } };

  look(); size(); draw(performance.now());
  new ResizeObserver(redraw).observe(canvas);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(visible && document.visibilityState === "visible"); }).observe(canvas);
  }
  document.addEventListener("visibilitychange", () => run(visible && document.visibilityState === "visible"));
  // reduced motion: no loop, but the still frame has to follow the page
  if (reduced) addEventListener("scroll", () => requestAnimationFrame(() => draw(performance.now())), { passive: true });
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; run(false); });
  canvas.addEventListener("webglcontextrestored", () => { try { build(); } catch { return; } lost = false; redraw(); run(visible); });
  run(true);
  return { redraw };
}
