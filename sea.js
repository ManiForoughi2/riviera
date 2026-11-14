// the scene behind every page title: a Blender-rendered sky with palm islands (assets/sky, made by
// ~/asufiji-render) above a WebGL sea that mirrors it. the title itself is DOM and stands on the
// horizon line; its reflection, and the haze and glare it picks up, are worked out here.
//
// how the water is kept from looking computed:
//  - every wave is filtered against the patch of sea its pixel really covers, which near the
//    horizon is hundreds of times longer than it is wide. sampling waves a row cannot resolve is
//    what used to break the far water into single-pixel streaks.
//  - what the filter removes returns as roughness: reflections are read from vertically squeezed
//    copies of the sky and of the title (rough water smears a reflection down the screen, not
//    across), so far reflections are soft and long instead of hard-edged or missing.
//  - the sun and moon reflect as a slope-space highlight: separate sparks near the eye, one soft
//    path far out. fine ripples from a small mip-mapped slope map give the near water its grain.
// returns null if WebGL is unavailable (the CSS sky + DOM reflection stay as the fallback).

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

// 12 waves, constants baked on the cpu: dir, k, w never change, only the phase moves
const TAU = Math.PI * 2;
const WAVES = [];
for (let i = 0, L = 9; i < 12; i++, L *= 0.7) {
  const ang = Math.sin(i * 12.9898) * 0.7, k = TAU / L;
  WAVES.push({ L, dx: Math.sin(ang), dz: Math.cos(ang), k, w: Math.sqrt(9.8 * k), off: i * 1.7 });
}
const f = (x) => x.toPrecision(9);
const AK = 0.011 * TAU;                                     // amplitude * k, same for every wave

// a pixel of sea covers 1/q of water across the view but z/q along it (q = px below the horizon,
// z = distance): near the horizon one row spans many wavelengths. each wave is faded by how far
// its phase turns across the pixel, in both directions: full while a wave still spans 20 px,
// gone by 8 px. so nothing the screen cannot resolve is ever sampled, and no wave is ever drawn
// as a hairline (regular thin lines read as scanlines even when they are correctly sampled).
// the energy that fades out is not dropped: it comes back as roughness (blurred reflection, wide
// soft glitter). waves only get shorter down the list, so once one is fully faded the rest are
// skipped.
const F_LO = 0.1, F_HI = 0.62;                              // phase step per pixel, squared
const WAVE_GLSL = `
vec3 waveField(vec2 xz, float fp, float ax) {
  vec3 w = vec3(0.0);
  float fp2 = fp * fp, th, a;
${WAVES.map((w, i) => {
    const rest = WAVES.slice(i);
    const minDz = Math.min(...rest.map((r) => r.dz)), maxDx = Math.max(...rest.map((r) => Math.abs(r.dx)));
    const c = w.k / Math.sqrt(F_HI);
    return `  if (fp * (${f(c * minDz)} * xz.y - ${f(c * maxDx)} * ax) >= 1.0) return w;
  th = dot(vec2(${f(w.dx * w.k)}, ${f(w.dz * w.k)}), xz);
  a = clamp(${f(F_HI / (F_HI - F_LO))} - fp2 * (th * th + ${f((w.dx * w.k) ** 2)}) * ${f(1 / (F_HI - F_LO))}, 0.0, 1.0);
  a *= a * (3.0 - 2.0 * a);
  w += vec3(vec2(${f(w.dx * AK)}, ${f(w.dz * AK)}) * (cos(th + uPh[${i}]) * a), a * a);`;
  }).join("\n")}
  return w;
}`;
// slope variance of one wave along the view (they all run roughly toward the eye)
const VAR1 = (AK * AK / 2) * (WAVES.reduce((t, w) => t + w.dz * w.dz, 0) / WAVES.length);
const S0 = 0.004;        // slope of the ripples too fine to draw: softens every reflected edge
const BLUR = 0.4;        // share of that lost slope that smears the reflection (1 = physical, lower = glassier far water)
const CALM = 5.0;        // distance (eye heights) past which the water starts to flatten
const S1 = 0.03;         // slope spread of one sun spark
const SHADOW = 0.6;      // how high the chop lifts the lowest reflected ray, in units of its rms slope
const GLINT = 3.0;       // brightness of a spark that faces the sun squarely

// fine ripples. the 12 waves stop at about 40 cm, and water drawn with nothing finer looks like
// poured glass up close. one small tileable slope map (a handful of short waves, baked once) is
// laid over the sea twice, at two sizes and headings that drift apart. it is mip-mapped, so it
// fades out by itself where a pixel can no longer hold it.
const RIP_N = 128, RIP_SLOPE = 0.034;                       // texels per tile; rms slope of one layer
function rippleMap() {
  const N = RIP_N, sx = new Float32Array(N * N), sz = new Float32Array(N * N), out = new Uint8Array(N * N * 4);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let w = 0; w < 14; w++) {
    const m = Math.round((rnd() * 2 - 1) * 7), n = Math.round(4 + rnd() * 8);   // whole waves per tile: it repeats cleanly
    const ph = rnd() * TAU, kk = Math.hypot(m, n), ax = m / kk, az = n / kk;
    for (let y = 0, i = 0; y < N; y++) for (let x = 0; x < N; x++, i++) {
      const c = Math.cos(TAU * (m * x + n * y) / N + ph);
      sx[i] += ax * c; sz[i] += az * c;
    }
  }
  let v = 0; for (let i = 0; i < N * N; i++) v += sx[i] * sx[i] + sz[i] * sz[i];
  const k = 0.25 / Math.sqrt(v / (N * N));                  // rms -> a quarter of the byte range either way
  for (let i = 0; i < N * N; i++) {
    out[i * 4] = Math.max(0, Math.min(255, 127.5 + sx[i] * k * 255));
    out[i * 4 + 1] = Math.max(0, Math.min(255, 127.5 + sz[i] * k * 255));
    out[i * 4 + 3] = 255;
  }
  return out;
}

