# draws the engraved plan of Tempe used across the site (assets/chart/tempe.svg): one alpha-only svg,
# shown through a css mask so the page can ink it in either theme.
# sources: OpenStreetMap (ODbL, credited on the pages that show it) for water, streets, rail and buildings;
# Mapzen / AWS open terrain tiles for the contours on Hayden Butte.
# run: uv run --with numpy --with pillow --with shapely --with contourpy python tools/build-chart.py
# the downloads are cached in tools/.cache (ignored by git).
import json, math, sys, glob, os, pathlib, urllib.request, urllib.parse
import numpy as np
from PIL import Image
from shapely.geometry import Polygon, LineString, MultiPolygon, box, Point
from shapely.ops import unary_union, linemerge
import contourpy

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools/.cache'; (CACHE / 'dem').mkdir(parents=True, exist_ok=True)
UA = {'User-Agent': 'chart-builder/1.0'}
QUERY = """[out:json][timeout:60][bbox:33.404,-111.952,33.440,-111.900];
(
  way["natural"="water"]; relation["natural"="water"]; way["waterway"];
  way["building"]; relation["building"];
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|pedestrian|footway)$"];
  way["railway"~"^(rail|light_rail)$"]; way["leisure"~"^(pitch|stadium)$"]; node["natural"="peak"];
);
out body geom;"""
osm = CACHE / 'tempe.json'
if not osm.exists():
    req = urllib.request.Request('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data': QUERY}).encode(), headers=UA)
    osm.write_bytes(urllib.request.urlopen(req, timeout=180).read())
Z = 14
def tile(lat, lon):
    n = 2 ** Z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
