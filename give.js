// alumni: giving any amount, monthly or once. $18.48 a month or more is Club 1848 membership;
// $1,848 or more at once is Club 1848 for life. the page shows which one an amount reaches.
//
// paying: Stripe payment links cannot take an amount from the page, and cannot take a monthly
// amount the giver chooses at all, so the page asks a small checkout function for a Stripe Checkout
// session at the exact amount (tools/checkout-worker.js) and goes there. set CHECKOUT to that
// function's address. until it is set, only the two club amounts can be paid (through the fixed
// payment links below) and any other amount says it is not connected yet.
const CHECKOUT = "https://asufiji-checkout.asufiji.workers.dev";
const FIXED = {
  "monthly:1848": "https://buy.stripe.com/test_28E7sK5Wc0m6bL3fSfbjW00",
  "once:184800": "https://buy.stripe.com/test_14A8wO3O41qa5mF5dBbjW01",
};
const CLUB = { monthly: 1848, once: 184800 };        // cents
const PRESETS = { monthly: [1848, 2500, 5000, 10000], once: [10000, 50000, 184800, 500000] };

const form = document.querySelector(".give-form");
if (form) {
  const amount = form.elements.amount;
  const status = form.querySelector(".give-status");
  const btn = form.querySelector(".give-btn");
  const presets = form.querySelector(".give-presets");
  const mode = () => form.elements.freq.value;
  const money = (c) => "$" + (c % 100 ? (c / 100).toFixed(2) : (c / 100).toLocaleString("en-US"));
  const cents = () => {
    const v = parseFloat(String(amount.value).replace(/[^0-9.]/g, ""));
    return isFinite(v) ? Math.round(v * 100) : 0;
  };

  function drawPresets() {
    presets.replaceChildren(...PRESETS[mode()].map((c) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "give-chip"; b.dataset.c = c; b.textContent = money(c);
      b.addEventListener("click", () => { amount.value = (c / 100).toFixed(c % 100 ? 2 : 0); update(); });
      return b;
    }));
  }
  function update() {
    const c = cents(), m = mode(), club = c >= CLUB[m];
    for (const b of presets.children) b.setAttribute("aria-pressed", String(+b.dataset.c === c));
    form.classList.toggle("is-club", club);
    if (c < 100) status.textContent = "Enter at least $1.";
    else if (m === "monthly") status.textContent = club ? "Club 1848 member for as long as you give." : `${money(CLUB.monthly - c)} more a month makes you a Club 1848 member.`;
    else status.textContent = club ? "Club 1848 for life." : "A one-time gift. $1,848 or more is Club 1848 for life.";
    btn.textContent = c >= 100 ? `Give ${money(c)}${m === "monthly" ? " a month" : ""}` : "Give";
    btn.disabled = c < 100;
    for (const t of document.querySelectorAll(".tier")) t.classList.toggle("is-on", t.dataset.freq === m && club);
  }
  form.addEventListener("change", (e) => { if (e.target.name === "freq") { drawPresets(); update(); } });
  amount.addEventListener("input", update);
  // a tap on the amount selects it, so typing a new one replaces it instead of adding to it
  amount.addEventListener("focus", () => requestAnimationFrame(() => amount.select()));
  // the two club amounts above the picker fill it in
  for (const t of document.querySelectorAll(".tier")) t.addEventListener("click", () => {
    form.elements.freq.value = t.dataset.freq; amount.value = t.dataset.amount; drawPresets(); update();
    amount.focus({ preventScroll: true });
  });
  drawPresets(); update();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const c = cents(), m = mode();
    if (c < 100) return;
    const fixed = FIXED[`${m}:${c}`];
    if (!CHECKOUT) {
      if (fixed) { location.href = fixed; return; }
      status.textContent = "Only $18.48 a month or $1,848 once can be paid here until checkout is connected.";
      return;
    }
    btn.disabled = true; btn.textContent = "One moment…";
    try {
      const r = await fetch(CHECKOUT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cents: c, mode: m }) });
      const { url } = await r.json();
      if (!r.ok || !url) throw new Error("no session");
      location.href = url;
    } catch {
      btn.disabled = false; update();
      status.textContent = "Checkout didn't open. Try again in a moment.";
    }
  });
}
