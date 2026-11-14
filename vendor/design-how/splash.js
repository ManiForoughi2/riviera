// The splash: FIJI types itself in and goes wild through the warp mesh (wild-type.js), lands exactly
// on the hero word, then heats, trembles and bursts into darts (loud-burst.js) over the live page.
//
// Both engines are ports of the design.how vault templates (https://design.how/vault/wild-type and
// https://design.how/vault/loud-burst, github.com/arla6ka/design.how, MIT, (c) 2026 Arlan Marat).
// This file only composes them: it owns one clock, drives each engine tick by tick, and hands the
// word from one to the other.

import { WildType, BLANK_TICKS, TYPE_TICKS, WARP_TICKS } from "./wild-type.js";
import { LoudBurst, TINT_TICK, BURST_TICK, TICKS } from "./loud-burst.js";

// ---------------------------------------------------------------- tuning

const WORD = "FIJI";
const WEIGHT = 600; // the hero word is 600 Recia Display
const SPACING = 0.02; // its letter-spacing, in em

// Wild type runs its tables at 30 ticks a second in the template. The splash has about two seconds
// for both effects, so it plays the same ticks faster.
const TYPE_TPS = 54; // ticks a second while the word types in
const WARP_TPS = 52; // ticks a second through the warp
const REST_TICKS = 1.5; // the word stands at rest this long before the burst engine takes it
const POINTER_OFF_TICK = 21; // warp tick after which the pointer lets go, so the landing is exact

// Not in the template. While the mesh is stretched, wild type draws each contour as curves through
// its traced points. The template's curve handles overshoot where a long straight stem meets the
// short bracket of a serif, which leaves hairline whiskers and slits at every serif of Recia.
// This caps each handle at this share of its own segment. Set it to null for the template's curves.
const CURVE_CLAMP = 0.4;

const BURST_FPS = 40; // Loud burst FPS (a VARIABLE; the template value is 34)
// The burst is drawn in a 700 by 392 reference frame. At 1 that frame is scaled from the font size,
// which keeps the template's proportion between the letters and the darts; a headline-size word then
// throws most darts off the screen in a tick or two. Below 1 the darts, ring, flecks and tremble are
// smaller against the word and stay in view.
const REF_SCALE = { desk: 0.55, phone: 0.42 };

const TYPE_END = BLANK_TICKS + TYPE_TICKS; // wild-type tick at which the warp starts

const T_TYPE = TYPE_END / TYPE_TPS;
const T_WARP = T_TYPE + WARP_TICKS / WARP_TPS;
const T_LAND = T_WARP + REST_TICKS / WARP_TPS;

// The splash must never strand the cover. A heartbeat on a timer ends it when the page has been
// visible this long without the timeline finishing (frames stalled), or after the hard limit.
const STALL_MS = 4000;
const LIMIT_MS = 20000;

// Brand inks only.
const NAVY = "#19203a";
const DEEP = "#0d1322";
const PARCHMENT = "#ecdcc2";
const PAPER = "#e9dcc6";
const BRASS = "#c29f80";
const BRASS_HI = "#e0c19a";
const SEA = "#7293bd";

const THEMES = {
  dark: { ground: DEEP, ink: PARCHMENT, slip: SEA, heat: BRASS, darts: [BRASS, BRASS_HI, SEA, PARCHMENT] },
  light: { ground: PAPER, ink: NAVY, slip: SEA, heat: BRASS, darts: [BRASS, BRASS_HI, SEA, NAVY] },
};

// ---------------------------------------------------------------- the splash