_x0, _y0 = tile(33.440, -111.952); _x1, _y1 = tile(33.408, -111.905)
for x in range(int(_x0), int(_x1) + 1):
    for y in range(int(_y0), int(_y1) + 1):
        p = CACHE / 'dem' / f'{x}_{y}.png'
        if not p.exists():
            req = urllib.request.Request(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png', headers=UA)
            p.write_bytes(urllib.request.urlopen(req, timeout=30).read())

LAT0, LAT1 = 33.4128, 33.4378
LON0, LON1 = -111.9462, -111.9132
W = 2400.0
MLAT = 111132.0
MLON = 111320.0 * math.cos(math.radians((LAT0 + LAT1) / 2))
K = W / ((LON1 - LON0) * MLON)          # units per metre
H = (LAT1 - LAT0) * MLAT * K
def P(lon, lat): return ((lon - LON0) * MLON * K, (LAT1 - lat) * MLAT * K)
FRAME = box(0, 0, W, H)
print("size", W, round(H), "units/m", round(K, 4), file=sys.stderr)

d = json.load(open(osm))
els = d['elements']
def geom_pts(g): return [P(p['lon'], p['lat']) for p in g]

def fmt(v):
    return str(int(round(v)))
def path_of(coords, close=False):
    pts = [(int(round(x)), int(round(y))) for x, y in coords]
    out = []; prev = None
    for p in pts:
        if p == prev: continue
        if prev is None: out.append(f"M{p[0]} {p[1]}")
        else:
            dx, dy = p[0] - prev[0], p[1] - prev[1]
            out.append(f"l{dx} {dy}" if out[-1][0] in "Ml" and False else f"{'l' if len(out)==1 else ''}{dx} {dy}")
        prev = p
    if len(out) < 2: return ""
    s = out[0] + out[1] + "".join((" " if not o.startswith("-") else " ") + o for o in out[2:])
    return s + ("z" if close else "")
def geom_paths(g, close_polys=True):
    """shapely geometry -> list of path strings"""
    res = []
    if g.is_empty: return res
    t = g.geom_type
    if t == 'Polygon':
        res.append(path_of(g.exterior.coords, True))
        for i in g.interiors: res.append(path_of(i.coords, True))
    elif t in ('LineString', 'LinearRing'):
        res.append(path_of(g.coords))
    elif hasattr(g, 'geoms'):
        for x in g.geoms: res += geom_paths(x)
    return [r for r in res if r]

water, buildings, glv, stadium, pitches = [], [], [], [], []
roads = {'major': [], 'minor': [], 'rail': [], 'walk': []}
canals = []
peak = None
for e in els:
    t = e.get('tags', {})
    if e['type'] == 'node':
        if t.get('natural') == 'peak': peak = (P(e['lon'], e['lat']), t)
        continue
    if e['type'] == 'way':
        pts = geom_pts(e['geometry'])
        if len(pts) < 2: continue
        closed = len(pts) > 3 and pts[0] == pts[-1]
        name = t.get('name', '')
        if t.get('natural') == 'water' and closed:
            water.append((Polygon(pts).buffer(0), name))
        elif 'building' in t and closed:
            poly = Polygon(pts).buffer(0)
            if 'Greek Leadership Village' in name: glv.append(poly)
            else: buildings.append(poly)
        elif t.get('leisure') == 'pitch' and closed:
            pitches.append(Polygon(pts).buffer(0))
        elif t.get('waterway') in ('canal',):
            canals.append(LineString(pts))
        elif 'highway' in t:
            h = t['highway']
            if h in ('motorway', 'trunk', 'primary', 'secondary'): roads['major'].append(LineString(pts))
            elif h in ('tertiary', 'residential', 'unclassified'): roads['minor'].append(LineString(pts))
            elif name == 'Palm Walk' or h == 'pedestrian': roads['walk'].append(LineString(pts))
        elif t.get('railway') in ('rail', 'light_rail'):
            roads['rail'].append(LineString(pts))
    elif e['type'] == 'relation':
        outers = [geom_pts(m['geometry']) for m in e.get('members', []) if m.get('role') == 'outer' and 'geometry' in m]
        inners = [geom_pts(m['geometry']) for m in e.get('members', []) if m.get('role') == 'inner' and 'geometry' in m]
        if not outers: continue
        try:
            merged = linemerge([LineString(o) for o in outers if len(o) > 1])
            lines = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
            polys = [Polygon(l.coords).buffer(0) for l in lines if len(l.coords) > 3]
            poly = unary_union(polys)
        except Exception as ex:
            continue
        if 'building' in t:
            if 'Stadium' in t.get('name', ''):
                stadium.append((poly, [Polygon(i).buffer(0) for i in inners if len(i) > 3]))
            else: buildings.append(poly)
        elif t.get('natural') == 'water': water.append((poly, t.get('name', '')))

out = []
def add(paths, **attrs):
    paths = [p for p in paths if p]
    if not paths: return
    a = " ".join(f'{k.replace("_","-")}="{v}"' for k, v in attrs.items())
    out.append(f'<path {a} d="{"".join(paths)}"/>')

# ---- water: shoreline + water-lining ----
lake = unary_union([w for w, n in water if w.area * (1 / K) ** 2 > 20000])
small_water = [w for w, n in water if w.area * (1 / K) ** 2 <= 20000 and w.intersects(FRAME)]
shore = lake.boundary.intersection(FRAME)
add(geom_paths(shore.simplify(0.8)), fill="none", stroke="#000", stroke_width="3", stroke_linejoin="round", stroke_linecap="round")
dists = [7, 15, 24, 34, 45, 57]
for i, dm in enumerate(dists):
    inner = lake.buffer(-dm * K)
    if inner.is_empty: continue
    ln = inner.boundary.intersection(FRAME).simplify(1.0)
    add(geom_paths(ln), fill="none", stroke="#000", stroke_width=f"{1.5 - i * 0.16:.2f}", stroke_opacity=f"{0.8 - i * 0.11:.2f}", stroke_linejoin="round", stroke_linecap="round")
sw = [p for w in small_water for p in geom_paths(w.intersection(FRAME).simplify(0.8))]
add(sw, fill="#000", fill_opacity=".12", stroke="#000", stroke_width="1.2")
add([p for c in canals for p in geom_paths(c.intersection(FRAME).simplify(1))], fill="none", stroke="#000", stroke_width="1.4", stroke_opacity=".7")

# ---- relief: contours on the butte from the dem ----
files = sorted(glob.glob(str(CACHE / 'dem' / '*.png')))
xs = sorted({int(os.path.basename(f).split('_')[0]) for f in files}); ys = sorted({int(os.path.basename(f).split('_')[1][:-4]) for f in files})
dem = np.zeros((len(ys) * 256, len(xs) * 256))
for f in files:
    x, y = os.path.basename(f)[:-4].split('_'); x = int(x); y = int(y)
    a = np.asarray(Image.open(f).convert('RGB')).astype(float)
    dem[(y - ys[0]) * 256:(y - ys[0] + 1) * 256, (x - xs[0]) * 256:(x - xs[0] + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
def blur(a, s):
    r = int(s * 3); k = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * s * s)); k /= k.sum()
    a = np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode='edge'), k, mode='valid'), 0, a)
    return np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode='edge'), k, mode='valid'), 1, a)
dem = blur(dem, 1.6)
# pixel -> lon/lat -> chart units
n = 2 ** Z
px = (np.arange(dem.shape[1]) + 0.5) / 256 + xs[0]; py = (np.arange(dem.shape[0]) + 0.5) / 256 + ys[0]
lon = px / n * 360 - 180
lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * py / n))))
gx = (lon - LON0) * MLON * K; gy = (LAT1 - lat) * MLAT * K
base = float(np.median(dem[(gy > 0) & (gy < H)][:, (gx > 0) & (gx < W)]))
print("base elevation", base, "max", dem.max(), file=sys.stderr)
cg = contourpy.contour_generator(x=gx, y=gy, z=dem)
relief = []
lvl0 = math.ceil((base + 9) / 5) * 5
for lv in range(int(lvl0), int(dem.max()) + 5, 5):
    idx = (lv % 25 == 0)
    ps = []
    for line in cg.lines(lv):
        ls = LineString(line)
        if ls.length < 60: continue
        ls = ls.intersection(FRAME).simplify(0.9)
        ps += geom_paths(ls)
    add(ps, fill="none", stroke="#000", stroke_width="1.9" if idx else "1.0", stroke_opacity="1" if idx else ".75", stroke_linejoin="round")

