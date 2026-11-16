// Rush team: a Cloudflare Worker behind asufiji.com/rushteam. It holds the PNM roster (names and who
// is assigned to each, no phone numbers or emails) in the KV namespace RUSH, and in the D1 database DB
// (tools/rush/schema.sql): each PNM's Instagram handle and one photo (table notes, photos), and every
// brother's own rating, thoughts and Instagram handle for him (table ratings, one row per brother per
// PNM). a PNM's score is the average over everyone who rated him, and his official handle is the one
// most brothers entered, so one typo does not stick. Everything needs the rush team password.
//
// deploy:   npx wrangler deploy --config tools/rush/wrangler.toml
// password: npx wrangler secret put RUSH_PASS --config tools/rush/wrangler.toml
// roster:   the key "roster" (JSON: { groups, pnms }) is put with wrangler kv; it is never in the repo
//
// notes and photos are in D1 rather than KV because D1 shows a save at once: a brother who reloads
// right after saving sees his note. photos are small JPEGs, resized in the browser before upload.

const SITE = "https://asufiji.com";
const ORIGINS = [SITE, "http://localhost:8100", "http://127.0.0.1:8100", "http://localhost:8093", "http://127.0.0.1:8093"];
const DAY = 86400;
const enc = new TextEncoder();

let origin = SITE;
const out = (body, status = 200, extra = {}) => new Response(body === null ? null : JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "cache-control": "no-store",
    vary: "origin",
    ...extra,
  },
});

async function hmac(key, text) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]);
}
// a token is "<expiry>.<signature>": good for 120 days (a whole rush season), and every token dies when the password changes
const issue = async (env) => { const exp = Math.floor(Date.now() / 1000) + 120 * DAY; return `${exp}.${await hmac(env.RUSH_PASS, "rush:" + exp)}`; };
async function valid(env, token) {
  const [exp, sig] = String(token || "").split(".");
  if (!exp || !sig || +exp < Date.now() / 1000) return false;
  return sig === await hmac(env.RUSH_PASS, "rush:" + exp);
}
const clip = (v, n) => String(v ?? "").slice(0, n);
// an Instagram handle however it was typed: "@Name", "instagram.com/name/", " name " are all "name".
// "__none__" means this brother could not find one
const handle = (v) => {
  const t = clip(v, 120).trim();
  if (t === "__none__") return t;
  return t.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 30);
};

export default {
  async fetch(req, env) {
    const from = req.headers.get("origin") || "";
    origin = ORIGINS.includes(from) ? from : SITE;
    if (req.method === "OPTIONS") return out(null, 204);
    if (!env.RUSH_PASS) return out({ error: "not set up" }, 503);
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/login" && req.method === "POST") {
      let password = "";
      try { ({ password } = await req.json()); } catch {}
      // a wrong guess waits a moment, so the password cannot be tried quickly
      if (password !== env.RUSH_PASS) { await new Promise((r) => setTimeout(r, 900)); return out({ error: "wrong password" }, 401); }
      return out({ token: await issue(env) });
    }

    const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "") || url.searchParams.get("t");
    if (!(await valid(env, token))) return out({ error: "sign in again" }, 401);

    // everything the page needs in one go: the roster, and every note
    if (path === "/data" && req.method === "GET") {
      const roster = await env.RUSH.get("roster", "json");
      const [n, r] = await env.DB.batch([
        env.DB.prepare("SELECT id, ig, by, photo, at FROM notes"),
        env.DB.prepare("SELECT pnm, brother, rating, thoughts, ig, at FROM ratings"),
      ]);
      const notes = {}, ratings = {};
      for (const row of n.results) { const { id, ...rest } = row; notes[id] = rest; }
      for (const row of r.results) (ratings[row.pnm] ||= []).push({ by: row.brother, rating: row.rating, thoughts: row.thoughts, ig: row.ig || "", at: row.at });
      return out({ roster, notes, ratings });
    }

    const m = path.match(/^\/(note|photo|rate)\/(\d{3,12})$/);
    if (!m) return out({ error: "not found" }, 404);
    const [, kind, id] = m;
    const roster = await env.RUSH.get("roster", "json");
    if (!roster?.pnms?.some((p) => p.id === id)) return out({ error: "unknown PNM" }, 404);

    if (kind === "note" && req.method === "POST") {
      let b = {};
      try { b = await req.json(); } catch { return out({ error: "bad request" }, 400); }
      const ig = clip(b.ig ?? "", 60).trim().replace(/^@/, ""), by = clip(b.by ?? "", 40), at = Date.now();
      await env.DB.prepare("INSERT INTO notes (id, ig, by, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET ig = ?2, by = ?3, at = ?4").bind(id, ig, by, at).run();
      const note = await env.DB.prepare("SELECT ig, by, photo, at FROM notes WHERE id = ?").bind(id).first();
      return out({ ok: true, note });
    }

    if (kind === "rate" && req.method === "POST") {
      let b = {};
      try { b = await req.json(); } catch { return out({ error: "bad request" }, 400); }
      const by = clip(b.by, 40);
      if (!roster.groups.some((g) => g.members.includes(by))) return out({ error: "pick your name first" }, 400);
      const rating = Math.max(0, Math.min(5, Math.round(+b.rating || 0))), thoughts = clip(b.thoughts ?? "", 1500).trim(), at = Date.now();
      const ig = handle(b.ig);
      if (!rating && !thoughts && !ig) await env.DB.prepare("DELETE FROM ratings WHERE pnm = ? AND brother = ?").bind(id, by).run();
      else await env.DB.prepare("INSERT INTO ratings (pnm, brother, rating, thoughts, ig, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(pnm, brother) DO UPDATE SET rating = ?3, thoughts = ?4, ig = ?5, at = ?6").bind(id, by, rating, thoughts, ig, at).run();
      const { results } = await env.DB.prepare("SELECT brother AS by, rating, thoughts, ig, at FROM ratings WHERE pnm = ?").bind(id).all();
      return out({ ok: true, ratings: results });
    }

    if (kind === "photo" && req.method === "POST") {
      const type = req.headers.get("content-type") || "";
      if (!/^image\/(jpeg|png|webp)$/.test(type)) return out({ error: "send a jpeg, png or webp" }, 415);
      const body = await req.arrayBuffer();
      if (body.byteLength > 1_500_000) return out({ error: "photo too large" }, 413);
      const now = Date.now();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO photos (id, type, data) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET type = ?2, data = ?3").bind(id, type, body),
        env.DB.prepare("INSERT INTO notes (id, photo, at) VALUES (?1, ?2, ?2) ON CONFLICT(id) DO UPDATE SET photo = ?2, at = ?2").bind(id, now),
      ]);
      const note = await env.DB.prepare("SELECT ig, by, photo, at FROM notes WHERE id = ?").bind(id).first();
      return out({ ok: true, note });
    }

    if (kind === "photo" && req.method === "GET") {
      const row = await env.DB.prepare("SELECT type, data FROM photos WHERE id = ?").bind(id).first();
      if (!row) return out({ error: "no photo" }, 404);
      return new Response(new Uint8Array(row.data), { headers: { "content-type": row.type || "image/jpeg", "cache-control": "private, max-age=86400", "access-control-allow-origin": origin } });
    }
    return out({ error: "not found" }, 404);
  },
};
