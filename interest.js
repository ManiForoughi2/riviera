// recruitment: the sign-up form. DEMO: it checks the answers and shows the thank-you, but sends nothing yet.
// to go live it posts to a small sign-up endpoint that saves into the same list the brothers already use.
const form = document.querySelector(".interest");
// the print at the top (Misprint type) and the screenprint on the thank-you (Spray burst), from design.how
const fx = import("./vendor/design-how/rush-fx.js");
const TYPE = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const poster = document.querySelector(".rz-poster");
if (poster) fx.then((m) => m.mountMisprint(poster, TYPE)).catch(() => {});
if (form) {
  const msg = form.querySelector(".up-msg");
  const done = form.parentElement.querySelector(".up-done");
  const need = [["name", "your name"], ["phone", "your phone number"], ["ig", "your Instagram"], ["grade", "your grade"], ["gpa", "your GPA"]];
  const handle = (v) => String(v || "").trim().replace(/^(https?:\/\/)?((www|m)\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  const ig = form.elements.ig;
  // a pasted profile link becomes the handle
  ig.addEventListener("change", () => { const h = handle(ig.value); ig.value = h ? "@" + h : ""; });
  form.addEventListener("input", (e) => e.target.classList?.remove("is-bad"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const missing = need.filter(([k]) => !String(form.elements[k].value || "").trim());
    form.querySelectorAll(".is-bad").forEach((x) => x.classList.remove("is-bad"));
    if (missing.length) {
      for (const [k] of missing) { const el = form.elements[k]; if (el instanceof HTMLElement) el.classList.add("is-bad"); }
      msg.textContent = "Add " + missing.map(([, w]) => w).join(", ").replace(/, ([^,]*)$/, " and $1") + ".";
      return;
    }
    const digits = form.elements.phone.value.replace(/\D/g, "");
    if (digits.length < 10) { form.elements.phone.classList.add("is-bad"); msg.textContent = "That phone number looks short."; return; }
    done.querySelector(".up-done-name").textContent = form.elements.name.value.trim().split(/\s+/)[0].replace(/^./, (c) => c.toUpperCase());
    form.hidden = true; done.hidden = false; done.focus({ preventScroll: true });
    const spray = done.querySelector(".rz-spray");
    if (spray && !spray.dataset.on) { spray.dataset.on = "1"; fx.then((m) => m.mountSpray(spray)).catch(() => {}); }
    done.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}