# ---- roads ----
maj = unary_union(roads['major']).intersection(FRAME).simplify(0.8)
mnr = unary_union(roads['minor']).intersection(FRAME).simplify(0.8)
mp = "".join(geom_paths(maj)); np_ = "".join(geom_paths(mnr))
out.append(f'<mask id="c" maskUnits="userSpaceOnUse" x="0" y="0" width="{W:.0f}" height="{H:.0f}"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="#fff" stroke-width="9" d="{mp}"/><path stroke="#fff" stroke-width="5.4" d="{np_}"/><path stroke="#000" stroke-width="6" d="{mp}"/><path stroke="#000" stroke-width="3" d="{np_}"/></g></mask>')
out.append(f'<rect width="{W:.0f}" height="{H:.0f}" mask="url(#c)" opacity=".8"/>')
rail = unary_union(roads['rail']).intersection(FRAME).simplify(0.8)
rp = "".join(geom_paths(linemerge(rail) if rail.geom_type == 'MultiLineString' else rail))
out.append(f'<path fill="none" stroke="#000" stroke-width="1.6" d="{rp}"/><path fill="none" stroke="#000" stroke-width="8" stroke-dasharray="1.6 12" d="{rp}"/>')
walk = unary_union(roads['walk']).intersection(FRAME).simplify(0.8)
add(geom_paths(walk), fill="none", stroke="#000", stroke_width="1.4", stroke_dasharray="5 4", stroke_opacity=".8")

# ---- buildings ----
big, small = [], []
for b in buildings:
    if not b.intersects(FRAME): continue
    b = b.intersection(FRAME)
    am = b.area / K / K
    if am < 60: continue
    (big if am > 700 else small).append(b)
out.append('<pattern id="h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><path d="M0 2.5h5" stroke="#000" stroke-width="1.5"/></pattern>')
add([p for b in small for p in geom_paths(b.simplify(1.4))], fill="#000", fill_opacity=".42")
add([p for b in big for p in geom_paths(b.simplify(1.1))], fill="url(#h)", stroke="#000", stroke_width="1.3", stroke_linejoin="round", fill_rule="evenodd")
add([p for b in pitches if b.intersects(FRAME) for p in geom_paths(b.intersection(FRAME).simplify(1))], fill="none", stroke="#000", stroke_width=".9", stroke_opacity=".7")
for poly, inners in stadium:
    add(geom_paths(poly.simplify(1)), fill="url(#h)", stroke="#000", stroke_width="2.4", stroke_linejoin="round")
    add([p for i in inners for p in geom_paths(i.simplify(1))], fill="none", stroke="#000", stroke_width="1.2")
add([p for b in glv for p in geom_paths(b.simplify(0.8))], fill="#000", stroke="#000", stroke_width="1")

svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}">' + "".join(out) + '</svg>'
(ROOT / 'assets/chart/tempe.svg').write_text(svg)
print("bytes", len(svg), "big", len(big), "small", len(small), file=sys.stderr)

# points of interest as fractions of the frame, for html labels
g = unary_union(glv).centroid
info = {
  "size": [W, H],
  "glv": [g.x / W, g.y / H],
  "peak": [peak[0][0] / W, peak[0][1] / H] if peak else None,
  "stadium": [stadium[0][0].centroid.x / W, stadium[0][0].centroid.y / H] if stadium else None,
  "lake_mid_y": lake.intersection(FRAME).centroid.y / H,
  "lat_ticks": {m: (LAT1 - (33 + m / 60)) / (LAT1 - LAT0) for m in (25, 26)},
  "lon_ticks": {m: ((-111 - m / 60) - LON0) / (LON1 - LON0) for m in (55, 56)},
  "quarter_mile_frac_w": 402.336 * K / W,
  "units_per_m": K,
}
# the fractions the pages use to place labels and marks on the plan
print(json.dumps(info), file=sys.stderr)

# lake band at a few x positions (fractions), for placing the start of the course and the lake label
from shapely.geometry import LineString as LS
for fx in (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9):
    seg = lake.intersection(LS([(fx * W, 0), (fx * W, H)]))
    if not seg.is_empty:
        b = seg.bounds
        print(f"lake x={fx}: y {b[1]/H:.3f}..{b[3]/H:.3f} mid {((b[1]+b[3])/2)/H:.3f}", file=sys.stderr)
