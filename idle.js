// Work for after the page is up and still: nothing here is needed to show or use the page, and
// main.js imports it only once the load is over. It makes the next thing quick: the next page
// and the next visit (sw.js).

const conn = navigator.connection;
const saving = !!(conn && conn.saveData);         // the visitor asked the browser to spare data
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const here = location.origin + location.pathname;

// ---------- the next visit: sw.js keeps this deploy's files (see the notes at its top) ----------
// not while developing: a local server has no deploys to tell apart. to try it there, set
// localStorage["asufiji-sw"] = "on" and reload
let wantSW = location.protocol === "https:" && !local;
try { if (local && localStorage.getItem("asufiji-sw") === "on") wantSW = true; } catch {}
if (wantSW && "serviceWorker" in navigator) {
  const fresh = !navigator.serviceWorker.controller;   // this page was loaded without it
  navigator.serviceWorker.register(new URL("sw.js", import.meta.url), { updateViaCache: "none" }).then(() => navigator.serviceWorker.ready).then((reg) => {
    if (!fresh || !reg.active) return;
    // hand it the list of what this page has loaded, so the next visit is already quick
    const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.startsWith(location.origin + "/"));
    reg.active.postMessage({ type: "seed", page: here, urls: [...new Set(urls)] });
  }).catch(() => {});
}

// ---------- the next page ----------
// its html is fetched when a tap or a click on a link to it begins (and for the Join page, the one
// most visitors open next, straight away). an ordinary fetch leaves the page in the browser's own
// cache, where the navigation finds it: the same in every browser, and nothing is run or drawn early
const pages = new Map();                          // address without query or hash -> the links to it
for (const a of document.querySelectorAll("a[href]")) {
  if (a.origin !== location.origin || a.target === "_blank" || a.search || a.hasAttribute("download")) continue;
  const u = a.origin + a.pathname;
  if (u === here || !/(\/|\.html)$/.test(a.pathname)) continue;
  if (!pages.has(u)) pages.set(u, []);
  pages.get(u).push(a);
}
if (pages.size && !saving) {
  const got = new Set();
  const warm = (u) => { if (got.has(u)) return; got.add(u); fetch(u, { credentials: "same-origin" }).catch(() => {}); };
  const join = [...pages.keys()].find((u) => /\/join\.html$/.test(u));
  if (join) warm(join);
  for (const [u, links] of pages) {
    for (const a of links) {
      a.addEventListener("touchstart", () => warm(u), { passive: true, once: true });
      a.addEventListener("mousedown", () => warm(u), { passive: true, once: true });
    }
  }
}
