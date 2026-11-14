// alumni: the info update form. a brother says what changed, and only those fields show.
// without this script every field is on the page and the form still reads top to bottom.
//
// where the answers go: a Google Form. the page posts to its formResponse address, and each
// answer lands in that form's responses (and its sheet). to connect it, fill in FORM below:
//   action  the form's address with /viewform changed to /formResponse
//   fields  this page's field name -> that form's entry id (entry.123456789), one per question
// until it is connected the form says so instead of pretending to send.
const FORM = {
  action: "",
  fields: { name: "", grad: "", init: "", address: "", phone: "", email: "", company: "", title: "", other: "" },
};

const form = document.querySelector(".update");
if (form) {
  const msg = form.querySelector(".up-msg");
  const chips = [...form.querySelectorAll('input[name="what"]')];
  const groups = [...form.querySelectorAll(".up-more")];
  form.classList.add("up-live");

  const show = () => {
    for (const g of groups) {
      const on = chips.some((c) => c.checked && c.value === g.dataset.for);
      if (on && !g.classList.contains("is-on")) {
        g.classList.add("is-on");
        // the first field of a group that has just opened is where the next keystroke goes
        if (document.activeElement?.name === "what") requestAnimationFrame(() => g.querySelector("input, textarea")?.focus({ preventScroll: true }));
      }
      if (!on) g.classList.remove("is-on");
    }
    msg.textContent = "";
  };
  chips.forEach((c) => c.addEventListener("change", show));
  form.addEventListener("input", (e) => { if (e.target.name !== "what") msg.textContent = ""; });
  show();

  const value = (n) => (form.elements[n]?.value || "").trim();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!value("name")) { msg.textContent = "Add your name first."; form.elements.name.focus(); return; }
    const open = groups.filter((g) => g.classList.contains("is-on"));
    if (!open.length) { msg.textContent = "Pick what changed."; chips[0].focus(); return; }
    const empty = open.find((g) => ![...g.querySelectorAll("input, textarea")].some((f) => f.value.trim()));
    if (empty) { msg.textContent = "Fill in the new " + empty.dataset.label + "."; empty.querySelector("input, textarea").focus(); return; }

    if (!FORM.action) { msg.textContent = "This form isn't connected yet, so nothing was sent."; return; }
    const body = new URLSearchParams();
    for (const [mine, theirs] of Object.entries(FORM.fields)) {
      // only what the brother chose to change is sent
      const g = form.elements[mine]?.closest(".up-more");
      if (theirs && (!g || g.classList.contains("is-on")) && value(mine)) body.append(theirs, value(mine));
    }
    const btn = form.querySelector(".up-send");
    btn.disabled = true; msg.textContent = "Sending…";
    try {
      // google answers without the headers a page may read, so the reply cannot be checked: a request
      // that went out is taken as sent. a dropped connection still lands in the catch below
      await fetch(FORM.action, { method: "POST", mode: "no-cors", body });
      const done = form.parentElement.querySelector(".up-done");
      done.querySelector(".up-done-name").textContent = value("name").split(/\s+/)[0];
      form.hidden = true; done.hidden = false;
      done.focus();
    } catch {
      btn.disabled = false;
      msg.textContent = "That didn't go through. Check your connection and try again.";
    }
  });
}
