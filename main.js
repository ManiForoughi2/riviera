import { startSea } from "./sea.js?v=ac1a7e9c";
import { startWater } from "./under.js?v=ac1a7e9c";

const root = document.documentElement;
root.classList.add("js");                         // the head script waits for this before trusting its opening state
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const theme = () => (root.getAttribute("data-theme") === "light" ? "light" : "dark");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const phoneMQ = matchMedia("(max-width: 760px), (hover: none) and (pointer: coarse)");
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

// browser chrome colour: the top of the sky
const BAR = { dark: "#000822", light: "#6b7f93" };

// ---------- the surface: WebGL sky and sea that reflect the real page title ----------
const heroEl = document.querySelector(".hero");
const wordEl = document.querySelector(".word:not(.word-refl)");
const seaCanvas = document.getElementById("sea");
const sea = seaCanvas ? startSea(seaCanvas, { getTheme: theme, reduced, hero: heroEl, word: wordEl }) : null;
// the title face may land after the first paint; repaint the reflection with the real letters
document.fonts?.ready.then(() => sea?.redraw());
if (sea) heroEl.classList.add("gl-sea");
// the reflection ripple is SMIL; freeze it for reduced motion. and with the webgl sea running
// nothing shows it at all (the css reflection is display: none), so its clock is stopped: left
// running, it asks the browser for a frame sixty times a second on every page, forever
if (reduced || sea) document.querySelector("svg")?.pauseAnimations?.();

// ---------- under the surface: the lit water (under.js) ----------
const deep = document.querySelector(".deep");
const waterCanvas = document.querySelector(".water");
let water = null;
// on touch the crossing follows the finger; with a wheel or trackpad it is a short event of its own
const touchDive = phoneMQ.matches;
let plunged = false, queued = false;
const queue = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
if (deep && waterCanvas) {
  // home: going under is an event the page triggers (see the scroll loop). the shorter pages keep
  // the waterline tied to the scroll, because their water is already on screen at rest
  const dive = !root.classList.contains("sub") && !!document.querySelector(".overture");
  root.classList.add("gl-water");
  if (dive) root.classList.add("dive");
  water = startWater(waterCanvas, {
    deep, reduced, phone: phoneMQ.matches, dive, follow: touchDive,
    // while the water is over the whole screen the hero behind it is not drawn (it is still pinned there)
    onCover: (c, now) => sea?.setCovered(c, now),
    // the camera sinks with the wash: the hero sea's eye drops to the surface as the line comes over the lens
    onPlunge: (e) => {
      sea?.setEye(1 - 0.9 * e);
      // the scene above leaves by exactly as much as the water has come over it: one motion, not two clocks
      // (it starts a moment after the line does: until the line has cleared its own deepest trough, the
      // scene's bottom edge stays on the bottom of the screen, so nothing can show under it)
      if (!reduced) { const k = Math.max(0, (e - 0.1) / 0.9); heroEl.style.setProperty("--dp", (k * k * (3 - 2 * k)).toFixed(4)); }
      if (!touchDive) return;
      // touch: the chrome changes sides halfway
      if ((e > 0.5) !== plunged) { plunged = e > 0.5; root.classList.toggle("plunged", plunged); queue(); }
    },
  });
  if (!water) root.classList.remove("gl-water", "dive");
  else if (dive) { if (touchDive) root.classList.add("follow"); water.redraw(); }
  window.__water = water;                         // read by hand when checking frame times
}

// the light under the water comes from where the hero's sun or moon stands (sea.js publishes both
// on the title once its sky has loaded)
function aimLight() {
  if (!water || !wordEl) return;
  const v = parseFloat(wordEl.style.getPropertyValue(theme() === "light" ? "--hw-sun-x" : "--hw-moon-x"));
  water.setSun((wordEl.getBoundingClientRect().left + v) / innerWidth);
}
aimLight();
[400, 1500, 4000].forEach((ms) => setTimeout(aimLight, ms));
addEventListener("resize", aimLight, { passive: true });

