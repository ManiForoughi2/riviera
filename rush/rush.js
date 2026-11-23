// asufiji.com/rush: the sign-up form, and the two design.how effects (Ghosty reveal on the island print at
// the top, Spray burst on the thank-you). a sign-up goes to a small sign-up service that only saves it.
const SIGNUP = "https://asufiji-join.maniforoughi2.workers.dev/";
const fx = import("../vendor/design-how/rush-fx.js?v=3");

// the island print forms out of a soft cloud: Ghosty reveal's mask, slid up over the picture once it has
// loaded, then the logo stamps down. with reduced motion it is simply there
const island = document.querySelector(".island");
const art = island?.querySelector(".island-art");
if (art && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  island.classList.add("js-reveal");
  import("../vendor/design-how/ghosty-reveal.js").then(async ({ MASK_IN, rasterMask }) => {
    const mask = await rasterMask(MASK_IN);
    art.style.webkitMaskImage = art.style.maskImage = mask;
    await art.decode().catch(() => {});
    requestAnimationFrame(() => requestAnimationFrame(() => island.classList.add("is-in")));
  }).catch(() => island.classList.remove("js-reveal"));
}

const form = document.querySelector(".form");
const msg = form.querySelector(".msg");
const done = document.querySelector(".done");
const btn = form.querySelector(".send");
const need = [["name", "your name"], ["phone", "your phone number"], ["ig", "your Instagram"], ["grade", "your grade"], ["gpa", "your GPA"]];
const handle = (v) => String(v || "").trim().replace(/^(https?:\/\/)?((www|m)\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
const ig = form.elements.ig;
// the box already shows the @: a typed @ or a pasted profile link becomes just the handle
const tidyIg = () => { const h = handle(ig.value); if (h !== ig.value) ig.value = h; };
ig.addEventListener("input", () => { if (/^@|instagram\.com/i.test(ig.value)) tidyIg(); });
ig.addEventListener("change", tidyIg);
form.addEventListener("input", (e) => { e.target.classList?.remove("bad"); e.target.closest(".chips")?.classList.remove("bad"); });

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  form.querySelectorAll(".bad").forEach((x) => x.classList.remove("bad"));
  const val = (k) => String(form.elements[k].value || "").trim();
  const missing = need.filter(([k]) => !val(k));
  if (missing.length) {
    for (const [k] of missing) { const el = form.elements[k]; (el instanceof RadioNodeList ? form.querySelector(`[name=${k}]`).closest(".chips") : el).classList.add("bad"); }
    msg.textContent = "Add " + missing.map(([, w]) => w).join(", ").replace(/, ([^,]*)$/, " and $1") + ".";
    return;
  }
  if (val("phone").replace(/\D/g, "").length < 10) { form.elements.phone.classList.add("bad"); msg.textContent = "That phone number looks short."; return; }
  btn.disabled = true; msg.textContent = "Sending…";
  const body = Object.fromEntries(["name", "phone", "ig", "grade", "gpa", "hometown", "hobbies", "heard", "questions", "website"].map((k) => [k, val(k)]));
  try {
    const r = await fetch(SIGNUP, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 429) { msg.textContent = "Too many sign-ups from this connection. Try again in a bit."; btn.disabled = false; return; }
    if (!r.ok) throw new Error("failed");
  } catch {
    msg.textContent = "Didn't send. Check your connection and try again.";
    btn.disabled = false;
    return;
  }
  done.querySelector(".done-name").textContent = val("name").split(/\s+/)[0].replace(/^./, (c) => c.toUpperCase());
  // the form is much taller than the thank-you, so swapping them would leave the page scrolled down at the
  // questions: put the thank-you in the middle of the screen straight away, once the new layout is in
  form.hidden = true; done.hidden = false; done.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    const r = done.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, scrollY + r.top - (innerHeight - r.height) / 2), behavior: "instant" });
  });
  fx.then((m) => m.mountSpray(done.querySelector(".spray"))).catch(() => {});
});
