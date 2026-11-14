// asufiji.com service worker: a second visit, and going from page to page, without the round trips.
//
// GitHub Pages lets a browser keep a file for ten minutes and then makes it ask again, file by file
// (and after any deploy, download every one again). This worker keeps the files of the current
// deploy and answers from them at once. It never answers for a page itself: html always takes the
// browser's ordinary path to the server, so a new deploy is seen on the next page load, as before.
//
// How it stays exact across deploys:
//   - GitHub Pages stamps every file of a deploy with the time of that deploy (Last-Modified, the
//     same to within a second or two for every file). That time is the deploy's name here.
//   - The html of each page load says which deploy the visitor is looking at. When it is a newer one
//     the old store is dropped whole. If the html itself turns out to be older than a deploy already
//     seen (a copy the browser was still holding), the server is asked again for the page.
//   - A file goes into the store only if its own Last-Modified matches that deploy. A file that turns
//     out to be older (again a held copy) is asked for again from the server; one that is newer (a
//     deploy landed after this page's html) is passed on and not kept.
//   So the store only ever holds files of the one deploy the page belongs to, and this worker never
//   answers with a file the server would not have sent for that deploy. It also cannot make things
//   staler than they were: at worst it is the plain network. The ?v= stamps on css and js stay part
//   of the address and so of the key, but nothing here depends on stamp.py having been run.
//   On a host that sends no Last-Modified the worker keeps nothing and only passes requests through.
//   (What it cannot see: a css or js file the page takes straight from the browser's own memory,
//   under an unchanged address, inside the ten minutes. That is what the ?v= stamps are for.)
//
// Left alone, always: other sites (Stripe, Google Forms, Instagram), anything that is not a GET,
// video and audio and every range request, requests that ask for no caching (the members file),
// reloads. A page address with a query (club1848.html?joined=1) goes to the server as it is and
// is not kept.
//
// To retire it: replace this file with
//   self.addEventListener("install", () => self.skipWaiting());
//   self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.map((n) => caches.delete(n)))).then(() => self.registration.unregister())));
// and remove the register() call in idle.js one deploy later.

const PREFIX = "asufiji-deploy-";
const TOL = 20;                                   // seconds. files of one deploy are a second or two apart; deploys are minutes apart
const MEDIA = /\.(mp4|webm|mov|m4v|mp3|m4a)$/i;

// seconds since 1970 of a response's Last-Modified, or null
const stampOf = (res) => {
  const t = Date.parse((res && res.headers.get("last-modified")) || "");
  return Number.isFinite(t) ? Math.round(t / 1000) : null;
};
const keepable = (res) => !!res && res.status === 200 && res.type === "basic" && !res.redirected
  && !/no-store/i.test(res.headers.get("cache-control") || "");
const sameDeploy = (a, b) => Math.abs(a - b) <= TOL;

// the deploy in hand lives in the name of the one cache, so it survives the worker being stopped
let state = null;
function current() {
  return state || (state = (async () => {
    const ids = (await caches.keys()).filter((k) => k.startsWith(PREFIX)).map((k) => +k.slice(PREFIX.length))
      .filter(Number.isFinite).sort((a, b) => b - a);
    await Promise.all(ids.slice(1).map((id) => caches.delete(PREFIX + id)));
    return { id: ids.length ? ids[0] : null };
  })().catch(() => ({ id: null })));
}
// a page of deploy `id` has arrived. returns the deploy now in hand
async function adopt(id) {
  const s = await current();
  if (s.id !== null && (sameDeploy(id, s.id) || id < s.id)) return s.id;
  const old = s.id;
  s.id = id;
  if (old !== null) await caches.delete(PREFIX + old).catch(() => {});
  return id;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // the browser may start the page request while this worker is still starting
    try { await self.registration.navigationPreload?.enable(); } catch {}
    await current();
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") { event.respondWith(page(event, url)); return; }
  if (req.cache !== "default") return;            // a reload, or a request that asked for no caching
  if (req.headers.has("range") || req.destination === "video" || req.destination === "audio" || MEDIA.test(url.pathname)) return;
  if (url.pathname.endsWith("/sw.js")) return;
  event.respondWith(file(event));
});

