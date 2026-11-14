// changing pages. each tab is its own document, so a change has two halves: this page goes under a
// sheet of water, and the next one comes up through it.
//   desktop  the sheet moves through a cloudy mask (vendor/design-how: text reveal), top-left to
//            bottom-right, and leaves the next page the same way, like one front passing over
//   phones   the same in the cheapest form there is, one sliding mask and no shader (ghosty reveal)
// the head script of every page sets .arriving (a css cover) when it was reached this way; whatever
// happens here, that class comes off. nothing runs under reduced motion.
import { createVeil } from "./vendor/design-how/text-reveal.js";
import { MASK_IN, MASK_OUT, rasterMask } from "./vendor/design-how/ghosty-reveal.js";

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
  let busy = false, veil = null, ghost = null, maskIn = null;

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
  }
  async function leave(url) {
    busy = true;
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
    leave(url.href);
  }, true);
  // back from the history cache: this page was left under its sheet
  addEventListener("pageshow", (e) => { if (e.persisted) reset(); });
  if (phone) setTimeout(() => rasterMask(MASK_IN).then((m) => { maskIn = m; }), 1200);

}