export function playSplash({ host, theme, phone, wordRect, fontFamily, onOpen }) {
  let opened = false;
  let finished = false;
  let raf = 0;
  let heartbeat = 0;
  let wild = null;
  let burst = null;
  let wildCanvas = null;
  let burstCanvas = null;
  let resolveDone = () => {};
  const done = new Promise((resolve) => { resolveDone = resolve; });
  const cleanups = [];

  const open = () => {
    if (opened) return;
    opened = true;
    try {
      if (typeof onOpen === "function") onOpen();
    } catch (error) {
      console.error(error);
    }
  };

  const dropWild = () => {
    if (wild) wild.destroy();
    wild = null;
    if (wildCanvas) wildCanvas.remove();
    wildCanvas = null;
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    clearInterval(heartbeat);
    for (const off of cleanups) {
      try { off(); } catch { /* keep going */ }
    }
    open();
    try { dropWild(); } catch { /* keep going */ }
    try { if (burst) burst.destroy(); } catch { /* keep going */ }
    burst = null;
    if (burstCanvas) burstCanvas.remove();
    burstCanvas = null;
    resolveDone();
  };

  const control = { done, skip: finish };

  try {
    const look = THEMES[theme === "light" ? "light" : "dark"];
    const box = host.getBoundingClientRect();

    // Where the text origin of the real word is. The rect may be the element's own box, which also
    // holds a leading text-indent and the trailing letter-spacing, or a box around the glyph run.
    const size = wordRect.fontSize;
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = `${WEIGHT} ${size}px ${fontFamily}`;
    const advance = probe.measureText(WORD).width + WORD.length * SPACING * size;
    const extra = wordRect.width - advance;
    const left =
      extra > -1 && extra < 0.06 * size
        ? wordRect.left + extra
        : wordRect.left + (wordRect.width - (advance - SPACING * size)) / 2;
    const place = { x: left - box.left, baseline: wordRect.baseline - box.top, fontSize: size };

    const makeCanvas = (z) => {
      const c = document.createElement("canvas");
      c.setAttribute("aria-hidden", "true");
      c.style.cssText =
        `position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;touch-action:pan-y;z-index:${z}`;
      host.appendChild(c);
      return c;
    };
    wildCanvas = makeCanvas(0);
    burstCanvas = makeCanvas(1);

    const maxDpr = phone ? 1.5 : 2;
    const maxPixels = phone ? 1.6e6 : 6.5e6;

    wild = new WildType(wildCanvas, fontFamily, {
      WORDS: [WORD],
      ACCENTS: [look.slip],
      BG: look.ground,
      INK: look.ink,
      OBLIQUE: 0,
      FONT_WEIGHT: WEIGHT,
      LETTER_SPACING: SPACING,
      PLACE: place,
      CURVE_CLAMP: CURVE_CLAMP,
      MAX_DPR: maxDpr,
      MAX_PIXELS: maxPixels,
    });
    burst = new LoudBurst(burstCanvas, fontFamily, {
      SENTENCES: [{ words: [WORD], burst: 0, theme: { inks: look.darts, body: look.ink, burst: look.heat } }],
      PAPER: null,
      INK: look.ink,
      BODY_TINT: 0,
      FPS: BURST_FPS,
      FLECK_COUNT: phone ? 8 : 14,
      LETTER_SPACING: SPACING,
      PLACE: place,
      REF_SCALE: phone ? REF_SCALE.phone : REF_SCALE.desk,
      SEG_MAX_PER_LETTER: phone ? 6 : 16,
      MAX_DPR: maxDpr,
      MAX_PIXELS: maxPixels,
    });
    if (!wild.ok || !burst.ok) throw new Error("splash: no 2d canvas");

    // Each engine drew its still frame when it was built (and the burst engine cut its darts then).
    // Start from the blank ground and an empty burst layer.
    wild.draw(0);
    const bc = burstCanvas.getContext("2d");
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.clearRect(0, 0, burstCanvas.width, burstCanvas.height);

    // On desktop the pointer bends the mesh during the warp.
    let pointerOn = false;
    if (!phone) {
      const onMove = (event) => {
        if (pointerOn && wild) wild.setPointer(event.clientX - box.left, event.clientY - box.top);
      };
      const onLeave = () => { if (wild) wild.setPointer(null, null); };
      window.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("pointerleave", onLeave);
      cleanups.push(() => {
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerleave", onLeave);
      });
    }

    // The placement is measured once: a resize ends the splash.
    const onResize = () => finish();
    window.addEventListener("resize", onResize);
    cleanups.push(() => window.removeEventListener("resize", onResize));

    // Keep the clock across a pause: a hidden tab does not advance it.
    let last = null;
    let clock = 0;
    const onVisibility = () => { last = null; };
    document.addEventListener("visibilitychange", onVisibility);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));

    let landed = false;
    const step = (t) => {
      if (t < T_LAND) {
        const tau = t < T_TYPE ? t * TYPE_TPS : TYPE_END + (t - T_TYPE) * WARP_TPS;
        const want = tau >= TYPE_END && tau < TYPE_END + POINTER_OFF_TICK;
        if (pointerOn && !want) wild.setPointer(null, null);
        pointerOn = want;
        wild.draw(tau);
        return;
      }
      if (!landed) {
        // The word is home. The burst engine takes it; wild type keeps only its ground and grain.
        landed = true;
        pointerOn = false;
        wild.clearPull();
        wild.draw(0);
      }
      const tick = TINT_TICK + Math.floor((t - T_LAND) * BURST_FPS);
      if (tick >= TICKS) {
        finish();
        return;
      }
      burst.frame(tick);
      if (tick >= BURST_TICK && !opened) {
        // The burst instant: the ground goes, the page takes over, the darts fly on a clear canvas.
        dropWild();
        open();
      }
    };

    const loop = (now) => {
      if (finished) return;
      if (last != null) clock += Math.min(100, Math.max(0, now - last));
      last = now;
      try {
        step(clock / 1000);
      } catch (error) {
        console.error(error);
        finish();
        return;
      }
      if (!finished) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const began = performance.now();
    let beat = began;
    let seen = 0;
    heartbeat = setInterval(() => {
      const now = performance.now();
      if (!document.hidden) seen += now - beat;
      beat = now;
      if (seen > STALL_MS || now - began > LIMIT_MS) finish();
    }, 200);
  } catch (error) {
    console.error(error);
    finish();
  }

  return control;
}