// a page: the browser's ordinary path to the server, always. the copy kept here is only for when
// there is no network at all
async function page(event, url) {
  const req = event.request;
  let res;
  try {
    res = (await event.preloadResponse) || (await fetch(req));
  } catch (err) {
    const s = await current();
    const hit = s.id !== null && (await (await caches.open(PREFIX + s.id)).match(url.origin + url.pathname, { ignoreVary: true }));
    if (hit) return hit;
    throw err;
  }
  try {
    let id = stampOf(res);
    if (!keepable(res) || id === null) return res;
    const s = await current();
    if (s.id !== null && id < s.id - TOL) {
      // this html is older than a deploy already seen: the browser was still holding it. ask the server
      const again = await fetch(req.url, { cache: "reload", credentials: "same-origin" }).catch(() => null);
      if (keepable(again) && stampOf(again) !== null && stampOf(again) > id) { res = again; id = stampOf(again); }
    }
    const now = await adopt(id);
    if (sameDeploy(id, now) && !url.search) {
      const copy = res.clone();
      event.waitUntil(caches.open(PREFIX + now).then((c) => c.put(url.origin + url.pathname, copy)).catch(() => {}));
    }
  } catch {}
  return res;
}

// everything else on this site: the store first, then the network
async function file(event) {
  const req = event.request;
  const s = await current();
  if (s.id === null) return fetch(req);
  const id = s.id;
  const cache = await caches.open(PREFIX + id);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  let res = await fetch(req);
  let at = stampOf(res);
  if (!keepable(res) || at === null) return res;
  if (at < id - TOL && !s.loose) {
    // a copy from an older deploy that the browser was still holding, under a page that is newer
    const again = await fetch(req, { cache: "reload" }).catch(() => null);
    const t = keepable(again) ? stampOf(again) : null;
    if (t !== null && t > at) { res = again; at = t; }
    else if (t !== null) s.loose = true;          // the server itself says so: this host does not stamp deploys. stop asking twice
  }
  if (sameDeploy(at, id)) {
    const copy = res.clone();
    event.waitUntil(cache.put(req, copy).catch(() => {}));
  }
  return res;
}

// the page that installed this worker was loaded before it existed. take in what that page has
// just loaded, from the browser's own cache only (nothing is downloaded for this)
self.addEventListener("message", (event) => {
  const d = event.data;
  if (!d || d.type !== "seed" || typeof d.page !== "string" || !Array.isArray(d.urls)) return;
  event.waitUntil((async () => {
    const held = (u) => fetch(u, { cache: "only-if-cached", mode: "same-origin" }).catch(() => null);
    const pageUrl = new URL(d.page);
    if (pageUrl.origin !== self.location.origin) return;
    const html = await held(pageUrl.origin + pageUrl.pathname);
    const id = keepable(html) ? stampOf(html) : null;
    if (id === null) return;
    const now = await adopt(id);
    if (!sameDeploy(id, now)) return;
    const cache = await caches.open(PREFIX + now);
    await cache.put(pageUrl.origin + pageUrl.pathname, html).catch(() => {});
    await Promise.all(d.urls.slice(0, 120).map(async (u) => {
      try {
        const url = new URL(u);
        if (url.origin !== self.location.origin || MEDIA.test(url.pathname) || url.pathname.endsWith("/sw.js")) return;
        if (await cache.match(u, { ignoreVary: true })) return;
        const res = await held(u);
        const at = keepable(res) ? stampOf(res) : null;
        if (at !== null && sameDeploy(at, now)) await cache.put(u, res);
      } catch {}
    }));
  })());
});
