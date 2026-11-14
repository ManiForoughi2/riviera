# draws the engraved compass card and the bezel inscription as svg, with every letter and numeral taken
# from the site's own Recia outlines (so no font is needed at paint time), and writes both into
# css/chart.css as data uris.
# run: uv run --with fonttools --with brotli --with shapely python tools/build-instruments.py
import math, sys, re, pathlib
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT = TTFont(ROOT / 'assets/fonts/recia-600.woff2')
GS = FONT.getGlyphSet(); CMAP = FONT.getBestCmap()
CAP = 750.0
DIG = {'0':'zero','1':'one','2':'two','3':'three','4':'four','5':'five','6':'six','7':'seven','8':'eight','9':'nine'}
def gname(ch):
    if ch in DIG and (DIG[ch] + '.plf') in GS: return DIG[ch] + '.plf'
    return CMAP[ord(ch)]
def gpath(name, m):
    """glyph outline through affine m=(a,b,c,d,e,f), rounded"""
    pen = SVGPathPen(GS, ntos=lambda v: ('%.1f' % v).rstrip('0').rstrip('.'))
    GS[name].draw(TransformPen(pen, m))
    return pen.getCommands()
def gbounds(name):
    bp = BoundsPen(GS); GS[name].draw(bp); return bp.bounds
def mat_mul(m1, m2):
    a1,b1,c1,d1,e1,f1 = m1; a2,b2,c2,d2,e2,f2 = m2
    return (a1*a2+c1*b2, b1*a2+d1*b2, a1*c2+c1*d2, b1*c2+d1*d2, a1*e2+c1*f2+e1, b1*e2+d1*f2+f1)
def rot(deg):
    t = math.radians(deg); return (math.cos(t), math.sin(t), -math.sin(t), math.cos(t), 0, 0)
def trans(x, y): return (1, 0, 0, 1, x, y)
def scl(sx, sy): return (sx, 0, 0, sy, 0, 0)

def arc_text(text, r_mid, cap, center_deg, track=0.0, inward=False, optical=True):
    """text set on a circle, glyphs upright to the radius. angles clockwise from north (svg y down).
    inward=False: tops point out, reads clockwise (top of a dial). inward=True: tops point in, reads counter-clockwise (foot of a dial)."""
    s = cap / CAP
    items = []; x = 0.0
    for ch in text:
        if ch == ' ': x += 0.30 * CAP * s + track; continue
        n = gname(ch); b = gbounds(n)
        w = (b[2] - b[0]) * s
        items.append((n, x, w, b)); x += w + track + (0.07 * CAP * s)
    total = x - track - 0.07 * CAP * s
    out = []
    for n, x0, w, b in items:
        mid = x0 + w / 2 - total / 2                  # arc distance of the glyph's ink centre from the string centre
        if not inward:
            ang = center_deg + math.degrees(mid / r_mid)
            m = mat_mul(rot(ang), mat_mul(trans(0, -(r_mid - cap / 2)), mat_mul(scl(s, -s), trans(-(b[0] + b[2]) / 2, 0))))
        else:
            ang = center_deg - math.degrees(mid / r_mid)
            m = mat_mul(rot(ang), mat_mul(trans(0, -(r_mid + cap / 2)), mat_mul(scl(-s, s), trans(-(b[0] + b[2]) / 2, 0))))
        out.append(gpath(n, m))
    return "".join(out)

def pt(r, deg):
    t = math.radians(deg); return (r * math.sin(t), -r * math.cos(t))
def poly_d(poly):
    def ring(c): 
        c = list(c)[:-1]
        return "M" + "L".join(f"{x:.1f} {y:.1f}".replace(".0 ", " ").rstrip("0").rstrip(".") if False else f"{round(x,1):g} {round(y,1):g}" for x, y in c) + "Z"
    if poly.is_empty: return ""
    if poly.geom_type == 'Polygon':
        return ring(poly.exterior.coords) + "".join(ring(i.coords) for i in poly.interiors)
    return "".join(poly_d(g) for g in poly.geoms if g.geom_type in ('Polygon', 'MultiPolygon'))

def lozenge(r, h, da, a):
    p = [pt(r + h, a), pt(r, a + da), pt(r - h, a), pt(r, a - da)]
    return "M" + "L".join("%.1f %.1f" % q for q in p) + "Z"

