# stamps a content hash onto the css/js urls so every deploy gets fresh files from the cdn.
# run before each push: python3 tools/stamp.py
#
# the hash is taken over the files with their stamps taken out, so it changes only when the css or
# js itself changes: running this twice in a row writes nothing the second time, and a deploy that
# touched no css or js keeps its addresses (and whatever browsers still hold under them).
# it also stamps the module names inside the inline script in each page's head (the second wave of
# preloads), which must match the names main.js imports letter for letter.
import hashlib, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
assets = ["styles.css", "main.js", "sea.js", "under.js", "chart.js", "idle.js", "give.js", "update.js", "transit.js", "vendor/design-how/text-reveal.js", "vendor/design-how/ghosty-reveal.js"] + sorted(str(p.relative_to(root)) for p in (root / "css").glob("*.css"))
pat = re.compile(r'((?:/|\./)?(?:styles\.css|css/m-[a-z]+\.css|css/chart(?:-m)?\.css|main\.js|sea\.js|under\.js|chart\.js|idle\.js|give\.js|update\.js|transit\.js|members\.js))(?:\?v=[0-9a-f]+)?(["\'])')
bare = lambda a: pat.sub(lambda m: m.group(1) + m.group(2), (root / a).read_text()).encode()
v = hashlib.sha1(b"".join(bare(a) for a in assets)).hexdigest()[:8]
changed = 0
for f in list(root.glob("*.html")) + [root / "main.js"]:
    s = f.read_text()
    t = pat.sub(lambda m: f"{m.group(1)}?v={v}{m.group(2)}", s)
    if t != s:
        f.write_text(t)
        changed += 1
print("stamped", v, f"({changed} files changed)" if changed else "(already current)")
