// Club 1848 checkout: a Cloudflare Worker that turns { cents, mode } from the Alumni page into a
// Stripe Checkout session at exactly that amount, monthly or once, and returns its address.
// Stripe payment links cannot do this: they cannot take an amount from the page, and they have
// no giver-chosen amount for a monthly gift.
//
// deploy: npx wrangler deploy --config tools/wrangler.toml   (the worker is named asufiji-checkout)
// key:    npx wrangler secret put STRIPE_SECRET_KEY --config tools/wrangler.toml
//         (sk_test_… while testing, sk_live_… after). until it is set the worker answers 503.
// then put the worker's address into CHECKOUT at the top of give.js, and stamp + push the site
// the secret key lives only here, never in the site's files.

const SITE = "https://asufiji.com";
// pages allowed to ask for a checkout: the site, and the local preview while it is being tried
const ORIGINS = [SITE, "http://localhost:8100", "http://127.0.0.1:8100"];
const CLUB = { monthly: 1848, once: 184800 };       // cents: what makes a gift Club 1848
const LIMIT = 10000000;                           // $100,000: anything larger is a typing slip

let origin = SITE;
const cors = (body, status = 200) => new Response(body && JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": origin,
    "vary": "origin",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  },
});

export default {
  async fetch(req, env) {
    const from = req.headers.get("origin") || "";
    origin = ORIGINS.includes(from) ? from : SITE;
    if (req.method === "OPTIONS") return cors(null, 204);
    if (!env.STRIPE_SECRET_KEY) return cors({ error: "no key yet" }, 503);
    if (req.method !== "POST") return cors({ error: "POST only" }, 405);
    let cents, mode;
    try { ({ cents, mode } = await req.json()); } catch { return cors({ error: "bad request" }, 400); }
    cents = Math.round(Number(cents));
    if (!["monthly", "once"].includes(mode) || !Number.isFinite(cents) || cents < 100 || cents > LIMIT) return cors({ error: "bad amount" }, 400);

    const club = cents >= CLUB[mode];
    const name = mode === "monthly"
      ? (club ? "Club 1848, monthly" : "Monthly gift to FIJI Alpha Sigma")
      : (club ? "Club 1848, for life" : "Gift to FIJI Alpha Sigma");
    const f = new URLSearchParams();
    f.set("mode", mode === "monthly" ? "subscription" : "payment");
    f.set("line_items[0][quantity]", "1");
    f.set("line_items[0][price_data][currency]", "usd");
    f.set("line_items[0][price_data][unit_amount]", String(cents));
    f.set("line_items[0][price_data][product_data][name]", name);
    if (mode === "monthly") f.set("line_items[0][price_data][recurring][interval]", "month");
    else f.set("submit_type", "donate");
    f.set("metadata[club1848]", club ? (mode === "once" ? "lifetime" : "monthly") : "no");
    f.set("success_url", `${origin}/alumni.html?${club ? "joined" : "gave"}=1`);
    f.set("cancel_url", `${origin}/alumni.html#give`);

    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
      body: f,
    });
    const s = await r.json();
    if (!r.ok || !s.url) return cors({ error: "stripe" }, 502);
    return cors({ url: s.url });
  },
};
