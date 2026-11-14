// changing pages. each tab is its own document, so a change has two halves: this page goes under a
// sheet of water, and the next one comes up through it.
//   desktop  the sheet moves through a cloudy mask (vendor/design-how: text reveal), top-left to
//            bottom-right, and leaves the next page the same way, like one front passing over
//   phones   the same in the cheapest form there is, one sliding mask and no shader (ghosty reveal)
//   the nav  on desktop the mark under the current tab pours across to the one pressed and fuses
//            with it (liquid ui)
// the head script of every page sets .arriving (a css cover) when it was reached this way; whatever
// happens here, that class comes off. nothing runs under reduced motion.
import { createVeil } from "./vendor/design-how/text-reveal.js";
import { MASK_IN, MASK_OUT, rasterMask } from "./vendor/design-how/ghosty-reveal.js";
import { Field, fieldToPath } from "./vendor/design-how/liquid-ui.js";

const hex = (h) => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const tween = (ms, ease, fn) => new Promise((done) => {
  const t0 = performance.now();
  const step = (now) => { const k = Math.min(1, (now - t0) / ms); fn(ease(k)); if (k < 1) requestAnimationFrame(step); else done(); };
  requestAnimationFrame(step);
});
const inOut = (k) => k * k * (3 - 2 * k);
const out = (k) => 1 - Math.pow(1 - k, 2.4);
const here = (p) => p.replace(/index\.html$/, "");

export function startTransit({ root, reduced, phone, seaCanvas, menuIsOpen }) {
  const drop = () => { clearTimeout(window.__arriveT); root.classList.remove("arriving", "clearing", "veiled"); root.style.removeProperty("--veil-mask"); };
  if (reduced) return drop();
  const css = getComputedStyle(root);
  const water = () => ({ top: hex(css.getPropertyValue("--w2").trim()), bottom: hex(css.getPropertyValue("--w4").trim()), edge: hex(css.getPropertyValue("--w0").trim()) });
  let busy = false, veil = null, ghost = null, maskIn = null, pour = null;

  // the scene above the water is ready when sea.js lets its canvas show (it waits for the rendered sky).
  // it would then fade in over .6s; under the sheet nobody sees that, so it is simply shown
  const sceneReady = () => new Promise((done) => {
    const t0 = performance.now();
    const look = () => {
      if (!seaCanvas || seaCanvas.style.opacity === "1" || performance.now() - t0 > 900) {
        if (seaCanvas && seaCanvas.style.opacity === "1") seaCanvas.style.transition = "none";
        return done();
      }
      requestAnimationFrame(look);
    };
    look();
  });

  // ---------- arriving ----------
  async function arrive() {
    try {
      if (phone) {
        root.style.setProperty("--veil-mask", await rasterMask(MASK_OUT));
        await sceneReady();
        clearTimeout(window.__arriveT);
        root.classList.add("clearing");                  // styles.css slides the mask up and the cover lifts off
        await new Promise((r) => setTimeout(r, 640));
      } else {
        veil = createVeil(document.body, water());
        if (veil) {
          veil.draw(1, 0);
          root.classList.add("veiled");
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          clearTimeout(window.__arriveT);
          root.classList.remove("arriving");             // the canvas has taken over from the css cover
          await sceneReady();
          await tween(620, out, (k) => { veil?.draw(1, k); if (k > 0.4) root.classList.remove("veiled"); });
        }
      }
    } catch (e) { console.warn("arrive:", e); }
    veil?.destroy(); veil = null;
    drop();
  }
  if (root.classList.contains("arriving")) arrive();

  // ---------- leaving ----------
  function go(url) {
    try { sessionStorage.setItem("asufiji-nav", String(Date.now())); } catch {}
    location.assign(url);
    setTimeout(reset, 3000);                             // the page never changed (a download, a refused load): give this one back
  }
  function reset() {
    veil?.destroy(); veil = null;
    ghost?.remove(); ghost = null;
    busy = false;
    drop();
    pour?.home();
  }
  async function leave(url, link) {
    busy = true;
    pour?.commit(link);
    if (phone) {
      ghost = document.createElement("div");
      ghost.className = "veil veil-ghost";
      const m = maskIn || `url("${MASK_IN}")`;
      ghost.style.webkitMaskImage = m; ghost.style.maskImage = m;
      document.body.append(ghost);
      await new Promise((r) => { ghost.addEventListener("animationend", r, { once: true }); setTimeout(r, 420); });
    } else {
      veil = createVeil(document.body, water());
      if (veil) {
        root.classList.add("veiled");
        await tween(300, inOut, (k) => veil?.draw(k, 0));
      }
    }
    go(url);
  }
  document.addEventListener("click", (e) => {
    if (busy || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.("a[href]");
    if (!a || a.target || a.hasAttribute("download")) return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin || here(url.pathname) === here(location.pathname)) return;
    if (menuIsOpen?.()) {
      // the open menu is already a sheet of water over the page: leave it up and let the page change behind it
      e.stopPropagation();
      try { sessionStorage.setItem("asufiji-nav", String(Date.now())); } catch {}
      return;
    }
    e.preventDefault();
    leave(url.href, a);
  }, true);
  // back from the history cache: this page was left under its sheet
  addEventListener("pageshow", (e) => { if (e.persisted) reset(); });
  if (phone) setTimeout(() => rasterMask(MASK_IN).then((m) => { maskIn = m; }), 1200);

  // ---------- the nav mark (desktop) ----------
  const rail = document.querySelector(".rail");
  if (!phone && rail) pour = liquidNav(rail, root);
}