// ---------- theme follows the device setting ----------
const themeMeta = document.querySelector('meta[name="theme-color"]');
const scheme = matchMedia("(prefers-color-scheme: light)");
const toggle = document.querySelector(".theme-toggle");
// a theme change dissolves the whole page on the same clock as the sky going from sun to moon
// (1.1s, the sea's own crossfade), so nothing below the hero flips while the scene is still turning
function applyTheme(t) {
  if (reduced || !document.startViewTransition) return setTheme(t);
  root.classList.add("theming");
  let vt;
  try { vt = document.startViewTransition(() => setTheme(t)); } catch { root.classList.remove("theming"); return setTheme(t); }
  vt.finished.finally(() => root.classList.remove("theming"));
}
function setTheme(t) {
  root.setAttribute("data-theme", t);
  if (themeMeta) themeMeta.content = BAR[t];
  toggle?.setAttribute("aria-label", t === "dark" ? "Switch to day" : "Switch to night");
  sea?.redraw();
  water?.redraw();
  aimLight();
}
// phones always follow the phone's own setting; the saved pick is desktop-only
function savedTheme() {
  if (phoneMQ.matches) return null;
  try { const t = localStorage.getItem("asufiji-theme"); return t === "light" || t === "dark" ? t : null; } catch { return null; }
}
// the device setting wins until someone picks a theme with the switch
scheme.addEventListener?.("change", () => { if (!savedTheme()) applyTheme(scheme.matches ? "light" : "dark"); });
toggle?.addEventListener("click", () => {
  const next = theme() === "dark" ? "light" : "dark";
  try { localStorage.setItem("asufiji-theme", next); } catch {}
  applyTheme(next);
});
toggle?.setAttribute("aria-label", theme() === "dark" ? "Switch to day" : "Switch to night");
if (themeMeta) themeMeta.content = BAR[theme()];

// ---------- splash: FIJI types in, goes wild, lands on the real title and bursts the page open ----------
// the engines are ports of two design.how vault skills (vendor/design-how). the head script set
// .splash and its css cover; from here this owns it, and whatever happens the class comes off
if (root.classList.contains("splash")) {
  const open = () => root.classList.remove("splash");
  (async () => {
    let stage = null;
    try {
      stage = document.createElement("div");
      stage.className = "splash-stage";
      stage.setAttribute("aria-hidden", "true");
      document.body.append(stage);
      const [mod] = await Promise.all([
        import("./vendor/design-how/splash.js"),
        Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 700))]),
      ]);
      // two frames, so sea.js has fitted the title between the islands before it is measured
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!root.classList.contains("splash")) throw new Error("late");
      clearTimeout(window.__splashT);
      const r = wordEl.getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(wordEl).fontSize);
      const run = mod.playSplash({
        host: stage, theme: theme(), phone: phoneMQ.matches,
        wordRect: { left: r.left, top: r.top, width: r.width, height: r.height, fontSize: fs, baseline: r.top + fs * 0.87 },
        fontFamily: getComputedStyle(wordEl).fontFamily,
        onOpen: open,
      });
      // any click, tap, key or scroll skips it
      const skip = () => run.skip();
      const evs = ["pointerdown", "keydown", "wheel", "touchmove"];
      evs.forEach((ev) => addEventListener(ev, skip, { passive: true, once: true }));
      await run.done;
      evs.forEach((ev) => removeEventListener(ev, skip));
    } catch (e) { if (e.message !== "late") console.warn("splash:", e); }
    open();
    stage?.remove();
  })();
}

// ---------- headings arrive once, through the water (desktop) ----------
// each big heading waits behind a refraction filter: its three colours bent by different amounts,
// the way glass splits them (the per-channel split is the idea in design.how/vault/glass-type, MIT).
// the first time it is well inside the screen it settles to rest, the filter is removed, and it
// never plays again. phones skip this: the type is simply there
const SVGNS = "http://www.w3.org/2000/svg";
const fx = document.createElementNS(SVGNS, "svg");
fx.setAttribute("width", "0"); fx.setAttribute("height", "0"); fx.setAttribute("aria-hidden", "true");
fx.style.position = "absolute";
const split = (pre, scales) => scales.map((s, i) => `<feDisplacementMap in="SourceGraphic" in2="${pre}" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="d${i}"/>`).join("")
  + `<feColorMatrix in="d0" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/>`
  + `<feColorMatrix in="d1" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g"/>`
  + `<feColorMatrix in="d2" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b"/>`
  + `<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/>`;
const refract = (id, s) => `<filter id="${id}" x="-6%" y="-45%" width="112%" height="190%" color-interpolation-filters="sRGB">`
  + `<feTurbulence type="fractalNoise" baseFrequency="0.005 0.017" numOctaves="2" seed="11" result="n"/>${split("n", [s * 1.24, s, s * 0.76])}</filter>`;
