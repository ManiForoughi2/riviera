// the water below the surface: one WebGL pass on a canvas that fills the screen.
// it draws the waterline as it crosses the lens (a lit, moving meniscus with froth and a rush of
// bubbles), the underside of the surface shrinking away overhead as you sink, shafts of light with
// caustics in them, bubbles and specks streaming up past the camera, and the base water colour,
// matched stop for stop to the css column it fades into, so there is one body of water and no seam.
// two ways to drive it:
//   tied  the waterline is the top of the css column and moves with the scroll (the shorter pages)
//   dive  the crossing is an event: main.js calls setPlunge(1) once the scroll passes a threshold and
//         the line washes up over the lens by itself, eased, in under a second (and back for 0)
// quality is adaptive: every device starts sharp and steps down only if its frames run long.
// returns null when WebGL is missing: the css column (feathered at the top) stands in by itself.

const VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";

const FRAG = `
precision highp float;
uniform vec2 uRes;        // canvas px
uniform float uTime;
uniform float uSurf;      // the waterline, canvas px from the top (negative once it is overhead)
uniform float uCol;       // where the css column starts, canvas px from the top
uniform float uVH;        // one screen height, canvas px
uniform float uPx;        // canvas px per css px
uniform float uFeather, uBand, uW3At;   // css gradient geometry, canvas px
uniform vec3 uW0, uW1, uW2, uW3;        // the css gradient's first four stops
uniform vec3 uSky, uRay;         // what shows through the surface, and the colour of the shafts
uniform float uLight;            // overall strength of the light (day is brighter than night)
uniform float uFloor;            // how much light is left far below the surface
uniform vec3 uMouse;             // pointer x, y in canvas px, z = presence 0..1
uniform float uLean;             // -0.5..0.5, the light leans toward the pointer
uniform float uAmp;              // swell size
uniform float uSunX;             // where the hero's sun or moon stands, 0..1 across the screen
uniform float uBurst;            // 1 as the lens goes through the surface, dying away after
uniform float uDepth;            // screens below the surface
uniform float uRise;             // how far everything loose in the water has streamed up, in screens

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// water caustics, written for this site: light focused by two ripple layers that drift across each
// other. each layer is the ridge line of a warped value noise; the web is bright where ridges run
float caustic(vec2 uv, float t){
  vec2 p = uv * 5.0;
  vec2 w = vec2(vnoise(p * 0.8 + vec2(t * 0.31, 3.1)), vnoise(p * 0.8 + vec2(7.3, t * 0.27))) - 0.5;
  float a = vnoise(p * 1.25 + w * 1.9 + vec2(0.0, t * 0.21));
  float b = vnoise(p * 2.05 - w * 1.4 + vec2(t * 0.17, 9.1));
  float ra = 1.0 - abs(a * 2.0 - 1.0);
  float rb = 1.0 - abs(b * 2.0 - 1.0);
  float web = pow(ra, 7.0) + 0.65 * pow(rb, 9.0);
  return clamp(web * (0.4 + 0.3 * ra * rb), 0.0, 1.0);
}

// bubbles: one per cell at most, a soft disc with a brighter rim, wobbling as it climbs
float bubbles(vec2 uv, float amount, float t){
  vec2 id = floor(uv), f = fract(uv) - 0.5;
  float h = hash(id);
  if (h > amount) return 0.0;
  vec2 o = vec2(hash(id + 3.7) - 0.5, hash(id + 9.1) - 0.5) * 0.5;
  o.x += sin(t * (1.5 + h * 3.0) + h * 40.0) * 0.07;
  float r = 0.05 + 0.13 * hash(id + 5.3);
  float dd = length(f - o);
  return smoothstep(r, r * 0.82, dd) * (0.28 + 0.72 * smoothstep(r * 0.4, r * 0.95, dd));
}

void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);      // px from the top-left
  float asp = uRes.x / uVH;
  float xa = fc.x / uVH;                                        // x in screen heights
  float xn = fc.x / uRes.x;
  float ys = fc.y / uVH;
  float t = uTime;

  // the waterline: a slow swell, shorter ones crossing it, chop; all of it thrown about as the lens goes through
  float sw = (vnoise(vec2(xa * 0.9 + t * 0.11, t * 0.07)) - 0.5) * 0.074
           + (vnoise(vec2(xa * 2.9 - t * 0.23, 3.0 + t * 0.13)) - 0.5) * 0.034
           + (vnoise(vec2(xa * 8.0 + t * 0.42, 7.0 - t * 0.3)) - 0.5) * 0.011
           + (vnoise(vec2(xa * 24.0 - t * 0.9, 11.0 + t * 0.5)) - 0.5) * 0.0032;
  sw = sw * (1.0 + uBurst * 0.9) + (vnoise(vec2(xa * 6.0 + t * 2.6, t * 3.1)) - 0.5) * 0.07 * uBurst;
  float d = fc.y - (uSurf + sw * uVH * uAmp);                   // px below the waterline
  if (d < -26.0 * uPx) { gl_FragColor = vec4(0.0); return; }
  float s = max(d, 0.0) / uVH;                                  // screens below it

  // base colour: the same linear stops as the css column, by position on the page
  float dd = max(fc.y - uCol - uFeather, 0.0);
  float b1 = uBand * 0.34;
  vec3 base = dd < b1 ? mix(uW0, uW1, dd / b1)
            : dd < uBand ? mix(uW1, uW2, (dd - b1) / (uBand - b1))
            : mix(uW2, uW3, clamp((dd - uBand) / max(uW3At - uBand, 1.0), 0.0, 1.0));
  // opaque wherever the column is not there yet, and for a stretch under the line; then the column shows
  float aDoc = 1.0 - smoothstep(uCol + uFeather, uCol + uFeather + uBand * 0.5, fc.y);
  float aNear = 1.0 - smoothstep(0.12 * uVH, 0.27 * uVH, d);
  float aBase = max(aDoc, aNear);

  // the underside of the surface, overhead: near at the waterline, running away from it below,
  // and smaller and dimmer the deeper the camera is
  float sunw = exp(-pow((xn - uSunX) * 2.4, 2.0));              // the light enters where the hero's sun or moon is
  float D = 0.36 * uVH / (1.0 + uDepth * 2.4);
  float v = clamp(d / D, 0.0, 1.0);
  float z = 1.0 / (1.0 - v * 0.965);
  vec2 pl = vec2((xn - 0.5) * asp * z * 0.62, z * 0.62);
  vec2 m = (fc - uMouse.xy) / uVH;
  float ml = length(m * vec2(1.0, 2.4));
  pl += normalize(m + 0.0001) * sin(ml * 44.0 - t * 5.5) * 0.05 * exp(-ml * 6.5) * uMouse.z;
  float c = caustic(pl * 0.42 + vec2(t * 0.012, t * 0.02), t * 0.6);
  float fog = exp(-(z - 1.0) * 0.20) * (1.0 - smoothstep(0.66, 1.0, v)) * exp(-uDepth * 0.9);
  float window = exp(-v * 4.2) * (0.35 + 1.1 * sunw);
  vec3 bright = mix(uW0, uSky, 0.42);                           // lit water, never white
  float ck = clamp((c * (0.34 + 0.4 * sunw) + window * 0.16 + c * window * 0.5) * fog, 0.0, 0.86);
  base *= 1.0 - 0.34 * exp(-max(d, 0.0) / (9.0 * uPx)) * (0.6 + 0.4 * vnoise(vec2(xa * 21.0, t * 0.4)));

  // shafts of light fanning out from the sun's side, caustics travelling down them, dying with depth
  float u1 = xa + s * ((xn - uSunX) * 1.1 + uLean * 0.5);
  float r = pow(vnoise(vec2(u1 * 2.6 + t * 0.04, t * 0.07)), 2.4) * 1.0
          + pow(vnoise(vec2(u1 * 6.4 - t * 0.06, 5.0 + t * 0.11)), 3.2) * 0.7
          + pow(vnoise(vec2(u1 * 15.0 + t * 0.09, 9.0 - t * 0.15)), 4.0) * 0.35;
  float fall = max(exp(-(s + uDepth) * 1.05), uFloor) * smoothstep(0.0, 0.10, s);
  float c2 = caustic(vec2(u1 * 0.33, s * 0.7 - t * 0.02), t * 0.42);
  vec3 light = uRay * r * fall * (0.62 + c2 * 1.6) * uLight * (0.5 + 0.9 * sunw);

  // loose things in the water go up past the lens: faster than the page, and a rush of them at the crossing
  float under = smoothstep(0.0, 0.03, s);
  float yr = ys + uRise;
  float bub = bubbles(vec2(xa * 7.0 + 0.3, (yr * 1.5 + t * 0.10) * 7.0), 0.05, t) * 0.8
            + bubbles(vec2(xa * 15.0, (yr * 1.9 + t * 0.16) * 15.0), 0.05, t) * 0.65
            + bubbles(vec2(xa * 31.0, (yr * 1.2 + t * 0.07) * 31.0), 0.09, t) * 0.45;
  if (uBurst > 0.01) {
    float rush = uBurst * exp(-s * 2.2);
    bub += (bubbles(vec2(xa * 5.0, (yr + t * 0.9) * 5.0), 0.55 * rush, t)
          + bubbles(vec2(xa * 11.0 + 4.0, (yr + t * 1.25) * 11.0), 0.6 * rush, t)
          + bubbles(vec2(xa * 23.0, (yr + t * 0.7) * 23.0), 0.6 * rush, t)) * 1.3;
  }
  vec3 bubc = mix(bright, uSky, 0.6) * bub * under * (0.34 + 0.5 * uLight);

  // the lip: light caught along the waterline, with a soft bloom so the line is never a cut,
  // and froth torn off it while the lens is going through
  float lw = (1.2 + 2.2 * vnoise(vec2(xa * 8.0 - t * 0.5, t * 0.35))) * uPx;
  float lip = exp(-(d * d) / (lw * lw)) * (0.35 + 0.8 * vnoise(vec2(xa * 26.0 + t * 0.7, 2.0)));
  float halo = exp(-abs(d) / (7.0 * uPx)) * 0.20;
  float froth = uBurst * smoothstep(0.48, 0.78, vnoise(vec2(xa * 13.0 + t * 0.8, ys * 24.0 - t * 5.0)))
              * exp(-abs(d) / (0.075 * uVH)) * 0.85;
  vec3 lipc = bright * (lip + halo) + mix(bright, uSky, 0.7) * froth;

  float edge = smoothstep(-2.6 * uPx, 2.2 * uPx, d);
  vec3 water = mix(base, bright, ck);
  vec3 rgb = (water * aBase + bright * ck * (1.0 - aBase) + light + bubc) * edge + lipc * (1.0 - 0.55 * edge);
  float a = clamp((aBase + ck * (1.0 - aBase)) * edge + dot((light + bubc) * edge + lipc, vec3(0.34)), 0.0, 1.0);
  rgb += (hash(fc + fract(t) * 91.0) - 0.5) * (2.0 / 255.0);     // dither, so the long fades do not band
  gl_FragColor = vec4(rgb, a);
}`;