function liquidNav(rail, root) {
  const tabs = [...rail.querySelectorAll(".rail-brand, .rail-link")];
  if (!tabs.length) return null;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "rail-pour");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  svg.append(path);
  rail.prepend(svg);
  root.classList.add("liquid");

  const box = (el) => ({ cx: el.offsetLeft + el.offsetWidth / 2, cy: el.offsetTop + el.offsetHeight / 2, hw: el.offsetWidth / 2, hh: el.offsetHeight / 2 });
  const rest = tabs.find((t) => t.getAttribute("aria-current") === "page") || null;
  // the mark at rest under the current tab, and a second body of it that runs to whichever tab is
  // under the pointer. where the two are near each other their fields blend into one shape
  let restAmt = rest ? 1 : 0, restGoal = restAmt, amt = 0, amtGoal = 0, target = null, run = rest ? box(rest) : null, raf = 0, last = 0;
  const draw = () => {
    const shapes = [];
    if (rest && restAmt > 0.02) { const b = box(rest); shapes.push({ cx: b.cx, cy: b.cy, hw: b.hw * (0.6 + 0.4 * restAmt), hh: b.hh * restAmt, r: 8 }); }
    if (run && amt > 0.02) shapes.push({ cx: run.cx, cy: run.cy, hw: run.hw * (0.6 + 0.4 * amt), hh: run.hh * amt, r: 8 });
    path.setAttribute("d", shapes.length ? fieldToPath(new Field(shapes, 9), { cell: 2, smooth: 2 }) : "");
  };
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const k = 1 - Math.exp(-dt * 13), ks = 1 - Math.exp(-dt * 10);
    const to = target ? box(target) : rest ? box(rest) : run;
    let moving = false;
    if (run && to) for (const key of ["cx", "cy", "hw", "hh"]) { const d = to[key] - run[key]; run[key] += d * k; if (Math.abs(d) > 0.3) moving = true; }
    for (const [get, set, goal] of [[() => amt, (v) => { amt = v; }, amtGoal], [() => restAmt, (v) => { restAmt = v; }, restGoal]]) {
      const d = goal - get(); set(Math.abs(d) < 0.004 ? goal : get() + d * ks); if (Math.abs(d) >= 0.004) moving = true;
    }
    draw();
    raf = moving ? requestAnimationFrame(step) : 0;
  };
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } };
  const toward = (tab) => {
    if (tab === rest) { target = null; amtGoal = 0; return kick(); }
    if (amt < 0.05) run = rest ? box(rest) : { ...box(tab) };        // it pours out of the mark at rest, or wells up where it is
    target = tab; amtGoal = 1; kick();
  };
  tabs.forEach((t) => t.addEventListener("pointerenter", () => toward(t)));
  rail.addEventListener("pointerleave", () => { if (restGoal) { target = null; amtGoal = 0; kick(); } });
  addEventListener("resize", () => { draw(); }, { passive: true });
  document.fonts?.ready.then(draw);
  draw();
  return {
    // a tab was pressed: all of it runs to that tab. anything else pressed (the join button): it drains away
    commit(link) {
      restGoal = 0;
      if (tabs.includes(link) && link !== rest) { if (amt < 0.05) run = rest ? box(rest) : { ...box(link) }; target = link; amtGoal = 1; }
      else amtGoal = 0;
      kick();
    },
    home() { restGoal = rest ? 1 : 0; target = null; amtGoal = 0; kick(); },
  };
}
