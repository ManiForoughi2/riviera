// the chart room (internships.html and faq.html only). main.js runs the site's own chrome, hero and
// splash; this file only moves the things on the sheet: the compass, the brass catching the light,
// the reading glass, and the bar taking its lacquer once the sheet is behind it.

const root = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePtr = matchMedia("(hover: hover) and (pointer: fine)").matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// style writes go through here: skipped when the value hasn't moved
const setVar = (el, k, v) => {
  const c = el._sv || (el._sv = {});
  if (c[k] !== v) { c[k] = v; el.style.setProperty(k, v); }
};

const sheet = $(".sheet");
const cards = $$(".c-card");
const compasses = $$(".compass");

// ---------- the bar: lacquer once the solid part of the sheet has reached it ----------
function chrome() {
  if (!sheet) return;
  root.classList.toggle("on-sheet", sheet.getBoundingClientRect().top < 66);
}

// ---------- the compass: a damped card. scrolling drags it, a flick spins it, and it always finds north again ----------
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
compasses.forEach((el) => {
  if (reduced) return;
  // drag the card round by hand (mouse or pen), or tap it for a spin
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
    if (moved < 3) kick((e.clientX > el.getBoundingClientRect().left + el.offsetWidth / 2 ? 1 : -1) * 520);
    wake();
  };
  el.addEventListener("pointerup", letGo);
  el.addEventListener("pointercancel", letGo);
  el.addEventListener("click", (e) => { if (e.pointerType === "touch" || !finePtr) kick((Math.random() < 0.5 ? -1 : 1) * 520); });
});
// the day / night switch gives it a nudge too
$(".theme-toggle")?.addEventListener("click", () => kick(root.getAttribute("data-theme") === "light" ? -260 : 260));

// ---------- the brass and the glass catch the light from wherever the pointer is ----------
let px = -1, py = -1, lit = null, litWant = null, lightDirty = false;
if (finePtr && compasses.length) addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; lightDirty = true; wake(); }, { passive: true });
function stepLight() {
  if (px < 0) return false;
  if (lightDirty) {
    lightDirty = false;
    litWant = compasses.map((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return null;
      const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2);
      return { a: Math.atan2(dx, -dy) * 180 / Math.PI, gx: clamp(dx / 520, -1, 1), gy: clamp(dy / 520, -1, 1) };
    });
    if (!lit) lit = litWant.map((w) => w && { ...w });
  }
  if (!litWant) return false;
  let moving = false;
  compasses.forEach((el, i) => {
    const w = litWant[i]; if (!w) return;
    const c = lit[i] || (lit[i] = { ...w });
    let d = w.a - c.a; d = ((d + 180) % 360 + 360) % 360 - 180;
    c.a += d * 0.14; c.gx += (w.gx - c.gx) * 0.14; c.gy += (w.gy - c.gy) * 0.14;
    if (Math.abs(d) > 0.3 || Math.abs(w.gx - c.gx) > 0.004 || Math.abs(w.gy - c.gy) > 0.004) moving = true;
    setVar(el, "--lit", c.a.toFixed(1) + "deg");
    setVar(el, "--gx", c.gx.toFixed(3));
    setVar(el, "--gy", c.gy.toFixed(3));
  });
  return moving;
}

// ---------- one rAF loop; it sleeps whenever nothing is moving ----------
let raf = 0, prev = 0;
function loop(now) {
  raf = 0;
  const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0.016;
  prev = now;
  const a = stepSpring(dt);
  const b = stepLight();
  if (a || b || lightDirty) raf = requestAnimationFrame(loop); else prev = 0;
}
function wake() { if (!raf) raf = requestAnimationFrame(loop); }

let lastY = scrollY;
addEventListener("scroll", () => {
  const y = scrollY, dy = y - lastY;
  lastY = y;
  chrome();
  // the sheet moving under the compass drags the card with it; the further off north, the less it gives
  if (!reduced && cards.length && !held) { vel = clamp(vel - dy * 0.55 * (1 - Math.min(1, Math.abs(ang) / 75)), -900, 900); wake(); }
}, { passive: true });
addEventListener("resize", chrome, { passive: true });
chrome();

// ---------- the reading glass over the plan (mouse only) ----------
if (finePtr) $$(".plan").forEach((plan) => {
  const host = plan.parentElement, page = $(".plan-sheet", plan);
  if (!host || !page) return;
  const Z = 2.1;
  let glass = null, ink = null, on = false;
  const make = () => {
    glass = document.createElement("div"); glass.className = "loupe"; glass.setAttribute("aria-hidden", "true");
    glass.innerHTML = '<div class="loupe-glass"><div class="loupe-ink"></div></div>';
    ink = glass.firstChild.firstChild;
    host.append(glass);
  };
  const show = (v) => { if (v !== on) { on = v; host.classList.toggle("is-looking", v); } };
  host.addEventListener("pointermove", (e) => {
    const pr = plan.getBoundingClientRect();
    // only where the engraving is at full strength: clear of the feathered top and the faded foot
    const inside = e.clientX >= pr.left && e.clientX <= pr.right && e.clientY >= pr.top + pr.height * 0.2 && e.clientY <= pr.bottom - pr.height * 0.3;
    if (!inside || e.target.closest("a, button, .compass")) return show(false);
    if (!glass) make();
    const hr = host.getBoundingClientRect(), sr = page.getBoundingClientRect();
    ink.style.width = (sr.width * Z).toFixed(0) + "px"; ink.style.height = (sr.height * Z).toFixed(0) + "px";
    glass.style.setProperty("--lx", (e.clientX - hr.left).toFixed(1) + "px");
    glass.style.setProperty("--ly", (e.clientY - hr.top).toFixed(1) + "px");
    // the point under the pointer sits at the middle of the glass (91px is its inner radius)
    ink.style.setProperty("--ix", (91 - (e.clientX - sr.left) * Z).toFixed(1) + "px");
    ink.style.setProperty("--iy", (91 - (e.clientY - sr.top) * Z).toFixed(1) + "px");
    show(true);
  });
  host.addEventListener("pointerleave", () => show(false));
});