const WAIT = 52;                                  // px of bend while a heading waits
if (!reduced && finePointer && !phoneMQ.matches && "IntersectionObserver" in window) {
  const heads = [...document.querySelectorAll(".kinetic")];
  if (heads.length) {
    fx.innerHTML = refract("fx-wait", WAIT);
    document.body.append(fx);
    let n = 0;
    const settle = (el) => {
      const id = "fx-" + (++n);
      const holder = document.createElementNS(SVGNS, "g");
      holder.innerHTML = refract(id, WAIT);
      const f = holder.firstChild;
      fx.append(f);
      const maps = [...f.querySelectorAll("feDisplacementMap")];
      el.style.filter = `url(#${id})`;
      const t0 = performance.now(), dur = 1500;
      const step = (now) => {
        const k = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 3), s = WAIT * (1 - e);
        maps[0].setAttribute("scale", (s * 1.24).toFixed(2)); maps[1].setAttribute("scale", s.toFixed(2)); maps[2].setAttribute("scale", (s * 0.76).toFixed(2));
        el.style.opacity = (0.62 + 0.38 * e).toFixed(3);
        if (k < 1) return requestAnimationFrame(step);
        el.style.filter = ""; el.style.opacity = ""; el.classList.remove("is-waiting"); el.classList.add("is-home");
        f.remove();
      };
      requestAnimationFrame(step);
    };
    // "well inside": most of the heading within the middle of the screen, not its first edge at the bottom
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        settle(e.target);
      }
    }, { rootMargin: "-12% 0px -22% 0px", threshold: 0.6 });
    heads.forEach((el) => { el.classList.add("is-waiting"); el.style.filter = "url(#fx-wait)"; io.observe(el); });
  }
}

// ---------- film ----------
// every loop sits on its own first frame (an <img> under the <video>), so starting, pausing and
// coming back never shows a jump. a shot plays while it is in the middle of the screen, not from
// the moment its edge appears
const shots = [...document.querySelectorAll(".shot-film video, .relic-film video")];
if (shots.length && "IntersectionObserver" in window) {
  const mid = new Set();
  const sync = () => {
    const live = !reduced && document.visibilityState === "visible";
    for (const v of shots) {
      const on = live && mid.has(v);
      if (on && v.paused) v.play().catch(() => {});
      else if (!on && !v.paused) v.pause();
    }
  };
  const sio = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? mid.add(e.target) : mid.delete(e.target);
    sync();
  }, { rootMargin: "-22% 0px -22% 0px" });
  shots.forEach((v) => sio.observe(v));
  document.addEventListener("visibilitychange", sync);
  setInterval(sync, 2000);                        // a refused or interrupted play() gets another go
}
// the three tall cuts: every one that is on screen plays, each a plain loop of full-length shots
// that restarts on a clean cut. a slow watchdog restarts anything that should be playing and is not
const strips = [...document.querySelectorAll(".strip video")];
if (strips.length && !reduced && "IntersectionObserver" in window) {
  const near = new Set();
  const tick = () => {
    const live = document.visibilityState === "visible";
    for (const v of strips) {
      v.loop = true;
      if (live && near.has(v)) { if (v.paused) v.play().catch(() => {}); }
      else if (!v.paused) v.pause();
    }
  };
  const stio = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? near.add(e.target) : near.delete(e.target);
    tick();
  }, { threshold: 0.35 });
  strips.forEach((v) => stio.observe(v));
  document.addEventListener("visibilitychange", tick);
  setInterval(tick, 1500);
  // the panes' sway and sheen are css animations, and the sheen restyles and repaints its pane on
  // every frame wherever the page is. more than a screen away they are paused; when a pane comes
  // back within a screen each is put on its own clock again (the start time it always had), so it
  // is exactly where it would have been had it never stopped. (a second in, so they have started)
  if (typeof CSSAnimation !== "undefined" && Element.prototype.getAnimations) {
    const hold = new IntersectionObserver((entries) => {
      for (const e of entries) for (const a of e.target.getAnimations({ subtree: true })) {
        if (!(a instanceof CSSAnimation)) continue;
        if (e.isIntersecting) { if (a.playState === "paused" && a._t0 != null) a.startTime = a._t0; }
        else if (a.playState === "running" && a.startTime != null) { a._t0 = a.startTime; a.pause(); }
      }
    }, { rootMargin: "100% 0px" });
    setTimeout(() => strips.forEach((v) => hold.observe(v.parentElement)), 1000);
  }
}

// ---------- sign-in shell: accounts aren't live yet, so say so on submit ----------
document.querySelectorAll("form.login").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    form.querySelector(".login-msg").textContent = form.dataset.msg || "Sign-in opens soon.";
  });
});