def rose(points32=False):
    layers = [
        dict(angs=[0, 90, 180, 270], tip=400, phi=45, r=58),
        dict(angs=[45, 135, 225, 315], tip=322, phi=45, r=46),
        dict(angs=[22.5 + 45 * k for k in range(8)], tip=244, phi=22.5, r=66),
    ]
    if points32: layers.append(dict(angs=[11.25 + 22.5 * k for k in range(16)], tip=168, phi=11.25, r=92))
    kites = []
    for L in layers:
        ks = []
        for a in L['angs']:
            O = (0, 0); A = pt(L['r'], a - L['phi']); T = pt(L['tip'], a); B = pt(L['r'], a + L['phi'])
            ks.append((Polygon([O, A, T, B]), Polygon([O, A, T])))
        kites.append(ks)
    dark, lines = [], []
    above = None
    for ks in kites:
        for full, half in ks:
            vis = full if above is None else full.difference(above)
            dk = half if above is None else half.difference(above)
            dark.append(poly_d(dk)); lines.append(poly_d(vis))
        u = unary_union([k[0] for k in ks])
        above = u if above is None else unary_union([above, u])
    star = poly_d(above)
    C = lambda r: 2 * math.pi * r
    def ticks(r0, r1, n, t):
        rm = (r0 + r1) / 2
        return f'<circle r="{rm:g}" fill="none" stroke="#19203a" stroke-width="{r1 - r0:g}" stroke-dasharray="{t:g} {C(rm) / n - t:.4f}" stroke-dashoffset="{t / 2:g}"/>'
    o = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="-500 -500 1000 1000">']
    o.append(f'<mask id="k"><rect x="-500" y="-500" width="1000" height="1000" fill="#fff"/><path d="{star}"/></mask>')
    o.append('<g fill="none" stroke="#19203a">')
    o.append('<circle r="497" stroke-width="3"/><circle r="468" stroke-width="1.6"/><circle r="414" stroke-width="3.2"/><circle r="406" stroke-width="1.3"/>')
    o.append('<g mask="url(#k)"><circle r="322" stroke-width="1.6"/><circle r="250" stroke-width="1.3"/><circle r="244" stroke-width="1.3"/><circle r="150" stroke-width="1.3"/></g>')
    o.append('</g>')
    o.append(ticks(484, 496, 180, 1.5)); o.append(ticks(478, 496, 72, 2.2)); o.append(ticks(470, 496, 36, 3))
    # 32 point marks inside the letter ring, between the star and the band
    o.append(f'<g mask="url(#k)">{ticks(392, 404, 32, 2.4)}</g>')
    o.append(f'<path fill="none" stroke="#19203a" stroke-width="2.4" stroke-linejoin="round" d="{"".join(lines)}"/>')
    o.append(f'<path fill="#19203a" d="{"".join(dark)}"/>')
    txt = ""
    for ch, a in (('N', 0), ('E', 90), ('S', 180), ('W', 270)):
        txt += arc_text(ch, 441, 40, a)
    for a in (30, 60, 120, 150, 210, 240, 300, 330):
        txt += arc_text(str(a), 441, 24, a, track=1.5)
    o.append(f'<path fill="#19203a" d="{txt}"/>')
    # a lozenge at each ordinal in the letter band
    loz = "".join(lozenge(441, 11, 0.9, a) for a in (45, 135, 225, 315))
    o.append(f'<path fill="#19203a" d="{loz}"/>')
    o.append('</svg>')
    return "".join(o)

def bezel_text():
    top = arc_text("PHI GAMMA DELTA", 580, 31, 0, track=13)
    bot = arc_text("TEMPE", 580, 31, 180, track=13, inward=True)
    loz = "".join(lozenge(580, 12, 0.75, a) for a in (90, 270))
    d = top + bot + loz
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-640 -640 1280 1280">'
            f'<defs><path id="t" d="{d}"/></defs>'
            '<use href="#t" x="1.1" y="1.5" fill="#fff2d4" fill-opacity=".6"/><use href="#t" fill="#33230f" fill-opacity=".92"/></svg>')

def data_uri(svg):
    return 'url("data:image/svg+xml,' + svg.replace('%', '%25').replace('#', '%23').replace('"', "'").replace('<', '%3C').replace('>', '%3E') + '")'

r = rose(); b = bezel_text()
block = "/* generated by tools/build-instruments.py: engraved compass card, bezel inscription */\n:root {\n  --rose: %s;\n  --bezel-text: %s;\n}\n" % (data_uri(r), data_uri(b))
css = ROOT / 'css/chart.css'
t = css.read_text()
t2, n = re.subn(r"/\* generated by tools/build-instruments\.py.*?\n\}\n", lambda m: block, t, count=1, flags=re.S)
assert n == 1, "instrument block not found in css/chart.css"
css.write_text(t2)
print("card", len(r), "inscription", len(b), file=sys.stderr)