const hex = (h) => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const NAMES = ["uRes", "uTime", "uSurf", "uCol", "uVH", "uPx", "uFeather", "uBand", "uW3At", "uW0", "uW1", "uW2", "uW3", "uSky", "uRay", "uLight", "uFloor", "uMouse", "uLean", "uAmp", "uSunX", "uBurst", "uDepth", "uRise"];

export function startWater(canvas, { deep, reduced, phone, dive, onPlunge }) {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  let U = {};
  const build = () => {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    U = {};
    for (const n of NAMES) U[n] = gl.getUniformLocation(prog, n);
  };
  try { build(); } catch (e) { console.warn("water shader:", e); return null; }

  // quality ladder, in canvas px per css px. phones start sharp enough for a 3x screen and only
  // step down if the frames run long; a capable phone never sees the lower rungs
  const dpr = window.devicePixelRatio || 1;
  const LADDER = phone ? [Math.min(dpr, 3) * 0.6, 1.3, 1.0, 0.7, 0.5].filter((v, i, a) => i === 0 || v < a[0])
                       : [Math.min(1, 0.6 * dpr), 0.75, 0.55];
  let level = 0, scale = LADDER[0], W = 1, H = 1, lost = false, vhCss = innerHeight;
  const probe = document.createElement("i");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:var(--feather);height:var(--band)";
  deep.append(probe);
  const css = getComputedStyle(document.documentElement);
  function look() {
    const light = document.documentElement.getAttribute("data-theme") === "light";
    const v = (n) => hex(css.getPropertyValue(n).trim());
    gl.uniform3fv(U.uW0, v("--w0")); gl.uniform3fv(U.uW1, v("--w1")); gl.uniform3fv(U.uW2, v("--w2")); gl.uniform3fv(U.uW3, v("--w3"));
    gl.uniform3fv(U.uSky, light ? [1.0, 0.965, 0.886] : [0.62, 0.66, 0.76]);   // the hero sea's glint colours
    gl.uniform3fv(U.uRay, light ? [1.0, 0.86, 0.62] : [0.56, 0.68, 0.95]);
    gl.uniform1f(U.uLight, light ? 0.30 : 0.20);
    gl.uniform1f(U.uFloor, 0.14);
    gl.uniform1f(U.uAmp, phone ? 0.8 : 1.0);
  }
  function size() {
    // never more than about 1.5 million pixels, however large the window
    scale = Math.min(LADDER[level], Math.sqrt(1.5e6 / Math.max(1, canvas.clientWidth * canvas.clientHeight)));
    W = Math.max(1, Math.round(canvas.clientWidth * scale)); H = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    gl.viewport(0, 0, W, H);
    vhCss = canvas.clientHeight;                  // the canvas is one large-viewport tall: steady while the address bar moves
    const band = probe.offsetHeight, feather = probe.offsetWidth;
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uVH, vhCss * scale);
    gl.uniform1f(U.uPx, scale);
    gl.uniform1f(U.uBand, band * scale); gl.uniform1f(U.uFeather, feather * scale);
    gl.uniform1f(U.uW3At, Math.max(band + 0.3 * vhCss, 0.42 * deep.offsetHeight - feather) * scale);
  }

  // pointer: eased toward, so the rings and the lean never snap
  let mOn = 0, mTarget = 0, lean = 0, leanTarget = 0, cx = 0, cy = 0, sunX = 0.5;
  if (!phone && !reduced) {
    addEventListener("pointermove", (e) => { cx = e.clientX; cy = e.clientY; mTarget = 1; leanTarget = e.clientX / innerWidth - 0.5; }, { passive: true });
    document.addEventListener("pointerleave", () => { mTarget = 0; });
  }

  // the dive: p runs 0 (above) to 1 (under) on its own clock once it is asked to
  let target = 0, p = 0, burst = 0, y0 = 0, lastNow = 0, cutNow = -1, pSent = -1;
  const ease = (k) => k * k * k * (k * (k * 6 - 15) + 10);
  let raf = 0, visible = true, t0 = performance.now(), blank = false, acc = 0, n = 0, slow = 0;
  function draw(now) {
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
    lastNow = now;
    const colTop = deep.getBoundingClientRect().top, y = scrollY;
    let surf = colTop, depth = Math.max(0, -colTop / vhCss);
    if (dive) {
      if (reduced) p = target;
      else if (p !== target) p = target > p ? Math.min(1, p + dt / 0.85) : Math.max(0, p - dt / 0.7);
      burst = Math.max(0, burst - dt / 1.5);
      const e = ease(p);
      const rest = vhCss + 14 - Math.min(y, 140) * 0.3;          // at rest the water only laps at the bottom edge
      surf = rest + (-(vhCss * 0.1 + 150) - rest) * e;
      depth = p >= 1 ? Math.max(0, (y - y0) / vhCss) : 0;
      if (e !== pSent) { pSent = e; onPlunge?.(e); }
      // the css column only shows below the line; its straight clip edge sits under the opaque band this draws
      const cut = Math.max(0, Math.round(surf - colTop - 2));
      if (cut !== cutNow) { cutNow = cut; deep.style.setProperty("--cut", cut + "px"); }
    }
    // far below there is nothing left to draw but a little light: phones stop painting there
    if (phone && depth > 3.4 && burst <= 0) {
      if (!blank) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); blank = true; }
      return;
    }
    blank = false;
    mOn += (mTarget - mOn) * 0.06; lean += (leanTarget - lean) * 0.04;
    gl.uniform1f(U.uTime, reduced ? 12.0 : (now - t0) / 1000);
    gl.uniform1f(U.uSurf, surf * scale);
    gl.uniform1f(U.uCol, colTop * scale);
    gl.uniform1f(U.uBurst, reduced ? 0 : Math.max(burst, Math.sin(Math.PI * p) * 0.9));
    gl.uniform1f(U.uDepth, depth);
    gl.uniform1f(U.uRise, y / vhCss);
    gl.uniform3f(U.uMouse, cx * scale, cy * scale, mOn);
    gl.uniform1f(U.uLean, lean);
    gl.uniform1f(U.uSunX, sunX);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  let prev = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    // watch real pacing: two windows of 40 frames well over budget and the canvas drops a rung
    const el = now - prev; prev = now;
    if (el > 0 && el < 200 && !blank) {
      acc += el;
      if (++n === 40) {
        api.frameMs = acc / 40;
        if (api.frameMs > 21 && level < LADDER.length - 1) { if (++slow >= 2) { level++; slow = 0; size(); } } else slow = 0;
        acc = n = 0;
      }
    }
    draw(now);
  }
  const run = (on) => {
    if (on && !raf && !lost && !reduced) { prev = 0; lastNow = 0; raf = requestAnimationFrame(loop); }
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  const redraw = () => { if (!lost) { look(); size(); draw(performance.now()); } };
  const api = {
    redraw, frameMs: 0,
    get scale() { return scale; },
    setSun(x) { if (isFinite(x)) sunX = Math.max(-0.2, Math.min(1.2, x)); },
    // step the clock by hand (for checking stills where frames are not running)
    advance(sec) { for (let left = sec; left > 0; left -= 0.05) { const now = performance.now(); lastNow = now - Math.min(left, 0.05) * 1000; draw(now); } },
    // 1: go under now. 0: come back up. the line then moves by itself
    setPlunge(v) {
      if (v === target) return;
      target = v;
      if (v) { burst = 1; y0 = scrollY; }
      if (reduced) draw(performance.now());
    },
  };

  look(); size(); draw(performance.now());
  new ResizeObserver(redraw).observe(canvas);
  document.addEventListener("visibilitychange", () => run(visible && document.visibilityState === "visible"));
  // reduced motion: no loop, but the still frame has to follow the page
  if (reduced) addEventListener("scroll", () => requestAnimationFrame(() => draw(performance.now())), { passive: true });
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; run(false); });
  canvas.addEventListener("webglcontextrestored", () => { try { build(); } catch { return; } lost = false; redraw(); run(visible); });
  run(true);
  return api;
}
