// Liquid UI (https://design.how/vault/liquid-ui), ported from the skill's sdf.ts and marching-squares.ts.
// MIT, Arlan Marat (see LICENSE in this folder).
// nothing is drawn by hand. each shape is a rounded box, and the surface is the union of their
// signed-distance fields taken with a polynomial smooth minimum, so near a seam the fields blend and
// that blend is the concave fillet. the outline is found by marching squares and softened.

export function sdRoundBox(px, py, cx, cy, hw, hh, r) {
  const rr = Math.min(r, Math.min(hw, hh));
  const qx = Math.abs(px - cx) - hw + rr;
  const qy = Math.abs(py - cy) - hh + rr;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - rr;
}

export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

// shapes: [{ cx, cy, hw, hh, r }]
export class Field {
  constructor(shapes = [], k = 12) { this.shapes = shapes; this.k = k; }
  eval(x, y) {
    const { shapes, k } = this;
    if (!shapes.length) return Infinity;
    let d = sdRoundBox(x, y, shapes[0].cx, shapes[0].cy, shapes[0].hw, shapes[0].hh, shapes[0].r);
    for (let i = 1; i < shapes.length; i++) {
      const s = shapes[i];
      d = smin(d, sdRoundBox(x, y, s.cx, s.cy, s.hw, s.hh, s.r), k);
    }
    return d;
  }
  bounds(pad = 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = pad + this.k;
    for (const s of this.shapes) {
      minX = Math.min(minX, s.cx - s.hw - grow); minY = Math.min(minY, s.cy - s.hh - grow);
      maxX = Math.max(maxX, s.cx + s.hw + grow); maxY = Math.max(maxY, s.cy + s.hh + grow);
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
  }
}

const EDGES = [[], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [[3, 2], [0, 1]], [[0, 2]], [[3, 0]], [[3, 0]], [[0, 2]], [[3, 0], [2, 1]], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], []];

function lerpEdge(x0, y0, v0, x1, y1, v1) {
  const denom = v0 - v1;
  const t = Math.abs(denom) < 1e-6 ? 0.5 : v0 / denom;
  const tc = Math.max(0, Math.min(1, t));
  return { x: x0 + (x1 - x0) * tc, y: y0 + (y1 - y0) * tc };
}

function contour(field, cell) {
  const b = field.bounds();
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  if (w <= 0 || h <= 0) return [];
  const cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1;
  if (cols * rows > 400000) return [];
  const val = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const y = b.minY + j * cell;
    for (let i = 0; i < cols; i++) val[j * cols + i] = field.eval(b.minX + i * cell, y);
  }
  const at = (i, j) => val[j * cols + i];
  const segs = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const x0 = b.minX + i * cell, y0 = b.minY + j * cell, x1 = x0 + cell, y1 = y0 + cell;
      const vTL = at(i, j), vTR = at(i + 1, j), vBR = at(i + 1, j + 1), vBL = at(i, j + 1);
      let mask = 0;
      if (vTL < 0) mask |= 8;
      if (vTR < 0) mask |= 4;
      if (vBR < 0) mask |= 2;
      if (vBL < 0) mask |= 1;
      if (mask === 0 || mask === 15) continue;
      const edgePt = (edge) => edge === 0 ? lerpEdge(x0, y0, vTL, x1, y0, vTR)
        : edge === 1 ? lerpEdge(x1, y0, vTR, x1, y1, vBR)
        : edge === 2 ? lerpEdge(x0, y1, vBL, x1, y1, vBR)
        : lerpEdge(x0, y0, vTL, x0, y1, vBL);
      let cases = EDGES[mask];
      if (mask === 5 || mask === 10) {
        const center = field.eval((x0 + x1) / 2, (y0 + y1) / 2);
        if (mask === 5) cases = center < 0 ? [[3, 0], [2, 1]] : [[3, 2], [0, 1]];
        else cases = center < 0 ? [[3, 2], [0, 1]] : [[3, 0], [2, 1]];
      }
      for (const [ea, eb] of cases) segs.push([edgePt(ea), edgePt(eb)]);
    }
  }
  return stitch(segs, cell);
}

function stitch(segs, cell) {
  const eps = cell * 0.5;
  const key = (p) => `${Math.round(p.x / eps)},${Math.round(p.y / eps)}`;
  const map = new Map();
  segs.forEach((s, idx) => {
    for (const end of [0, 1]) {
      const k = key(s[end]);
      const arr = map.get(k);
      if (arr) arr.push({ seg: idx, end }); else map.set(k, [{ seg: idx, end }]);
    }
  });
  const used = new Array(segs.length).fill(false);
  const loops = [];
  for (let start = 0; start < segs.length; start++) {
    if (used[start]) continue;
    const loop = [];
    let cur = start, end = 0, guard = 0;
    while (!used[cur] && guard++ < segs.length + 2) {
      used[cur] = true;
      const bEnd = end === 0 ? 1 : 0;
      loop.push(segs[cur][end]);
      const cands = map.get(key(segs[cur][bEnd])) ?? [];
      let next = -1, nextEnd = 0;
      for (const c of cands) if (!used[c.seg]) { next = c.seg; nextEnd = c.end; break; }
      if (next === -1) break;
      cur = next; end = nextEnd;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function chaikin(pts, passes) {
  let out = pts;
  for (let p = 0; p < passes; p++) {
    const next = [], n = out.length;
    for (let i = 0; i < n; i++) {
      const a = out[i], b = out[(i + 1) % n];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    out = next;
  }
  return out;
}

// the outline of the field as an svg path
export function fieldToPath(field, { cell = 6, smooth = 2 } = {}) {
  const parts = [];
  for (const loop of contour(field, Math.max(1, cell))) {
    const s = smooth > 0 ? chaikin(loop, smooth) : loop;
    if (s.length < 3) continue;
    parts.push(`M ${s[0].x.toFixed(2)} ${s[0].y.toFixed(2)} ` + s.slice(1).map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") + " Z");
  }
  return parts.join(" ");
}