// ---------- phone menu ----------
const rail = document.querySelector(".rail");
const menuBtn = document.querySelector(".rail-menu");
const phoneNav = matchMedia("(max-width: 760px), (max-height: 500px) and (pointer: coarse)");
let menuOpen = false;
function setMenu(open) {
  if (!rail || !menuBtn || open === menuOpen) return;
  menuOpen = open;
  const hadFocus = rail.contains(document.activeElement);
  rail.classList.toggle("open", open);
  root.classList.toggle("menu-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.textContent = open ? "Close" : "Menu";
  // everything but the rail goes inert, which also keeps tab focus inside the menu
  for (const el of document.body.children) if (el !== rail) el.inert = open;
  if (open) rail.querySelector(".rail-link")?.focus({ preventScroll: true });
  else if (hadFocus) menuBtn.focus({ preventScroll: true });
}
const closeMenu = () => setMenu(false);
menuBtn?.addEventListener("click", () => setMenu(!menuOpen));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menuOpen) { e.preventDefault(); closeMenu(); } });
// close on any link tap in the rail (same-page anchors don't navigate)
rail?.addEventListener("click", (e) => { if (e.target.closest("a")) closeMenu(); });
phoneNav.addEventListener?.("change", closeMenu);
addEventListener("pageshow", closeMenu);

// ---------- one rAF scroll loop: where the camera is, and the film drifting in its frames ----------
// everything here follows the scroll position continuously (zero at mid-screen); nothing is triggered
const drift = [                                   // [element, travel across the screen in px, twin]
  ...[...document.querySelectorAll(".shot-film")].map((el) => [el.querySelector("video"), 56, el.querySelector("img")]),
  ...[...document.querySelectorAll(".strip")].map((el, i) => [el, [-34, 46, -70][i % 3]]),
  ...[...document.querySelectorAll(".relic-film")].map((el) => [el, 40]),
];
const copies = [...document.querySelectorAll(".shot-copy")];
// style writes go through here: skipped when the value hasn't moved
const setVar = (el, k, v) => {
  const c = el._sv || (el._sv = {});
  if (c[k] !== v) { c[k] = v; el.style.setProperty(k, v); }
};
let state = "";
// home, with a wheel or trackpad: a short way into the scroll the camera goes under, and comes back up
// near the top. this runs in the scroll event itself, before the frame is drawn, so the water is never
// drawn for a page that has already moved on without it (a key, an anchor or a dragged scrollbar can
// move the page a whole screen between two frames)
let heroH = 0;
function crossing() {
  if (touchDive || !water || !root.classList.contains("dive")) return;
  const y = scrollY, hh = heroH || (heroH = heroEl.offsetHeight);
  if (!plunged && y > Math.max(64, hh * 0.08)) { plunged = true; water.setPlunge(1); root.classList.add("plunged"); }
  else if (plunged && y < Math.max(34, hh * 0.04)) { plunged = false; water.setPlunge(0); root.classList.remove("plunged"); }
}
function frame() {
  queued = false;
  const vh = innerHeight, y = scrollY;
  const top = deep ? deep.offsetTop : 0;          // where the water starts = the header's height

  // chrome: bare at the very top, sky glass while the header holds, water once the surface passes it
  // home: a short way into the scroll the camera goes under, by itself and all the way; it comes back
  // up the same way near the top. the two thresholds are apart so it cannot flutter between them
  const diving = root.classList.contains("dive");
  crossing();
  const under = diving ? plunged : y > top - 72;
  const s = (y < 8 ? "at-top " : "") + (under ? "under" : "over");
  if (s !== state) {
    state = s;
    root.classList.toggle("at-top", y < 8);
    root.classList.toggle("under", under);
    root.classList.toggle("over", !under);
  }
  // the camera sinks: the hero sea's eye drops toward the water as the surface comes up the screen
  if (!diving && sea && top > 0 && y < top * 1.2) sea.setEye(1 - 0.9 * Math.pow(clamp(y / top, 0, 1), 0.8));
  if (reduced || phoneMQ.matches) return;
  // every read first, then every write
  const boxes = drift.map(([el]) => el.getBoundingClientRect());
  const cboxes = copies.map((el) => el.parentElement.getBoundingClientRect());
  drift.forEach(([el, amt, twin], i) => {
    const r = boxes[i];
    if (r.bottom < -200 || r.top > vh + 200) return;
    const off = clamp((r.top + r.height / 2 - vh / 2) / vh, -1.2, 1.2);
    const v = (off * -amt).toFixed(1) + "px";
    setVar(el, "--py", v);
    if (twin) setVar(twin, "--py", v);
  });
  copies.forEach((el, i) => {
    const r = cboxes[i];
    if (r.bottom < 0 || r.top > vh) return;
    setVar(el, "--ty", (clamp((r.top + r.height / 2 - vh / 2) / vh, -1, 1) * 46).toFixed(1) + "px");
  });
}
addEventListener("scroll", () => { crossing(); queue(); }, { passive: true });
addEventListener("resize", () => { heroH = 0; queue(); }, { passive: true });
frame();

