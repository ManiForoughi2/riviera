// Text reveal (https://design.how/vault/text-reveal), ported from the skill's reveal-gl.ts.
// MIT, Arlan Marat (see LICENSE in this folder).
// the skill reveals type through a cloudy mask: a steepened top-left to bottom-right diagonal, wavered,
// textured with domain-warped fbm for tendrils and a fine stipple so the leading edge breaks into
// grain, with a glow riding the front. that mask is kept as written. here it moves a sheet of water
// instead of a block of type: one front brings the sheet over the page, a second one, travelling the
// same way, takes it off again. (the skill blurs its own texture behind the front; a live page cannot
// be sampled, so the soft band of the front does that work.)
// two changes for a full screen: the skill's card is small, and at this size its value noise shows
// its square cells. each octave is turned so the cells never line up, and the stipple is sized in
// pixels so it stays a grain however large the window is.

const VERT = "attribute vec2 p; varying vec2 vUV; void main(){ vUV = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }";

const FRAG = `
  precision highp float;
  uniform float uCover;    // 0 the sheet has not started, 1 it is over everything
  uniform float uClear;    // 0 the sheet is whole, 1 it has gone
  uniform vec3  uTop, uBot;   // the water, top and bottom of the screen
  uniform vec3  uEdge;     // glow-band color riding the front
  uniform float uTime;     // seconds, drifts the dissolve field
  uniform float uAspect;
  uniform float uSeed;
  uniform float uPx;       // canvas px per css px
  varying vec2 vUV;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f*f*f*(f*(f*6.0-15.0)+10.0);
    float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
  float fbm(vec2 p){
    float v = 0.0, amp = 0.5;
    for (int i = 0; i < 4; i++){ v += amp * noise(p); p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.03 + 17.3; amp *= 0.5; }
    return v;
  }
  // how far a front at progress k (0..1) has come over a pixel whose mask value is m: 0 not yet, 1 passed
  float passed(float k, float m){ float p = mix(-0.25, 1.3, k); return smoothstep(p + 0.22, p - 0.22, m); }
  float band(float k, float m){
    float p = mix(-0.25, 1.3, k), fw = 0.30;
    return smoothstep(p - fw, p, m) * smoothstep(p + fw, p, m) * (1.0 - smoothstep(0.8, 1.0, k)) * smoothstep(0.0, 0.08, k);
  }

  void main(){
    vec2 sd = vec2(uSeed * 1.7, uSeed * -1.3);

    // the diagonal, steepened so the two corners stage one after the other, and gently wavered
    float diag = (vUV.x + vUV.y) * 0.5;
    diag = smoothstep(0.18, 0.82, diag);
    diag += (fbm(vUV * 1.3 + sd) - 0.5) * 0.08;

    // domain-warped fbm for wispy tendrils on the front
    vec2 q = vUV * vec2(uAspect, 1.0);
    vec2 warp = vec2(fbm(q * 2.1 + sd + uTime * 0.05 + 11.0),
                     fbm(q * 2.1 - sd - uTime * 0.04 - 7.0)) - 0.5;
    float turb = fbm(q * 2.6 + warp * 1.7 + sd + uTime * 0.06);

    // a fine speckle mixed into the front, so the leading edge breaks into grain
    float stipple = noise(gl_FragCoord.xy / (uPx * 3.0) + sd * 3.0);

    float mask = mix(diag, turb, 0.28);
    mask = mix(mask, stipple, 0.07);

    float a = passed(uCover, mask) * (1.0 - passed(uClear, mask));
    float flare = max(band(uCover, mask), band(uClear, mask));

    vec3 rgb = mix(uTop, uBot, vUV.y);
    vec3 glow = mix(uEdge, vec3(1.0), 0.3);
    rgb += glow * flare * 0.22 * a;
    float alpha = max(a, flare * 0.16);
    rgb += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * (1.5 / 255.0);
    gl_FragColor = vec4(rgb * alpha, alpha);
  }
`;

// a canvas that fills its host. returns null without WebGL
export function createVeil(host, { top, bottom, edge }) {
  const canvas = document.createElement("canvas");
  canvas.className = "veil";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn("veil:", e); return null; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ["uCover", "uClear", "uTop", "uBot", "uEdge", "uTime", "uAspect", "uSeed", "uPx"]) U[n] = gl.getUniformLocation(prog, n);
  host.append(canvas);
  const t0 = performance.now(), seed = Math.random() * 10;
  function size() {
    const s = Math.min(window.devicePixelRatio || 1, 1.5);          // a shader that fills every pixel caps at 1.5
    const w = Math.max(1, Math.round(canvas.clientWidth * s)), h = Math.max(1, Math.round(canvas.clientHeight * s));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform1f(U.uAspect, w / h);
    gl.uniform1f(U.uPx, s);
  }
  gl.uniform3fv(U.uTop, top); gl.uniform3fv(U.uBot, bottom); gl.uniform3fv(U.uEdge, edge);
  gl.uniform1f(U.uSeed, seed);
  return {
    el: canvas,
    draw(cover, clear) {
      size();
      gl.uniform1f(U.uCover, cover); gl.uniform1f(U.uClear, clear);
      gl.uniform1f(U.uTime, (performance.now() - t0) / 1000);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() { canvas.remove(); gl.getExtension("WEBGL_lose_context")?.loseContext(); },
  };
}