// one source, two programs: sky pixels never pay for (or hold registers for) the sea path
const FRAG = (part, oct = 4) => `
#define ${part}
#define OCT ${oct}
precision highp float;
uniform vec2 uRes;        // canvas size, device px
uniform float uHz;        // horizon, device px from the top (= the word's baseline)
uniform float uAsp;       // 1, or how far a canvas row is from square while a resize is being followed (see size)
uniform float uTime;
uniform float uEye;        // eye height above the water, 1 at rest; the page lowers it as it scrolls toward the surface
uniform float uF;         // focal length, device px
uniform float uQ;         // canvas px per 1.5 css px: keeps stars and the finest waves the same size on any screen
uniform float uStars;     // 1 at night, 0 by day
uniform sampler2D uWord;  // word alpha for the area above the horizon; bottom row = horizon
uniform sampler2D uPlateDay, uPlateNight; // blender-rendered sky + islands; bottom row = horizon (see asufiji-render)
uniform float uNight;     // 0 day .. 1 night, animated on theme switch
uniform float uPlateOn;   // 1 once the render has loaded
uniform vec2 uPlateT;     // the render's half-width and full-height, in tan(angle)
uniform vec3 uSunD, uMoonD;   // unit vectors toward the rendered sun and moon (x right, y up, z ahead)
uniform vec3 uHorizon;    // the render's horizon color with the islands left out
uniform vec2 uWordRes;    // word texture size
uniform float uWordHz;    // the horizon's row in the word texture
uniform float uWordH0;    // rows of its full-size level; the squeezed levels sit under it
uniform float uWLod;      // word level that matches level 0 of the reflection atlas
uniform vec2 uWordX;      // left and right edge of the word, px
uniform float uWordQ;     // px -> u in the squeezed levels (they are narrower than level 0)
uniform sampler2D uEnvDay, uEnvNight;   // the renders again, squeezed for the reflection (see envAtlas)
uniform sampler2D uRip;   // fine ripple slopes, tileable (see rippleMap)
uniform vec4 uRipT;       // drift of its two layers
uniform float uRipA;      // their strength; 0 on the lowest quality levels skips them
uniform float uPh[12];    // per-wave phase at uTime, wrapped on the cpu
uniform vec3 uSkyTop, uSkyMid, uHaze, uGlow, uBody, uDeep, uGlint, uWordCol;
uniform vec3 uIsle, uIsleFar, uCloud;   // island silhouettes and cloud tint
uniform vec3 uSkyLow, uSkyHz, uSun, uCloudLit;  // sunset band colors, sun, sunlit cloud edge
uniform float uSunE;                    // sun elevation (sin), just above or below the horizon
uniform float uClouds;                  // cloud amount
// scene texture (premultiplied): r = wordmark, g = near island, b = far island

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// the blender render, looked up by view direction so any screen shape maps onto it
vec3 plate(vec3 d) {
  vec2 t = d.xy / d.z;
  vec2 uv = vec2(0.5 + t.x / (2.0 * uPlateT.x), 1.0 - clamp(t.y, 0.0, uPlateT.y) / uPlateT.y);
  return mix(texture2D(uPlateDay, uv).rgb, texture2D(uPlateNight, uv).rgb, uNight);
}

// the sun sits low, straight behind the crest
vec3 sunDir() { return normalize(vec3(0.0, uSunE, 1.0)); }

// a sunset sky: hot band at the horizon, warm low sky, then mid and top; the sun's halo
// is strongest straight behind the word and spreads sideways along the horizon
vec3 sky(vec3 d) {
  float e = max(d.y, 0.0);
  float side = d.x * d.x;
  vec3 hz = mix(uSkyHz, uSkyLow, smoothstep(0.05, 0.9, side));          // the band cools away from the sun
  vec3 c = mix(hz, uSkyLow, smoothstep(0.0, 0.06, e));
  c = mix(c, uSkyMid, smoothstep(0.05, 0.26, e));
  c = mix(c, uSkyTop, smoothstep(0.24, 0.75, e));
  float cs = max(dot(d, sunDir()), 0.0);
  float cs2 = cs * cs, cs4 = cs2 * cs2, cs8 = cs4 * cs4;
  c += uSun * (cs8 * cs8 * cs8 * 0.32 + cs4 * 0.08) * (1.0 - 0.6 * smoothstep(0.0, 0.3, e));
  c += uSun * smoothstep(0.99985, 0.99993, cs) * 1.4;                   // the disk, when it is up
  return c;
}
#ifdef SKY
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < OCT; i++) { v += a * vn(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return v;
}
#endif
#ifdef SEA
${WAVE_GLSL}
// rough water smears a reflection up and down the screen, hardly at all sideways. the atlas holds
// the render squeezed vertically by 1, 2, 4 .. 64, one under the other, so a lookup at level
// "lod" is that smear for free: two taps, whatever the width
vec3 envTap(sampler2D s, float u, float v, float sc) {      // sc = 2^-level
  float h = 192.0 * sc;
  return texture2D(s, vec2(u, (384.0 * (1.0 - sc) + clamp(v * h, 0.5, h - 0.5)) / 512.0)).rgb;
}
vec3 env1(sampler2D s, vec2 t, float lod) {
  float u = 0.5 + t.x / (2.0 * uPlateT.x), v = 1.0 - min(t.y, uPlateT.y) / uPlateT.y;
  float j = floor(lod), sc = exp2(-j);
  return mix(envTap(s, u, v, sc), envTap(s, u, v, sc * 0.5), lod - j);
}
vec3 env(vec2 t, float lod) {
  if (uNight <= 0.0) return env1(uEnvDay, t, lod);
  if (uNight >= 1.0) return env1(uEnvNight, t, lod);
  return mix(env1(uEnvDay, t, lod), env1(uEnvNight, t, lod), uNight);
}
// the word's reflection, from the same kind of squeezed copies (levels 3..8 of the word texture)
float wordTap(float u, float y, float sc) {                 // sc = 2^-level
  float h = uWordH0 * sc;
  return texture2D(uWord, vec2(u, (uWordH0 * (1.25 - 2.0 * sc) + clamp(y * sc, 0.5, h - 0.5)) / uWordRes.y)).r;
}
// sunlight (or moonlight) thrown back by the facets that happen to face it: g = resolved slope,
// var = slope variance of everything smaller. sharp sparks up close, one soft path far out
float glitter(vec3 v, vec3 l, vec2 g, float var) {
  vec3 h = normalize(l + v);
  vec2 dg = -h.xz / max(h.y, 0.02) - g;
  return exp(-dot(dg, dg) / (2.0 * var)) / var;
}
#endif

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);   // y from the top
  float dy = (uHz - px.y) * uAsp;                            // + above the horizon
  vec3 d = normalize(vec3((px.x - uRes.x * 0.5) / uF, (dy - 0.75) / uF, 1.0));
  vec3 col;

#ifdef SKY
  if (dy <= 0.0) discard;
  if (uPlateOn > 0.5) {
    col = plate(d);
    // stars come out only in the dark upper sky of the night render
    vec2 sp = px / (uQ * 3.0);
    float h = hash(floor(sp));
    if (h > 0.997) {
      float dark = 1.0 - smoothstep(0.08, 0.3, dot(col, vec3(0.3, 0.5, 0.2)));
      float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
      float core = smoothstep(0.5, 0.0, length(fract(sp) - 0.5));
      col += vec3(0.92, 0.9, 0.85) * core * tw * dark * uStars * smoothstep(0.08, 0.3, d.y) * (h - 0.997) * 200.0;
    }
  } else {
  col = sky(d);
  // a sparse field of stars, thinning toward the horizon haze
  vec2 sp = px / (uQ * 3.0);
  float h = hash(floor(sp));
  if (h > 0.9965) {
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
    float fade = smoothstep(0.04, 0.22, d.y);
    float core = smoothstep(0.5, 0.0, length(fract(sp) - 0.5));
    col += vec3(0.92, 0.9, 0.85) * core * tw * fade * uStars * (h - 0.9965) * 220.0;
  }
  // a cloud deck seen in perspective, lit from below by the low sun: the side of each
  // cloud facing the horizon catches the light, the rest falls into the dusk color
  float e = d.y;
  vec2 cp = vec2(d.x, 1.0) / max(e, 0.018);
  vec2 q = vec2(cp.x * 0.34 + uTime * 0.01, cp.y * 1.15);
  float cl = fbm(q);
  float cm = smoothstep(0.47, 0.8, cl) * smoothstep(0.018, 0.1, e) * (1.0 - smoothstep(0.38, 0.9, e));
  if (cm > 0.001) {
    float lit = clamp((cl - fbm(q + vec2(0.0, 0.35))) * 3.2 + 0.45, 0.0, 1.0);   // thinner toward the sun = lit edge
    float cs = max(dot(d, sunDir()), 0.0);
    float glow = cs * cs; glow *= glow; glow *= glow;
    vec3 cc = mix(uCloud, uCloudLit, lit * (0.55 + 0.45 * smoothstep(0.35, 0.0, e)));
    cc += uSun * glow * (0.35 + 0.65 * lit) * 0.7;                          // silver lining near the sun
    col = mix(col, cc, cm * uClouds);
  }
  // islands on the horizon, the far one already half lost in the haze
  float wy = uWordHz - dy;                                   // the word texture hangs from the horizon
  if (wy > 0.0) {
    vec4 sc = texture2D(uWord, vec2(px.x / uWordRes.x, wy / uWordRes.y));
    col = mix(col, uIsleFar, sc.b);
    col = mix(col, uIsle, sc.g);
  }
  }
#else
  if (dy > 0.0) discard;
  float fp = 1.0 / (0.75 - dy);                              // eye height 1: a pixel is fp wide on the water, fp * z long
  vec3 p = vec3((px.x - uRes.x * 0.5) * fp, -1.0, uF * fp);  // where the view ray meets the water
  // a lower eye meets the same rays nearer on the water: the waves loom and their detail opens up
  vec2 q = p.xz * uEye;
  vec3 w = waveField(q, fp * uEye * max(uQ, 0.75), abs(q.x));
  // the chop is at the viewer's feet; out toward the islands the water lies nearly flat, which is
  // what lets it hold their reflections (full strength inside ~5 eye heights, then ~1/distance)
  float cz = q.y * ${f(1 / CALM)}; cz *= cz;
  float calm = inversesqrt(sqrt(1.0 + cz * cz)), var1 = ${f(VAR1)} * calm * calm;
  vec2 g = w.xy * calm;
  if (uRipA > 0.0) {
    vec2 r1 = texture2D(uRip, q * 1.1 + uRipT.xy).rg - 0.5;
    vec2 r2 = texture2D(uRip, vec2(q.x * 0.82 - q.y * 0.57, q.x * 0.57 + q.y * 0.82) * 1.7 + uRipT.zw).rg - 0.5;
    g += (r1 + vec2(r2.x * 0.82 + r2.y * 0.57, r2.y * 0.82 - r2.x * 0.57)) * (uRipA * calm);
  }
  float vu = var1 * (12.0 - w.z);                            // slope variance the pixel cannot resolve

  // a facet tilted away past edge-on is hidden by the crest in front of it, and what shows there
  // instead is the face of the next wave: tilt it back toward the eye by as much as it overshot
  float il = inversesqrt(dot(p.xz, p.xz));
  vec2 hd = p.xz * il;
  float gam = il + dot(g, hd);                               // angle between the view ray and the facet
  g -= hd * (2.0 * min(gam, 0.0));
  gam = abs(gam);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 r = reflect(d, n);
  float c = 1.0 - max(dot(-d, n), 0.0), c2 = c * c;

  // roughness below the pixel: fine ripples everywhere, plus what the far water lost above.
  // of a rough patch you see mostly the facets leaning toward you, so it mirrors sky from higher up
  float sr2 = ${f(S0 * S0)} + ${f(BLUR * BLUR)} * vu, sr = sqrt(sr2);
  vec2 rt = vec2(r.x, abs(r.y)) / max(r.z, 0.2);             // a ray sent down bounces once more: fold it up
  // a ray leaving low over choppy water runs into the next crest, so the chop never mirrors the
  // horizon band itself; calm far water still does, which is where the islands' reflections live
  float vr = var1 * w.z;
  rt.y = sqrt(rt.y * rt.y + ${f(SHADOW * SHADOW)} * vr);
  rt.y += sqrt(gam * gam + ${f(6.2832 * BLUR * BLUR)} * vu) - gam;
  float lod = clamp(0.5 * log2(sr2) + 10.16, 0.0, 5.999);    // level whose rows are about 2 * sr tall
  float fres = (0.02 + 0.98 * c2 * c2 * c) / (1.0 + 22.7 * sr * sqrt(sr));

  float xs = uRes.x * 0.5 + rt.x * uF;
  vec3 refl;
  if (uPlateOn > 0.5) refl = env(rt, lod) * 0.86;
  else {
    vec3 rr = normalize(vec3(rt, 1.0));
    refl = sky(rr) * 0.85;
    vec2 wuv = vec2(xs / uWordRes.x, (uWordHz - rt.y * uF) / uWordRes.y);
    if (wuv.x > 0.0 && wuv.x < 1.0 && wuv.y > 0.0) {
      vec4 sc = texture2D(uWord, wuv);
      refl = mix(refl, uIsleFar * 0.9, sc.b);
      refl = mix(refl, uIsle * 0.9, sc.g);
    }
  }
  float wa = 0.0;                                            // how much of the reflection is the word
  if (xs > uWordX.x && xs < uWordX.y) {
    float jw = clamp(lod + uWLod, 3.0, 7.999), j = floor(jw), sc = exp2(-j);
    float u = xs * uWordQ, y = uWordHz - rt.y * uF;
    wa = mix(wordTap(u, y, sc), wordTap(u, y, sc * 0.5), jw - j);
    refl = mix(refl, uWordCol * 0.86, wa * 0.74);
  }

  vec3 far = uPlateOn > 0.5 ? uHorizon : uHaze;            // the horizon's own color
  float depth01 = clamp(-dy / ((uRes.y - uHz) * uAsp), 0.0, 1.0);
  vec3 body = mix(uBody, uDeep, depth01) * (0.85 + 0.15 * n.z);
  col = mix(body, refl, fres);

  float gv = ${f(S1 * S1)} + vu, spark = 0.0;
  if (uPlateOn < 0.5) spark = glitter(-d, normalize(vec3(0.0, max(uSunE, 0.012), 1.0)), g, gv);
  else {
    if (uNight < 1.0) spark = glitter(-d, uSunD, g, gv) * (1.0 - uNight);
    if (uNight > 0.0) spark += glitter(-d, uMoonD, g, gv) * uNight * 0.6;
  }
  col += uGlint * (1.0 - exp(-spark * ${f(GLINT * S1 * S1)})) * (1.0 - col * 0.6);

  // the sea fades into the mist, but the letters and the islands stand nearer than the horizon:
  // the water at their feet keeps their (dark) reflection, so they are seen to touch it
  float dk = clamp(1.0 - dot(refl, vec3(0.333)) / max(dot(far, vec3(0.333)), 0.02), 0.0, 1.0);
  float keep = max(wa * 0.8, dk * 0.85) * fres;
  col = mix(far, col, mix(exp(-p.z * 0.0018), 1.0, keep));
#endif

  // one band of mist straddles the horizon so sky and sea meet without a seam
  float mist = exp(-abs(dy) / (uRes.y * uAsp * 0.035));
  float mx = (px.x / uRes.x - 0.5) * 2.4;
#ifdef SEA
  mist *= 1.0 - keep;
#endif
  if (uPlateOn > 0.5) col = mix(col, uHorizon, mist * 0.24);
  else col = mix(col, mix(uHaze, uSkyHz, exp(-mx * mx)) + uGlow * 0.12 * exp(-mx * mx), mist * 0.5);

  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dn - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

// night = the last of a sunset (sun just under the horizon); day = a late sunrise (sun low, up)
const LOOK = {
  dark: {
    skyTop: "#080b1c", skyMid: "#211d45", skyLow: "#6b3a58", skyHz: "#e2865a", haze: "#5a3a52", glow: "#c46a4e",
    sun: "#ffb27a", sunE: -0.006,
    body: "#121732", deep: "#070a18", glint: "#e6ebf6", word: "#ecd9bd", stars: 1,
    isle: "#0b0c1c", isleFar: "#3b2a47", cloud: "#2a2242", cloudLit: "#e9906a", clouds: 0.85,
  },
  light: {
    skyTop: "#4f86bd", skyMid: "#9cc0de", skyLow: "#f2d2b6", skyHz: "#ffdca6", haze: "#f3dcc0", glow: "#ffe2b0",
    sun: "#fff1d0", sunE: 0.03,
    body: "#3a6a95", deep: "#22496f", glint: "#fff6e2", word: "#19203a", stars: 0,
    isle: "#4d5f7a", isleFar: "#b6a9a8", cloud: "#c9d3df", cloudLit: "#fff1dc", clouds: 0.9,
  },
};
const LOOK_U = [["uSkyTop", "skyTop"], ["uSkyMid", "skyMid"], ["uSkyLow", "skyLow"], ["uSkyHz", "skyHz"],
  ["uHaze", "haze"], ["uGlow", "glow"], ["uSun", "sun"],
  ["uBody", "body"], ["uDeep", "deep"], ["uGlint", "glint"], ["uWordCol", "word"],
  ["uIsle", "isle"], ["uIsleFar", "isleFar"], ["uCloud", "cloud"], ["uCloudLit", "cloudLit"]];

// the crest's own palm (phosphor tree-palm, MIT), planted on the islands
const PALM = new Path2D("M239.84 60.33a8 8 0 0 1-4.65 5.75L179 90.55a71.42 71.42 0 0 1 43.36 33.21a70.64 70.64 0 0 1 7.2 54.32a8 8 0 0 1-12.56 4.28l-81-61.68V224a8 8 0 0 1-16 0V120.68l-81 61.68a8 8 0 0 1-12.57-4.28a70.64 70.64 0 0 1 7.2-54.32A71.42 71.42 0 0 1 77 90.55L20.81 66.08a8 8 0 0 1-2.6-12.85a66.86 66.86 0 0 1 97.74 0a72.2 72.2 0 0 1 12 17a72.2 72.2 0 0 1 12.05-17a66.86 66.86 0 0 1 97.74 0a8 8 0 0 1 2.1 7.1");

// a low island: a soft mound with palms, its base sitting on the horizon line
function island(ctx, cx, base, w, h, palms) {
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, base);
  ctx.bezierCurveTo(cx - w * 0.3, base - h * 0.05, cx - w * 0.22, base - h * 0.3, cx - w * 0.05, base - h * 0.32);
  ctx.bezierCurveTo(cx + w * 0.14, base - h * 0.34, cx + w * 0.24, base - h * 0.16, cx + w * 0.34, base - h * 0.1);
  ctx.bezierCurveTo(cx + w * 0.42, base - h * 0.06, cx + w * 0.46, base - h * 0.02, cx + w / 2, base);
  ctx.closePath();
  ctx.fill();
  for (const p of palms) {
    const ph = h * p.s, sc = ph / 232;                       // the icon's trunk runs y 8..232
    ctx.save();
    ctx.translate(cx + w * p.x, base - h * p.y);
    ctx.rotate(p.r);
    ctx.scale(sc * (p.flip ? -1 : 1), sc);
    ctx.translate(-128, -232);
    ctx.fill(PALM);
    ctx.restore();
  }
}

// quality ladder. every screen starts on the top rung, at its own resolution with the whole
// shader; the frame cost is then measured and the scene moves down a rung when the gpu cannot
// hold it and back up when there is room. the frame rate goes first (the waves are slow, 30 a
// second reads the same and halves the heat), then resolution, never below 1x.
const LEVELS = [
  { fps: 60, s: 1, rip: 1 },
  { fps: 30, s: 1, rip: 1 },
  { fps: 30, s: 0.82, rip: 1 },
  { fps: 30, s: 0.67, rip: 1 },
  { fps: 30, s: 0.55, rip: 0 },
];
// gpu ms a frame may cost at each rate (the page, the title and the scroll need the rest), the
// headroom wanted before climbing, and how many canvas pixels the top rung may have
const BUDGET = { 60: 8, 30: 20 }, CLIMB = 0.7, MAX_PX = 3.0e6;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// phones and tablets get a lighter stand-in sky (3 cloud octaves) for the seconds before the
// render arrives; nothing else depends on the kind of device
const TOUCH = matchMedia("(hover: none) and (pointer: coarse)");

// the camera. landscape and desktop: the field is set by the longer side, as it always was.
// a phone-width screen held upright: the field across is fixed (tan .30 to either edge) whatever
// the height, so the title, the islands, the sun and the moon sit in the same places on every
// phone and in every in-app browser, and a toolbar sliding away moves nothing sideways.
const PHONE_EDGE = 0.30;
const phoneFrame = (cw, ch) => cw <= 760 && cw < ch * 1.2;
const focal = (cw, ch) => (phoneFrame(cw, ch) ? cw / (2 * PHONE_EDGE) : Math.max(cw, ch * 1.1) * 0.95);

export function startSea(canvas, opts) {
  let eye = 1;
  const { getTheme, reduced, word: wordEl } = opts;
  const touch = TOUCH.matches;
  const attrs = { antialias: false, alpha: false, premultipliedAlpha: false, depth: false, stencil: false, preserveDrawingBuffer: false };
  const gl = canvas.getContext("webgl", attrs);
  if (!gl) return null;

  const wc = document.createElement("canvas");
  const wctx = wc.getContext("2d");
  const ph = new Float32Array(12);
  const px1 = new Uint8Array(4);

  let progs, sky, sea, tex, rip;
  let dpr = 1, raf = 0, visible = true, lost = false, last = 0;
  let level = 0, W = 1, H = 1, hz = 0, acc = 0, n = 0, bad = 0, wordKey = "";
  let scrollT = -1e9, cw = 0, ch = 0;

  function init() {
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT);
    const mk = (part) => {
      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG(part, touch ? 3 : 4)));
      gl.bindAttribLocation(p, 0, "p");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const c = {};
      return { p, u: (n) => (n in c ? c[n] : (c[n] = gl.getUniformLocation(p, n))) };
    };
    sky = mk("SKY"); sea = mk("SEA"); progs = [sky, sea];
    sky.time = sky.u("uTime"); sea.time = sea.u("uTime"); sea.ph = sea.u("uPh");

    // one oversized triangle covers the viewport, no diagonal seam
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.SCISSOR_TEST);

    texs.day = texs.night = envs.day = envs.night = null; shapeNow = ""; wordKey = "";   // a restored context needs every texture again
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, RIP_N, RIP_N, 0, gl.RGBA, gl.UNSIGNED_BYTE, rip || (rip = rippleMap()));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(sea.p); gl.uniform1i(sea.u("uRip"), 5);
    sea.rip = sea.u("uRipT");
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  const each = (fn) => { for (const P of progs) { gl.useProgram(P.p); fn(P.u); } };

  // ---- the blender render (asufiji-render/build_scene.py) ----
  // wide: desktop/landscape framing; tall: the phone camera (see focal), whose frame is the same
  // on every phone. sun = the day render's sun, moon = the night render's moon, in tan(angle).
  // "inner" is where the islands begin; fitWord keeps every title inside it.
  // wide has its sun and moon baked in, over the islands, clear of any title. on a phone the
  // title fills the frame and the open sky is above it, in a different place on each page (a
  // tall FIJI under a deep sky, a short sub-page header under the menu). so the tall render has
  // no sun or moon: its entries are only where they would like to stand, placeLamps finds where
  // this page has room, and paintLamp draws them into the render before it is uploaded
  const PLATES = {
    wide: { tx: 0.56, tv: 0.672, sun: [0.36, 0.14], moon: [-0.37, 0.22], inner: 0.29 },
    tall: { tx: PHONE_EDGE, tv: 0.8, sun: [0.2, 0.30], moon: [-0.2, 0.31], inner: 0.258 },
  };
  const lamps = { sun: PLATES.tall.sun.slice(), moon: PLATES.tall.moon.slice() };
  const lampsOf = (shape) => (shape === "tall" ? lamps : PLATES.wide);
  const NAV = 64;                                 // css px the phone menu row takes at the top
  function placeLamps(cr, baseline, fs) {
    const F = focal(cr.width, cr.height);
    // open sky: far enough over the capitals to be clear of them, and under the menu row
    const lo = fs * 0.75 / F + 0.085, hi = (baseline - NAV - 30) / F;
    for (const k of ["sun", "moon"]) {
      const want = PLATES.tall[k][1], y = lo <= hi ? Math.max(lo, Math.min(hi, want)) : (lo + hi) / 2;
      if (Math.abs(y - lamps[k][1]) > 0.004) lamps[k] = [PLATES.tall[k][0], y];
    }
  }
  // the sun or moon as a camera would have caught it, painted over the render: a clipped core,
  // then glare in wider and fainter rings (screened on, like light), and for the moon its face.
  // the same recipe as ~/asufiji-render/export_plates.py uses on the wide render
  function paintLamp(x, which, W, H, shape) {
    const P = PLATES[shape], px = W / (2 * P.tx), pos = lamps[which === "day" ? "sun" : "moon"];
    const cx = (0.5 + pos[0] / (2 * P.tx)) * W, cy = (1 - pos[1] / P.tv) * H;
    const ring = (r0, w, gain, rgb) => {                     // gain * exp(-(r - r0) / w)
      const g = x.createRadialGradient(cx, cy, r0, cx, cy, r0 + w * 6.5);
      for (const t of [0, 0.35, 0.75, 1.2, 1.8, 2.6, 3.6, 5]) g.addColorStop(t / 6.5, `rgba(${rgb},${(gain * Math.exp(-t)).toFixed(4)})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = g; x.fillRect(cx - r0 - w * 6.5, cy - r0 - w * 6.5, (r0 + w * 6.5) * 2, (r0 + w * 6.5) * 2);
    };
    x.save();
    x.globalCompositeOperation = "screen";
    if (which === "day") {
      const R = 0.004756 * px, g = x.createRadialGradient(cx, cy, 0, cx, cy, R * 2.3);
      for (const [t, a] of [[0, 1], [0.35, 1], [0.48, 0.9], [0.61, 0.65], [0.74, 0.35], [0.87, 0.1], [1, 0]]) g.addColorStop(t, `rgba(255,251,240,${a})`);
      x.fillStyle = g; x.fillRect(cx - R * 2.3, cy - R * 2.3, R * 4.6, R * 4.6);
      ring(0, R * 2.6, 0.9, "255,242,214"); ring(0, R * 9, 0.5, "255,230,184");
      ring(0, R * 34, 0.24, "255,214,158"); ring(0, R * 110, 0.09, "255,219,179");
    } else {
      const R = 0.00733 * px;
      ring(R * 0.9, R * 1.5, 0.46, "219,232,255"); ring(R * 0.9, R * 5, 0.2, "179,204,255");
      ring(R * 0.9, R * 18, 0.06, "140,173,255"); ring(R * 0.9, R * 60, 0.02, "128,158,255");
      x.globalCompositeOperation = "source-over";
      x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.clip();
      const face = x.createRadialGradient(cx, cy, 0, cx, cy, R);          // a little darker toward the limb
      face.addColorStop(0, "rgb(255,249,235)"); face.addColorStop(0.7, "rgb(250,244,230)"); face.addColorStop(1, "rgb(228,222,209)");
      x.fillStyle = face; x.fillRect(cx - R, cy - R, R * 2, R * 2);
      for (const [mx, my, mr, depth] of [[-0.3, -0.38, 0.34, 0.2], [0.18, -0.3, 0.22, 0.17], [0.4, -0.05, 0.24, 0.16],
        [-0.52, 0.02, 0.3, 0.15], [-0.18, 0.42, 0.22, 0.11], [0.3, 0.28, 0.16, 0.09], [0.55, -0.42, 0.13, 0.12]]) {   // the maria
        const sx = cx + mx * R, sy = cy + my * R, sr = mr * R * 1.4, g = x.createRadialGradient(sx, sy, 0, sx, sy, sr);
        g.addColorStop(0, `rgba(30,34,46,${depth})`); g.addColorStop(0.45, `rgba(30,34,46,${depth * 0.6})`); g.addColorStop(1, "rgba(30,34,46,0)");
        x.fillStyle = g; x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      }
    }
    x.restore();
  }
  const imgs = new Map();                       // key -> decoded image (or null while loading)
  const texs = { day: null, night: null }, envs = { day: null, night: null };
  let shapeNow = "", horizon = { day: [0.6, 0.6, 0.62], night: [0.1, 0.12, 0.2] };
  let nightNow = getTheme() === "light" ? 0 : 1, fadeRaf = 0;

  // the frame is the whole header, which the canvas fills once main.js sets .gl-sea. measured on the
  // canvas itself, the first look (before that class) saw only the strip under the horizon, called
  // every phone's sub-page "wide" and downloaded both wide renders for nothing
  const frameEl = canvas.closest(".hero") || canvas;
  const shapeFor = () => (phoneFrame(frameEl.clientWidth, frameEl.clientHeight) ? "tall" : "wide");
  function horizonOf(img) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 8;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, img.height - 8, img.width, 8, 0, 0, 256, 8);
    const px = x.getImageData(0, 0, 256, 8).data;
    let r = 0, g = 0, b = 0, n = 0, top = 0;
    for (let i = 0; i < px.length; i += 4) top = Math.max(top, px[i] + px[i + 1] + px[i + 2]);
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] + px[i + 1] + px[i + 2] < top * 0.45) continue;    // skip the island silhouettes
      r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
    }
    return n ? [r / n / 255, g / n / 255, b / n / 255] : [0.5, 0.45, 0.45];
  }
  const tex2d = (t, src, unit) => {
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
  };
  // the render as the water mirrors it: 7 copies squeezed to 192, 96 .. 3 rows, stacked in one
  // small texture. each is halved from the one before, so a row is the true average of the sky
  // it stands for, and the sea shader gets any amount of vertical blur from two taps
  function envAtlas(img) {
    if (img.env) return img.env;
    const aw = img.width > 1600 ? 1024 : 512;
    const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; return [c, x]; };
    const [a, ax] = mk(aw, 768), [b, bx] = mk(aw, 384), [c, cx] = mk(aw, 512);
    ax.drawImage(img, 0, 0, aw, 768);
    bx.drawImage(a, 0, 0, aw, 384);
    cx.drawImage(b, 0, 0, aw, 192);
    for (let h = 192, y = 0; h > 3; y += h, h /= 2) cx.drawImage(c, 0, y, aw, h, 0, y + h, aw, h / 2);
    return (img.env = c);
  }
  function upload(which, img, unit, shape) {
    if (!texs[which]) { texs[which] = gl.createTexture(); envs[which] = gl.createTexture(); }
    let src = img;
    if (shape === "tall") {                                 // this render gets its sun or moon here
      src = img.lit || (img.lit = document.createElement("canvas"));
      src.width = img.width; src.height = img.height; src.env = null;
      const x = src.getContext("2d");
      x.drawImage(img, 0, 0);
      paintLamp(x, which, src.width, src.height, shape);
    }
    tex2d(texs[which], src, unit);
    tex2d(envs[which], envAtlas(src), which === "day" ? gl.TEXTURE3 : gl.TEXTURE4);
    horizon[which] = img.horizon || (img.horizon = horizonOf(img));
    have[which] = true;
  }
  // the title is DOM, so the scene hands it its light (see the last block of styles.css): the
  // colour of the haze on the waterline, and where the sun and moon stand relative to the letters
  const have = { day: false, night: false };
  const put = (k, v) => { if (wordEl.style.getPropertyValue(k) !== v) wordEl.style.setProperty(k, v); };   // an unchanged value must not repaint the title
  function lightWord(cr, wr, baseline, fs) {
    const which = getTheme() === "light" ? "day" : "night";
    if (have[which]) put("--hw-hz", `rgb(${horizon[which].map((v) => Math.round(v * 255)).join(" ")})`);
    if (!cr) return;
    const P = lampsOf(shapeFor()), F = focal(cr.width, cr.height);
    const ox = cr.width / 2 - (wr.left - cr.left), oy = baseline - (wr.top - cr.top);
    for (const k of ["sun", "moon"]) {
      const x = ox + P[k][0] * F, y = oy - P[k][1] * F;
      put(`--hw-${k}-x`, `${x.toFixed(1)}px`);
      put(`--hw-${k}-y`, `${y.toFixed(1)}px`);
      // how far the lamp stands from the letters (the box from cap line to baseline): its glare
      // is at full strength there and dies away a set share of the title's size further in (most
      // of a capital's height, or 38% of a short title's width), so it lights the edge of the
      // title nearest it and leaves the body its own colour, whatever the size of title or screen
      const dx = Math.max(-x, 0, x - wr.width), dy = Math.max(oy - fs * 0.75 - y, 0, y - oy);
      put(`--hw-${k}-d`, `${Math.hypot(dx, dy).toFixed(1)}px`);
    }
    put("--hw-reach", `${Math.min(wr.width * 0.38, fs * 0.62).toFixed(1)}px`);
    // the css caps the mist at .075em; capped here too, so a change of height alone changes nothing
    put("--hw-mist-h", `${Math.min(cr.height * 0.035, fs * 0.075).toFixed(1)}px`);
  }
  // the render for this screen shape and this theme is loaded at once. the one for the other theme is
  // not part of the first load: it is fetched as soon as the page has loaded, held decoded, and
  // taken into the scene (the upload, the mirror atlas, the horizon read: main-thread work) only
  // when the theme turns to it. setLook comes through here with the new theme first, so its render
  // is in before the first frame of the turn; one asked for before it has arrived borrows, as below
  let loaded = false;
  {
    const now = () => setTimeout(() => { loaded = true; if (!lost && progs) usePlate(); }, 0);
    if (navigator.connection && navigator.connection.saveData) { /* asked to spare data: only on demand */ }
    else if (document.readyState === "complete") now();
    else addEventListener("load", now, { once: true });
  }
  function usePlate() {
    const shape = shapeFor();
    const order = getTheme() === "light" ? ["day", "night"] : ["night", "day"];
    const fresh = shape !== shapeNow;
    shapeNow = shape;
    for (const which of order) {
      const shown = which === order[0];
      const key = `${shape}-${which}`;
      const at = shape === "tall" ? key + "@" + lamps[which === "day" ? "sun" : "moon"].map((v) => v.toFixed(3)).join(",") : key;
      const img = imgs.get(key);
      if (img) { if ((shown || texs[which]) && (fresh || !texs[which] || texs[which].key !== at)) { upload(which, img, which === "day" ? gl.TEXTURE1 : gl.TEXTURE2, shape); texs[which].key = at; lightWord(); } continue; }
      if (imgs.has(key) || !(shown || loaded)) continue;
      imgs.set(key, null);
      const im = new Image();
      im.decoding = "async";
      const ready = () => {
        if (imgs.get(key)) return;
        imgs.set(key, im);
        if (!lost && which === (getTheme() === "light" ? "day" : "night")) { usePlate(); applyLook(nightNow); draw(performance.now() / 1000 * 0.55); }
      };
      // decode off the main thread when the browser will, but never wait on it: a tab that is not
      // being painted (opened in the background) leaves decode() pending until it is shown
      im.onload = () => { im.decode().then(ready, ready); setTimeout(ready, 300); };
      im.onerror = () => imgs.delete(key);
      im.src = new URL(`assets/sky/${key}.webp`, import.meta.url).href;
    }
    // a missing half borrows the other until it arrives, so the shader never samples an empty unit
    const haveDay = texs.day && texs.day.key.startsWith(`${shape}-day`), haveNight = texs.night && texs.night.key.startsWith(`${shape}-night`);
    const on = getTheme() === "light" ? haveDay : haveNight;
    each((u) => {
      gl.uniform1i(u("uWord"), 0);
      gl.uniform1i(u("uPlateDay"), haveDay ? 1 : 2);
      gl.uniform1i(u("uPlateNight"), haveNight ? 2 : 1);
      gl.uniform1i(u("uEnvDay"), haveDay ? 3 : 4);
      gl.uniform1i(u("uEnvNight"), haveNight ? 4 : 3);
      gl.uniform1f(u("uPlateOn"), on ? 1 : 0);
      gl.uniform2f(u("uPlateT"), PLATES[shape].tx, PLATES[shape].tv);
    });
    if (on) reveal();
  }
  // the scene stays hidden until its rendered sky is in, so the stand-in sky never flashes
  let shown = false;
  function reveal() {
    if (shown) return;
    shown = true;
    canvas.style.transition = reduced ? "none" : "opacity .6s ease";
    canvas.style.opacity = "1";
  }
  canvas.style.opacity = "0";
  setTimeout(reveal, 5000);        // the render never came: fall back to the drawn sky

  // every theme-driven uniform, blended by how far into night we are (0 day .. 1 night)
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const unit = ([x, y]) => { const l = Math.hypot(x, y, 1); return [x / l, y / l, 1 / l]; };
  function applyLook(t) {
    const d = LOOK.light, n = LOOK.dark, p = lampsOf(shapeNow || shapeFor());
    each((u) => {
      for (const [name, k] of LOOK_U) gl.uniform3fv(u(name), lerp3(hex(d[k]), hex(n[k]), t));
      gl.uniform1f(u("uStars"), lerp(d.stars, n.stars, t));
      gl.uniform1f(u("uClouds"), lerp(d.clouds, n.clouds, t));
      gl.uniform1f(u("uSunE"), lerp(d.sunE, n.sunE, t));
      gl.uniform1f(u("uNight"), t);
      gl.uniform3fv(u("uSunD"), unit(p.sun));
      gl.uniform3fv(u("uMoonD"), unit(p.moon));
      gl.uniform3fv(u("uHorizon"), lerp3(horizon.day, horizon.night, t));
    });
  }
  function setLook() {
    const target = getTheme() === "light" ? 0 : 1;
    usePlate();
    lightWord();
    cancelAnimationFrame(fadeRaf);
    if (reduced || target === nightNow || !progs) { nightNow = target; applyLook(nightNow); return; }
    // a slow sunrise / nightfall: ease the whole scene across about a second
    const from = nightNow, t0 = performance.now(), dur = 1100;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = k * k * (3 - 2 * k);
      nightNow = lerp(from, target, e);
      applyLook(nightNow);
      if (!lost) draw(now / 1000 * 0.55);
      if (k < 1) fadeRaf = requestAnimationFrame(step);
    };
    fadeRaf = requestAnimationFrame(step);
  }

  // horizon = the word's baseline. the word is painted into a texture that hangs from that
  // line, so it depends on the word alone: when only the height of the screen changes (a phone
  // toolbar sliding away) nothing is repainted or uploaded, the horizon just moves
  const sq = document.createElement("canvas"), sqx = sq.getContext("2d");
  function paintWord() {
    const cr = canvas.getBoundingClientRect();
    const cs = getComputedStyle(wordEl);
    const fs = parseFloat(cs.fontSize);
    const wr = wordEl.getBoundingClientRect();
    const baseline = wr.top - cr.top + fs * 0.87;          // line-height 1, Recia metrics
    // the sea starts a fraction of a pixel above the baseline, tucked behind the letters' last
    // row, so no sliver of bright sky can show between a letter and its reflection
    hz = Math.floor(baseline * dpr / asp - 0.25);
    const F = focal(cr.width, cr.height) * dpr, shape = shapeFor();
    if (shape === "tall" && asp === 1) placeLamps(cr, baseline, fs);   // not while a resize is being followed
    const cw = cr.width, ih = Math.min(cr.height * 0.11, cw * 0.09);
    const left = wr.left - cr.left, text = wordEl.textContent;
    const key = [text, cs.fontWeight, fs, cs.letterSpacing, cs.fontFamily, left.toFixed(2), wr.width.toFixed(2), cw, dpr, ih.toFixed(1)].join("|");
    if (key !== wordKey) {
      wordKey = key;
      // level 0 = the word at full size: "up" css px of room above the baseline, and room under
      // it for the mirror image; under that sit copies squeezed to 1/8 .. 1/256 of the height,
      // which the sea reads as the blurred word
      const up = Math.max(fs * 0.92, ih * 1.3 + 4);
      const h0 = Math.ceil((up + fs * 0.32) * dpr / 256) * 256;
      wc.width = Math.max(1, Math.round(cw * dpr));
      wc.height = h0 * 1.25;
      wctx.clearRect(0, 0, wc.width, wc.height);
      wctx.save();
      wctx.scale(dpr, dpr);
      wctx.font = `${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
      if ("letterSpacing" in wctx) wctx.letterSpacing = cs.letterSpacing;
      wctx.textBaseline = "alphabetic";
      // each layer in its own channel; additive so overlaps don't steal coverage from each other
      wctx.globalCompositeOperation = "lighter";
      wctx.fillStyle = "#f00";
      const tx = left + parseFloat(cs.textIndent || 0);
      wctx.fillText(text, tx, up);
      // the same word upside down below the waterline: a blurred lookup right at the letters' feet
      // then averages letter with letter, and the reflection stays solid where it meets them
      wctx.save();
      wctx.beginPath(); wctx.rect(0, up, cw, h0 / dpr - up); wctx.clip();
      wctx.translate(0, 2 * up); wctx.scale(1, -1);
      wctx.fillText(text, tx, up);
      wctx.restore();
      // stand-in islands (only seen if the render never loads) in the open water beside the word
      const gapL = left, gapR = cr.right - wr.right;
      const fit = (gap, w, h) => { const k = Math.min(1, (gap * 0.86) / w); return [w * k, h * k]; };
      if (gapL > 34) {
        const [w, h] = fit(gapL, ih * 2.2, ih * 0.55);
        wctx.fillStyle = "#00f";
        island(wctx, gapL / 2, up + 0.5, w, h, [{ x: 0.02, y: 0.28, s: 0.62, r: -0.08 }]);
      }
      if (gapR > 34) {
        const [w, h] = fit(gapR, ih * 3.2, ih);
        wctx.fillStyle = "#0f0";
        island(wctx, cw - gapR / 2, up + 0.5, w, h, [
          { x: -0.08, y: 0.28, s: 0.95, r: -0.1 },
          { x: 0.1, y: 0.3, s: 0.7, r: 0.12, flip: true },
        ]);
      }
      wctx.restore();
      // squeeze by halves (each row a true average): 1/2 and 1/4 in a scratch canvas, 1/8 .. 1/256
      // kept. the kept ones are also narrower, since water never mirrors a hard side edge: a quarter
      // as wide for a big title, less for small ones so their thin strokes survive
      const ww = wc.width, qw = Math.ceil(ww / Math.max(1, Math.min(4, Math.round(fs * dpr / 100))));
      const hw = Math.max(qw, Math.ceil(ww / 2));
      sq.width = ww; sq.height = h0 * 0.75;
      sqx.drawImage(wc, 0, 0, ww, h0, 0, 0, hw, h0 / 2);
      sqx.drawImage(sq, 0, 0, hw, h0 / 2, 0, h0 / 2, qw, h0 / 4);
      wctx.drawImage(sq, 0, h0 / 2, qw, h0 / 4, 0, h0, qw, h0 / 8);
      for (let h = h0 / 8, y = h0; h > h0 / 256; y += h, h /= 2) wctx.drawImage(wc, 0, y, qw, h, 0, y + h, qw, h / 2);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, wc);
      each((u) => {
        gl.uniform2f(u("uWordRes"), wc.width, wc.height);
        gl.uniform1f(u("uWordQ"), qw / ww / ww);
        gl.uniform1f(u("uWordHz"), up * dpr); gl.uniform1f(u("uWordH0"), h0);
        gl.uniform2f(u("uWordX"), left * dpr - 2, (wr.right - cr.left) * dpr + 2);
      });
    }
    each((u) => {
      gl.uniform1f(u("uHz"), hz);
      gl.uniform1f(u("uWLod"), Math.log2(PLATES[shape].tv * F / 192));
    });
    lightWord(cr, wr, baseline, fs);
  }


  // hard = fit the canvas to the box exactly. soft = the box only changed height (a phone
  // toolbar sliding in or out resizes the page many times a second): keep the canvas the browser
  // already has, which it stretches to the box, and draw into it with rows that are not quite
  // square so the picture on screen is right. no reallocation, no clear, nothing to flash; the
  // exact fit follows once the height has stopped moving
  let asp = 1, sizedW = -1;
  function size(hard = true) {
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    // the top rung: the screen's own pixels, up to 3x and to a 3-megapixel canvas, but never
    // under the 1.5x a large desktop canvas has always had
    const top = Math.min(window.devicePixelRatio || 1, 3, Math.max(1.5, Math.sqrt(MAX_PX / Math.max(1, cw * ch))));
    const d = Math.max(top * LEVELS[level].s, Math.min(top, 1));
    const a = dpr * ch / canvas.height;                      // css stretch of the canvas we already have
    if (!hard && cw === sizedW && Math.abs(d - dpr) < 0.12 && a > 0.85 && a < 1.18) asp = a;
    else {
      dpr = d; asp = 1; sizedW = cw;
      W = Math.max(1, Math.round(cw * dpr)); H = Math.max(1, Math.round(ch * dpr));
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
    }
    gl.viewport(0, 0, W, H);
    each((u) => {
      gl.uniform2f(u("uRes"), W, H);
      gl.uniform1f(u("uAsp"), asp);
      gl.uniform1f(u("uF"), focal(cw, ch) * dpr);
      gl.uniform1f(u("uQ"), dpr / 1.5);
      gl.uniform1f(u("uRipA"), LEVELS[level].rip ? RIP_SLOPE * 4 : 0);   // the bottom rung drops the ripples too
    });
    fitWord();
    paintWord();
    usePlate();
    applyLook(nightNow);
    settle = performance.now() + 400;                        // let the new size run before it is timed
  }

  // the islands are baked into the sky, so the title shrinks to fit the open water between them
  const heroEl = wordEl.closest(".hero");
  function fitWord() {
    if (!heroEl) return;
    if (heroEl.style.getPropertyValue("--kw")) heroEl.style.removeProperty("--kw");
    const room = 2 * PLATES[shapeFor()].inner * focal(canvas.clientWidth, canvas.clientHeight);
    const w = wordEl.getBoundingClientRect().width;
    if (w > room) heroEl.style.setProperty("--kw", `${parseFloat(getComputedStyle(wordEl).fontSize) * room / w}px`);
  }

  function draw(sec) {
    if (lost) return;
    for (let i = 0; i < 12; i++) ph[i] = (WAVES[i].off - WAVES[i].w * sec) % TAU;
    // sky above the horizon row, sea below; one row of overlap, the shaders discard the extra
    const split = Math.min(H, Math.max(0, Math.floor(H - hz - 0.5)));
    gl.useProgram(sky.p);
    gl.uniform1f(sky.time, sec);
    gl.scissor(0, split, W, H - split);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(sea.p);
    gl.uniform1f(sea.time, sec);
    gl.uniform1f(sea.u("uEye"), eye);
    gl.uniform1fv(sea.ph, ph);
    gl.uniform4f(sea.rip, (sec * 0.031) % 1, (sec * 0.262) % 1, (sec * -0.118) % 1, (sec * 0.238) % 1);
    gl.scissor(0, 0, W, Math.min(H, split + 1));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---- adaptive quality ----
  // a timed frame: draw, then a blocking 1px read that returns only when the gpu has finished it
  // (one read per frame, or a tile gpu folds the overdrawn frames into one)
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);
  function probe() {
    draw(3.0); sync();                                       // warm up (driver compiles lazily)
    const t0 = performance.now();
    draw(3.0); sync(); draw(3.0); sync();
    return (performance.now() - t0) / 2;
  }
  // what a frame that costs ms on this rung would cost on rung L (cost follows the pixel count)
  const costOn = (L, ms) => ms * (LEVELS[L].s / LEVELS[level].s) ** 2;
  let settle = 0, nextT = 0, taken = 0, samples = [], upHold = 0, upAt = -1e9, upFails = 0;
  function setLevel(L, now) {
    L = Math.max(0, Math.min(LEVELS.length - 1, L));
    if (L === level) return;
    const was = LEVELS[level];
    level = L;
    samples = []; taken = 0; acc = n = bad = 0;
    if (LEVELS[L].s !== was.s || LEVELS[L].rip !== was.rip) { size(); draw(now / 1000 * 0.55); }
    settle = now + 400;
  }
  // a rung is left downward when two timed frames running are over its budget (or the browser's
  // own frame pacing says so, see loop), and upward when three running would fit the rung above
  // with room to spare. a climb that does not hold is not tried again for a while, longer each time
  function stepDown(to, now) {
    if (now - upAt < 30000) upFails++;
    upHold = now + Math.min(300000, 15000 * 2 ** upFails);
    setLevel(to, now);
  }
  function judge(ms, now) {
    samples.push(ms); if (samples.length > 3) samples.shift();
    const k = samples.length, cur = LEVELS[level];
    if (k >= 2 && Math.min(samples[k - 1], samples[k - 2]) > BUDGET[cur.fps]) {
      if (level >= LEVELS.length - 1) return;
      const m = Math.min(samples[k - 1], samples[k - 2]);
      let L = level + 1;
      while (L < LEVELS.length - 1 && costOn(L, m) > BUDGET[LEVELS[L].fps] * 0.9) L++;
      stepDown(L, now);
    } else if (level > 0 && k >= 3 && now > upHold && costOn(level - 1, Math.max(...samples)) <= BUDGET[LEVELS[level - 1].fps] * CLIMB) {
      upAt = now;
      setLevel(level - 1, now);
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const iv = 1000 / LEVELS[level].fps, el = now - last;
    if (el < iv * 0.75) return;
    // the browser's own pacing: two windows of 30 frames well over budget means the device cannot
    // keep this rung up, whatever the gpu timing says (a busy page, a low-power mode)
    if (last && el < 250) {
      acc += el;
      if (++n === 30) {
        if (acc / 30 > iv * 1.5) { if (++bad >= 2 && level < LEVELS.length - 1) stepDown(level + 1, now); } else bad = 0;
        acc = n = 0;
      }
    } else acc = n = 0;
    last = now;
    // time a frame now and then: every half second while a rung is new, then every four. not
    // while the page is scrolling the camera down (eye < 1), which is a different picture
    const timed = now >= nextT && now >= settle && eye === 1;
    const t0 = timed ? performance.now() : 0;
    draw(now / 1000 * 0.55);
    if (timed) {
      sync();
      nextT = now + (taken++ < 6 ? 500 : 4000);
      judge(performance.now() - t0, now);
    }
  }

  const run = (on) => {
    if (on && !raf && !reduced && !lost) { last = 0; raf = requestAnimationFrame(loop); }
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  };

  try { init(); } catch (e) { console.warn("sea shader:", e); return null; }
  setLook(); size();
  if (!reduced) {
    // a first guess from two cold frames, read generously (start-up timing runs slow): it only
    // spares a slow gpu its first second on a rung it cannot hold. the loop decides from there
    const ms = probe();
    let L = 0;
    while (L < LEVELS.length - 1 && costOn(L, ms) > BUDGET[LEVELS[L].fps] * 1.5) L++;
    if (L) { const s0 = LEVELS[level].s; level = L; if (LEVELS[L].s !== s0 || !LEVELS[L].rip) size(); }
  }
  draw(3.0);
  (document.fonts?.ready || Promise.resolve()).then(() => { if (lost) return; wordKey = ""; size(); draw(3.0); });
  let fitT = 0;
  const resized = () => {
    if (lost) return;
    size(false); draw(performance.now() / 1000 * 0.55);
    clearTimeout(fitT);
    if (asp !== 1) fitT = setTimeout(() => { if (!lost && asp !== 1) { size(); draw(performance.now() / 1000 * 0.55); } }, 180);
  };
  // always redraw in the same frame as a resize (skipping this left a stretched or blank sky).
  // when only the height moved, nothing is reallocated, repainted or uploaded and the title's
  // style is not touched (see size and paintWord), so a sliding toolbar costs one plain frame
  new ResizeObserver(resized).observe(canvas);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !lost) draw(performance.now() / 1000 * 0.55);
      run(visible);
    }, { threshold: 0 }).observe(canvas);
  }
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; run(false); });
  canvas.addEventListener("webglcontextrestored", () => {
    try { init(); } catch (e) { console.warn("sea shader:", e); return; }
    lost = false;
    setLook(); size(); draw(performance.now() / 1000 * 0.55);
    run(visible);
  });
  run(true);

  return {
    redraw() { if (lost) return; wordKey = ""; setLook(); size(); draw(performance.now() / 1000 * 0.55); },
    // the camera sinking toward the surface (1 = standing height, toward 0 = lens at the water)
    setEye(v) { v = Math.max(0.08, Math.min(1, v)); if (v === eye) return; eye = v; if (reduced && !lost) draw(3.0); },
  };
}
