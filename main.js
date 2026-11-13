import { startSea } from "./sea.js?v=de93a382";

const root = document.documentElement;
root.classList.add("js");                         // the head script waits for this before trusting its opening state
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const theme = () => (root.getAttribute("data-theme") === "light" ? "light" : "dark");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// browser chrome colour: the sky while the page is at the surface
const BAR = { dark: "#0d1322", light: "#e9dcc6" };

// ---------- the surface: WebGL sky and sea that reflect the real page title ----------
const heroEl = document.querySelector(".hero");
const seaCanvas = document.getElementById("sea");
const sea = seaCanvas ? startSea(seaCanvas, { getTheme: theme, reduced, hero: heroEl, word: document.querySelector(".word:not(.word-refl)") }) : null;
// the title face may land after the first paint; repaint the reflection with the real letters
document.fonts?.ready.then(() => sea?.redraw());
if (sea) heroEl.classList.add("gl-sea");
// the reflection ripple is SMIL; freeze it for reduced motion
if (reduced) document.querySelector("svg")?.pauseAnimations?.();

// ---------- theme follows the device setting ----------
const themeMeta = document.querySelector('meta[name="theme-color"]');
const scheme = matchMedia("(prefers-color-scheme: light)");
const toggle = document.querySelector(".theme-toggle");
function applyTheme(t) {
  root.setAttribute("data-theme", t);
  if (themeMeta) themeMeta.content = BAR[t];
  toggle?.setAttribute("aria-label", t === "dark" ? "Switch to day" : "Switch to night");
  sea?.redraw();
}
// phones always follow the phone's own setting; the saved pick is desktop-only
const phoneTheme = matchMedia("(max-width: 760px), (hover: none) and (pointer: coarse)");
function savedTheme() {
  if (phoneTheme.matches) return null;
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

// ---------- kinetic type ----------
// .motion marks "scripts ran and motion is welcome". the headings are split into words here;
// css then ties each word to its own place on screen (see focusPull in styles.css), so there
// is no observer and no timer that could leave a heading hidden
if (!reduced) {
  root.classList.add("motion");
  document.querySelectorAll(".kinetic").forEach((el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    words.forEach((word, i) => {
      const s = document.createElement("span");
      s.className = "w";
      s.style.setProperty("--wi", i);
      s.textContent = word;
      el.append(s);
      if (i < words.length - 1) el.append(" ");
    });
  });
}

// ---------- film: a loop plays only while it is on screen ----------
// every loop sits on its own still (an <img> under the <video>), so nothing flashes dark while
// it starts and the frame looks right when it never plays. phones run at most two at once,
// the two nearest the middle of the screen
const phoneMQ = matchMedia("(max-width: 760px), (hover: none) and (pointer: coarse)");
const films = [...document.querySelectorAll(".deep video")];
const seen = new Set();
let filmQueued = false;
const syncFilms = () => {
  filmQueued = false;
  const live = !reduced && document.visibilityState === "visible";
  let want = live ? [...seen] : [];
  if (want.length > 2 && phoneMQ.matches) {
    const mx = innerWidth / 2, my = innerHeight / 2;
    const dist = (v) => { const r = v.getBoundingClientRect(); return Math.hypot(r.left + r.width / 2 - mx, r.top + r.height / 2 - my); };
    want = want.map((v) => [dist(v), v]).sort((a, b) => a[0] - b[0]).slice(0, 2).map((p) => p[1]);
  }
  for (const v of films) {
    const on = want.includes(v);
    if (on && v.paused) v.play().catch(() => {});
    else if (!on && !v.paused) v.pause();
  }
};
const queueFilms = () => { if (!filmQueued) { filmQueued = true; requestAnimationFrame(syncFilms); } };
if (films.length && "IntersectionObserver" in window) {
  const fio = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? seen.add(e.target) : seen.delete(e.target);
    queueFilms();
  }, { threshold: 0.25 });
  films.forEach((v) => fio.observe(v));
  document.addEventListener("visibilitychange", queueFilms);
  document.querySelector(".strips")?.addEventListener("scroll", queueFilms, { passive: true });
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

// ---------- one rAF scroll loop: where the camera is, and everything that drifts with it ----------
const deep = document.querySelector(".deep");
const rays = document.querySelector(".rays");
const motes = document.querySelector(".rays b");
let cursorX = 0.5;                                // 0 at the left edge, 1 at the right: the light leans toward it
const drift = [                                   // [element, how far it travels across the screen in px]
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
let queued = false, state = "";
function frame() {
  queued = false;
  const vh = innerHeight, y = scrollY;
  const top = deep ? deep.offsetTop : 0;          // where the water starts = the header's height

  // chrome: bare at the very top, sky glass while the header holds, water once the surface passes it
  const s = (y < 8 ? "at-top " : "") + (y > top - 72 ? "under" : "over");
  if (s !== state) {
    state = s;
    root.classList.toggle("at-top", y < 8);
    root.classList.toggle("under", y > top - 72);
    root.classList.toggle("over", y <= top - 72);
  }
  if (!deep) return;

  // 0 at the surface, 1 on the sand: the shafts of light thin out on the way down
  const span = Math.max(1, deep.offsetHeight - vh);
  setVar(deep, "--depth", clamp((y - top + vh) / (span + vh), 0, 1).toFixed(3));

  if (reduced || phoneMQ.matches) return;
  if (rays) setVar(rays, "--cx", cursorX.toFixed(2));
  if (motes) setVar(motes, "--my", (-((y * 0.3) % 620)).toFixed(1) + "px");
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
const queue = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
addEventListener("scroll", queue, { passive: true });
addEventListener("resize", queue, { passive: true });
if (!reduced && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  addEventListener("pointermove", (e) => { cursorX = e.clientX / innerWidth; queue(); }, { passive: true });
}
frame();

// ---------- club 1848: back from stripe checkout ----------
const slip = document.querySelector(".slip");
if (slip && new URLSearchParams(location.search).has("joined")) {
  slip.classList.add("is-joined");
  slip.querySelector(".slip-done").hidden = false;
  history.replaceState(null, "", location.pathname);
  addEventListener("load", () => slip.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" }));
}

// ---------- magnetic buttons ----------
if (!reduced && matchMedia("(hover: hover) and (pointer: fine)").matches) {
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