// ---------- smooth wheel ----------
// a mouse wheel notch moves the page a little less far and eases into it, so nothing is jumped past.
// the page still scrolls natively (this only decides where to), so sticky parts, anchors, the keyboard
// and every scroll listener work as before. a trackpad already sends a smooth stream of its own: its
// small deltas are followed almost directly, never eased twice. touch is left alone, and so is
// reduced motion
if (!reduced && finePointer && !phoneMQ.matches) {
  let goal = scrollY, cur = scrollY, rate = 8, moving = false, last = 0;
  const limit = () => document.documentElement.scrollHeight - innerHeight;
  // where there is lit water its loop calls step first thing each frame, so the page moves and the
  // water is drawn where the page now is, in the same frame. elsewhere step keeps its own time
  const onWater = () => !!(water && water.live);
  const step = (now) => {
    const dt = Math.min(0.05, Math.max(0, now - last) / 1000); last = now;
    cur += (goal - cur) * (1 - Math.exp(-dt * rate));
    if (Math.abs(goal - cur) < 0.5) { cur = goal; moving = false; }
    scrollTo(0, cur);
    frame();                                      // and everything tied to the scroll moves with it, not a frame later
    if (!moving) { if (water) water.pre = null; return; }
    if (onWater()) water.pre = step;
    else { if (water) water.pre = null; requestAnimationFrame(step); }
  };
  addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey || e.defaultPrevented || menuOpen || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    // anything that scrolls on its own inside the page keeps its wheel
    for (let n = e.target; n && n !== document.documentElement; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return;
    }
    e.preventDefault();
    const px = e.deltaY * (e.deltaMode === 1 ? 34 : e.deltaMode === 2 ? innerHeight : 1);
    const notch = e.deltaMode !== 0 || Math.abs(px) >= 60;     // a wheel click, not a trackpad stream
    const now = performance.now();
    const stalled = moving && now - last > 250;   // the loop that was carrying it stopped (a hidden tab, a lost context)
    if (!moving || stalled) cur = goal = scrollY;
    goal = clamp(goal + px * (notch ? 0.72 : 1), 0, limit());
    rate = notch ? 7.5 : 26;
    if (!moving || stalled) {
      moving = true; last = now;
      if (onWater()) water.pre = step; else { if (water) water.pre = null; requestAnimationFrame(step); }
    }
  }, { passive: false });
  // the keyboard, an anchor or a dragged scrollbar moved the page: take it from there
  addEventListener("scroll", () => { if (moving && Math.abs(scrollY - cur) > 3) { cur = goal = scrollY; moving = false; if (water) water.pre = null; } }, { passive: true });
  root.style.scrollBehavior = "auto";
}

// ---------- club 1848: back from stripe checkout ----------
const slip = document.querySelector(".slip");
if (slip && new URLSearchParams(location.search).has("joined")) {
  slip.classList.add("is-joined");
  slip.querySelector(".slip-done").hidden = false;
  history.replaceState(null, "", location.pathname);
  addEventListener("load", () => slip.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" }));
}

// ---------- magnetic buttons ----------
if (!reduced && finePointer) {
  document.querySelectorAll(".magnetic").forEach((btn) => {
    let box = null;
    btn.addEventListener("pointerenter", () => { box = btn.getBoundingClientRect(); });
    btn.addEventListener("pointermove", (e) => {
      if (!box) box = btn.getBoundingClientRect();
      btn.style.setProperty("--mx", ((e.clientX - (box.left + box.width / 2)) * 0.22).toFixed(2) + "px");
      btn.style.setProperty("--my", ((e.clientY - (box.top + box.height / 2)) * 0.32).toFixed(2) + "px");
    });
    btn.addEventListener("pointerleave", () => {
      box = null;
      btn.style.setProperty("--mx", "0px");
      btn.style.setProperty("--my", "0px");
    });
  });
}
