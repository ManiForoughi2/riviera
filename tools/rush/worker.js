// Rush team: a Cloudflare Worker behind asufiji.com/rushteam. It holds the PNM roster (names and who
// is assigned to each, no phone numbers or emails) in the KV namespace RUSH, and each PNM's notes and
// one photo in the D1 database DB (tools/rush/schema.sql). Everything needs the rush team password.
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
// a token is "<expiry>.<signature>": good for 30 days, and every token dies when the password changes
const issue = async (env) => { const exp = Math.floor(Date.now() / 1000) + 30 * DAY; return `${exp}.${await hmac(env.RUSH_PASS, "rush:" + exp)}`; };
async function valid(env, token) {
  const [exp, sig] = String(token || "").split(".");
  if (!exp || !sig || +exp < Date.now() / 1000) return false;
  return sig === await hmac(env.RUSH_PASS, "rush:" + exp);
}
const clip = (v, n) => String(v ?? "").slice(0, n);

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
      const { results } = await env.DB.prepare("SELECT id, ig, thoughts, rating, by, photo, at FROM notes").all();
      const notes = {};
      for (const r of results) { const { id, ...n } = r; notes[id] = n; }
      return out({ roster, notes });
    }

    const m = path.match(/^\/(note|photo)\/(\d{3,12})$/);
    if (!m) return out({ error: "not found" }, 404);
    const [, kind, id] = m;
    const roster = await env.RUSH.get("roster", "json");
    if (!roster?.pnms?.some((p) => p.id === id)) return out({ error: "unknown PNM" }, 404);

    if (kind === "note" && req.method === "POST") {
      let b = {};
      try { b = await req.json(); } catch { return out({ error: "bad request" }, 400); }
      const prev = (await env.DB.prepare("SELECT ig, thoughts, rating, by, photo FROM notes WHERE id = ?").bind(id).first()) || {};
      const note = {
        ig: clip(b.ig ?? prev.ig ?? "", 60).replace(/^@/, ""),
        thoughts: clip(b.thoughts ?? prev.thoughts ?? "", 1500),
        rating: Math.max(0, Math.min(5, Math.round(+(b.rating ?? prev.rating) || 0))),
        by: clip(b.by ?? prev.by ?? "", 40),
        photo: prev.photo || 0,
        at: Date.now(),
      };
      await env.DB.prepare("INSERT INTO notes (id, ig, thoughts, rating, by, photo, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(id) DO UPDATE SET ig = ?2, thoughts = ?3, rating = ?4, by = ?5, at = ?7")
        .bind(id, note.ig, note.thoughts, note.rating, note.by, note.photo, note.at).run();
      return out({ ok: true, note });
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
      const note = await env.DB.prepare("SELECT ig, thoughts, rating, by, photo, at FROM notes WHERE id = ?").bind(id).first();
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
