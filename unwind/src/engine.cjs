/* Arrow Unwind — puzzle engine (no DOM). Shared by the game and the tests.
 *
 * A puzzle lives on a "surface": a set of square cells, each with a 3D centre and an outward
 * normal. A flat board is one face; a box (cube or prism) has six, and moving off the edge of
 * one face carries on onto the next, turning with the surface.
 *
 * An arrow is a path of cells from tail to head. Tapped, it slides head-first: the head runs
 * straight on in its direction to the edge of its face and leaves (a flat board's edge, or a
 * box edge where it lifts off into space), and the body follows its own path behind it.
 * So an arrow can leave only if every cell from its head to that edge is empty. Removing
 * arrows only ever empties cells, so a free arrow stays free: the puzzle is solvable exactly
 * when the "who blocks whom" graph has no cycle, and any free arrow is always a safe move.
 */
'use strict';

const AX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; // direction index -> unit vector
const OPP = [1, 0, 3, 2, 5, 4];
const inPlane = n => [0, 1, 2, 3, 4, 5].filter(d => d !== n && d !== OPP[n]);

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }

/* ---------------- surfaces ---------------- */
const key2 = (x, y, z) => (Math.round(x * 2) + 1000) * 4000000 + (Math.round(y * 2) + 1000) * 2000 + (Math.round(z * 2) + 1000);

function Surface(kind) { this.kind = kind; this.cells = []; this.map = new Map(); this.faces = []; }
Surface.prototype.add = function (x, y, z, n, face, extra) {
  const id = this.cells.length; const c = { id, c: [x, y, z], n, face };
  if (extra) Object.assign(c, extra);
  this.cells.push(c); this.map.set(key2(x, y, z), id); return id;
};
Surface.prototype.at = function (x, y, z) { const v = this.map.get(key2(x, y, z)); return v === undefined ? -1 : v; };
// one step from cell id in direction d: {id, d} (d may change when wrapping onto another face) or null
Surface.prototype.step = function (id, d) {
  const cell = this.cells[id], c = cell.c, t = AX[d];
  const same = this.at(c[0] + t[0], c[1] + t[1], c[2] + t[2]);
  if (same >= 0 && this.cells[same].n === cell.n) return { id: same, d };
  if (this.kind === 'flat') return null;
  const N = AX[cell.n]; // wrap over the edge: down the next face, which faces the way we were going
  const w = this.at(c[0] + t[0] * 0.5 - N[0] * 0.5, c[1] + t[1] * 0.5 - N[1] * 0.5, c[2] + t[2] * 0.5 - N[2] * 0.5);
  return w >= 0 ? { id: w, d: OPP[cell.n] } : null;
};
// the cells an arrow's head crosses on its way out: straight on, to the edge of its own face
Surface.prototype.ray = function (id, d) {
  const out = []; const n = this.cells[id].n; let cur = id;
  for (;;) { const s = this.step(cur, d); if (!s || this.cells[s.id].n !== n || s.d !== d) break; out.push(s.id); cur = s.id; }
  return out;
};

function flatSurface(W, H, mask) {
  const s = new Surface('flat'); s.W = W; s.H = H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) s.add(x + 0.5, y + 0.5, 0, 4, 0, { x, y, on: mask ? !!mask[y * W + x] : true });
  s.faces = [{ n: 4 }];
  return s;
}
function boxSurface(X, Y, Z) {
  const s = new Surface('box'); s.dims = [X, Y, Z];
  const faces = [[0, X], [1, 0], [2, Y], [3, 0], [4, Z], [5, 0]]; // normal index, coordinate on its axis
  faces.forEach(([n, v], f) => {
    const ax = n >> 1, a1 = (ax + 1) % 3, a2 = (ax + 2) % 3, dims = [X, Y, Z];
    for (let i = 0; i < dims[a1]; i++) for (let j = 0; j < dims[a2]; j++) {
      const p = [0, 0, 0]; p[ax] = v; p[a1] = i + 0.5; p[a2] = j + 0.5;
      s.add(p[0], p[1], p[2], n, f, { on: true });
    }
    s.faces.push({ n });
  });
  return s;
}

/* ---------------- 2D silhouettes ---------------- */
function inPoly(px, py, pts) { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) ins = !ins; } return ins; }
const STAR = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1; return [r * Math.cos(a), r * Math.sin(a) + 0.08]; });
const SHAPES = {
  square: () => true,
  rectangle: () => true,
  circle: (u, v) => u * u + v * v <= 1,
  heart: (u, v) => { const x = u * 1.25, y = -v * 1.3 + 0.25; const a = x * x + y * y - 1; return a * a * a - x * x * y * y * y <= 0; },
  star: (u, v) => inPoly(u, v, STAR),
  flower: (u, v) => { // six round petals around a round middle
    if (u * u + v * v <= 0.13) return true;
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6, cx = 0.64 * Math.cos(a), cy = 0.64 * Math.sin(a); if ((u - cx) * (u - cx) + (v - cy) * (v - cy) <= 0.095) return true; }
    return false;
  },
  butterfly: (u, v) => { // big upper wings, smaller lower wings, a thin body
    const x = Math.abs(u), e = (cx, cy, rx, ry, a) => { const ca = Math.cos(a), sa = Math.sin(a), dx = x - cx, dy = v - cy; const p = (dx * ca + dy * sa) / rx, q = (-dx * sa + dy * ca) / ry; return p * p + q * q <= 1; };
    return e(0.5, -0.36, 0.5, 0.36, -0.55) || e(0.36, 0.42, 0.34, 0.28, 0.65) || (x < 0.07 && v > -0.6 && v < 0.75);
  },
  cat: (u, v) => { const head = u * u / 0.82 + (v - 0.15) * (v - 0.15) / 0.62 <= 1; return head || inPoly(u, v, [[-0.85, -0.25], [-0.75, -0.98], [-0.25, -0.5]]) || inPoly(u, v, [[0.85, -0.25], [0.75, -0.98], [0.25, -0.5]]); },
  fish: (u, v) => { const body = (u + 0.18) * (u + 0.18) / 0.58 + v * v / 0.34 <= 1; return body || inPoly(u, v, [[0.45, 0], [1, -0.62], [0.88, 0], [1, 0.62]]); },
  turtle: (u, v) => {
    const shell = u * u / 0.38 + v * v / 0.26 <= 1, head = (u - 0.82) * (u - 0.82) + v * v <= 0.045;
    const leg = (cx, cy) => (u - cx) * (u - cx) + (v - cy) * (v - cy) <= 0.03;
    return shell || head || leg(0.4, 0.55) || leg(-0.4, 0.55) || leg(0.4, -0.55) || leg(-0.4, -0.55) || inPoly(u, v, [[-0.58, -0.08], [-0.86, 0], [-0.58, 0.08]]);
  },
  ring: (u, v) => { const r = Math.hypot(u, v); return r <= 1 && r >= 0.42; },
  diamond: (u, v) => Math.abs(u) + Math.abs(v) <= 1,
  cross: (u, v) => Math.abs(u) < 0.36 || Math.abs(v) < 0.36,
  wave: (u, v) => Math.abs(v - 0.35 * Math.sin(u * 4)) < 0.55,
  maze: () => true,
};
const SHAPE_NAMES = { square: 'Square', rectangle: 'Rectangle', circle: 'Circle', heart: 'Heart', star: 'Star', flower: 'Flower', butterfly: 'Butterfly', cat: 'Cat', fish: 'Fish', turtle: 'Turtle', ring: 'Ring', diamond: 'Diamond', cross: 'Cross', wave: 'Wave', maze: 'Maze' };
function shapeMask(shape, W, H) {
  const f = SHAPES[shape] || SHAPES.square; const m = new Uint8Array(W * H);
  const s = Math.max(W, H) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5 - W / 2) / s, v = (y + 0.5 - H / 2) / s;
    const aspectFix = shape === 'square' || shape === 'rectangle' || shape === 'maze';
    m[y * W + x] = (aspectFix ? true : f(u * (W >= H ? 1 : 1) / (W >= H ? 1 : W / H), v / (W >= H ? H / W : 1))) ? 1 : 0;
  }
  return m;
}

/* ---------------- difficulty ---------------- */
const DIFFS = ['easy', 'medium', 'hard', 'expert', 'extreme', 'nightmare', 'impossible'];
const DIFF_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert', extreme: 'Extreme', nightmare: 'Nightmare', impossible: 'Impossible' };
const P2 = { // flat boards: W is the side of a full square board; silhouettes are scaled up to a similar area
  easy: { W: 8, minLen: 2, maxLen: 6, turn: 0.3, aim: 0.5, tries: 1 },
  medium: { W: 12, minLen: 3, maxLen: 9, turn: 0.35, aim: 1, tries: 2 },
  hard: { W: 17, minLen: 3, maxLen: 12, turn: 0.4, aim: 1.5, tries: 2 },
  expert: { W: 23, minLen: 3, maxLen: 15, turn: 0.42, aim: 2, tries: 2 },
  extreme: { W: 30, minLen: 3, maxLen: 18, turn: 0.45, aim: 2.5, tries: 2 },
  nightmare: { W: 40, minLen: 3, maxLen: 20, turn: 0.48, aim: 3, tries: 1 },
  impossible: { W: 50, minLen: 3, maxLen: 24, turn: 0.5, aim: 3.5, tries: 1 },
};
const P3 = { // boxes: N is the cube edge in cells
  easy: { N: 3, minLen: 2, maxLen: 5, turn: 0.3, aim: 0.5, tries: 2 },
  medium: { N: 4, minLen: 2, maxLen: 7, turn: 0.35, aim: 1, tries: 3 },
  hard: { N: 5, minLen: 3, maxLen: 9, turn: 0.4, aim: 1.5, tries: 3 },
  expert: { N: 6, minLen: 3, maxLen: 11, turn: 0.42, aim: 2, tries: 3 },
  extreme: { N: 8, minLen: 3, maxLen: 13, turn: 0.45, aim: 2.5, tries: 2 },
  nightmare: { N: 10, minLen: 3, maxLen: 15, turn: 0.48, aim: 3, tries: 2 },
  impossible: { N: 13, minLen: 3, maxLen: 17, turn: 0.5, aim: 3.5, tries: 1 },
};
const SHAPES_2D = ['square', 'heart', 'circle', 'star', 'flower', 'butterfly', 'cat', 'rectangle', 'fish', 'diamond', 'turtle', 'ring', 'cross', 'wave', 'maze'];
const SOLIDS = [['cube', 'Cube'], ['slab', 'Slab'], ['tower', 'Tower'], ['bar', 'Bar'], ['brick', 'Brick']];

/* ---------------- generation ---------------- */
// 1. Cover the shape with winding paths (random walks with turns).
// 2. Peel: repeatedly find a path that could slide out from one of its two ends past whatever is
//    still on the board; that end becomes its head and the path comes off. Peeling order is a
//    solution, so every puzzle is solvable by construction. If nothing can come off, a stuck path
//    is cut in two (new ends, new ways out) and peeling carries on.
// The solver further down then checks the finished puzzle independently before it is used.
function fill(surf, opt, R) {
  const n = surf.cells.length, owner = new Int32Array(n).fill(-1);
  const allowed = surf.cells.filter(c => c.on).map(c => c.id);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let paths = [];
  // --- 1. cover
  const nbrs = id => inPlane(surf.cells[id].n).map(d => { const s = surf.step(id, d); return s && surf.cells[s.id].on ? s : null; }).filter(Boolean);
  function walk(start, target) {
    const path = [start]; owner[start] = -2; let cur = start, dir = -1;
    while (path.length < target) {
      const opts = nbrs(cur).filter(s => owner[s.id] === -1);
      if (!opts.length) break;
      let s = null;
      if (dir >= 0 && R() > opt.turn) s = opts.find(o => { const st = surf.step(cur, dir); return st && st.id === o.id; }) || null;
      if (!s) s = opts[(R() * opts.length) | 0];
      dir = s.d; path.push(s.id); owner[s.id] = -2; cur = s.id;
    }
    return path;
  }
  for (const st of shuffle(allowed.slice())) {
    if (owner[st] !== -1) continue;
    const target = opt.minLen + Math.floor(R() * (opt.maxLen - opt.minLen + 1));
    let p = walk(st, target);
    if (p.length < target) { const back = walk(p[0], target - p.length + 1); back.shift(); p = back.reverse().concat(p); owner[st] = -2; }
    paths.push(p);
  }
  // fold single cells into a neighbouring path end where possible
  const isAdj = (a, b) => nbrs(a).some(s => s.id === b);
  paths.forEach((p, i) => p.forEach(c => { owner[c] = i; }));
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i]; if (p.length !== 1) continue;
    const c = p[0];
    for (const s of nbrs(c)) {
      const j = owner[s.id]; if (j < 0 || j === i) continue; const q = paths[j]; if (q.length < 2 || q.length >= opt.maxLen + 2) continue;
      if (q[q.length - 1] === s.id) { q.push(c); owner[c] = j; p.length = 0; break; }
      if (q[0] === s.id) { q.unshift(c); owner[c] = j; p.length = 0; break; }
    }
  }
  paths = paths.filter(p => p.length >= 2);
  // --- 2. peel
  const occ = new Int32Array(n).fill(-1);
  const live = new Set(); let nextId = 0; const store = new Map();
  const add = p => { const id = nextId++; store.set(id, p); live.add(id); p.forEach(c => { occ[c] = id; }); return id; };
  paths.forEach(add);
  const headDir = (p, k) => { // direction of travel arriving at p[k] from its neighbour inward
    const prev = k === p.length - 1 ? p[k - 1] : p[1], h = p[k];
    for (const d of inPlane(surf.cells[prev].n)) { const s = surf.step(prev, d); if (s && s.id === h) return s.d; }
    return -1;
  };
  const order = [];
  const tryOut = id => {
    const p = store.get(id); const ends = [];
    for (const rev of [false, true]) {
      const q = rev ? p.slice().reverse() : p; const d = headDir(q, q.length - 1); if (d < 0) continue;
      const ray = surf.ray(q[q.length - 1], d); let ok = true;
      for (const r of ray) if (occ[r] >= 0 && occ[r] !== id) { ok = false; break; }
      // a path whose body lies across its own way out would hit itself
      if (ok) for (const r of ray) if (occ[r] === id) { ok = false; break; }
      if (ok) ends.push({ q, w: Math.pow(1 + ray.length, opt.aim) });
    }
    if (!ends.length) return null;
    const t = ends.reduce((a, e) => a + e.w, 0); let r = R() * t;
    for (const e of ends) { r -= e.w; if (r <= 0) return e.q; }
    return ends[ends.length - 1].q;
  };
  let guard = 0;
  while (live.size && guard++ < 100000) {
    let progress = false;
    for (const id of shuffle([...live])) {
      const q = tryOut(id); if (!q) continue;
      order.push(q); live.delete(id); q.forEach(c => { occ[c] = -1; }); progress = true;
    }
    if (progress) continue;
    // stuck: cut a path where one of the two new ends can get out straight away
    const clearFor = (h, d, self) => { for (const r of surf.ray(h, d)) if (occ[r] >= 0) return false; return true; };
    const dirInto = (a, b) => { for (const d of inPlane(surf.cells[a].n)) { const st = surf.step(a, d); if (st && st.id === b) return st.d; } return -1; };
    const cuts = [];
    for (const id of live) {
      const p = store.get(id);
      for (let k = 2; k <= p.length - 2; k++) {
        if (clearFor(p[k - 1], dirInto(p[k - 2], p[k - 1]))) cuts.push([id, k]);
        else if (clearFor(p[k], dirInto(p[k + 1], p[k]))) cuts.push([id, k]);
      }
    }
    if (cuts.length) {
      const [id, k] = cuts[(R() * cuts.length) | 0]; const p = store.get(id);
      live.delete(id); p.forEach(c => { occ[c] = -1; }); add(p.slice(0, k)); add(p.slice(k));
    } else { // nothing to cut: give up the shortest stuck path (its cells stay empty)
      let id = -1; for (const j of live) if (id < 0 || store.get(j).length < store.get(id).length) id = j;
      live.delete(id); store.get(id).forEach(c => { occ[c] = -1; });
    }
  }
  return order; // tail..head paths, in a solving order
}

// turn a list of cell paths into arrows with directions and their way out
function finish(surf, paths) {
  const occ = new Int32Array(surf.cells.length).fill(-1);
  paths.forEach((p, i) => p.forEach(c => { occ[c] = i; }));
  return paths.map((cells, i) => {
    const dirs = []; // dirs[k] = direction (in cell k+1's frame) of the step from cells[k] to cells[k+1]
    const out = [];   // out[k] = direction leaving cells[k] towards cells[k+1], in cells[k]'s frame
    for (let k = 0; k + 1 < cells.length; k++) {
      let found = false;
      for (const d of inPlane(surf.cells[cells[k]].n)) { const s = surf.step(cells[k], d); if (s && s.id === cells[k + 1]) { out.push(d); dirs.push(s.d); found = true; break; } }
      if (!found) throw new Error('broken arrow path');
    }
    const head = cells[cells.length - 1], hd = dirs[dirs.length - 1];
    const ray = surf.ray(head, hd);
    return { i, cells, out, dirs, head, hd, ray };
  });
}
function blockers(arrows, occ) {
  return arrows.map(a => { const b = []; for (const r of a.ray) { const o = occ[r]; if (o >= 0 && o !== a.i && !b.includes(o)) b.push(o); } return b; });
}
// Solver: peel off free arrows layer by layer. Returns whether everything clears, the number of
// layers (the longest chain of arrows that must wait on each other) and one full solution order.
function solve(arrows, removed) {
  const n = arrows.length, occ = new Map();
  arrows.forEach(a => { if (!removed || !removed[a.i]) a.cells.forEach(c => occ.set(c, a.i)); });
  const gone = new Uint8Array(n); if (removed) for (let i = 0; i < n; i++) if (removed[i]) gone[i] = 1;
  const block = arrows.map(a => { const b = new Set(); for (const r of a.ray) { const o = occ.get(r); if (o !== undefined && o !== a.i) b.add(o); } return b; });
  const waitsOn = new Int32Array(n), unblocks = arrows.map(() => []);
  for (let i = 0; i < n; i++) if (!gone[i]) for (const b of block[i]) { waitsOn[i]++; unblocks[b].push(i); }
  let layer = []; for (let i = 0; i < n; i++) if (!gone[i] && waitsOn[i] === 0) layer.push(i);
  const order = []; let layers = 0;
  while (layer.length) {
    layers++; const next = [];
    for (const i of layer) { order.push(i); for (const j of unblocks[i]) if (--waitsOn[j] === 0) next.push(j); }
    layer = next;
  }
  let left = 0; for (let i = 0; i < n; i++) if (!gone[i]) left++;
  return { ok: order.length === left, layers, order, block };
}
// arrows that can leave right now
function freeArrows(arrows, removed, occ) {
  return arrows.filter(a => !removed[a.i] && a.ray.every(r => occ[r] < 0 || occ[r] === a.i)).map(a => a.i);
}

function surfaceFor(spec) {
  let surf, opt;
  if (spec.type === '3d') {
    opt = P3[spec.diff]; const N = opt.N;
    const dims = { cube: [N, N, N], slab: [N + 2, Math.max(2, N - 2), N + 1], tower: [Math.max(2, N - 1), N + 3, Math.max(2, N - 1)], bar: [N + 4, Math.max(2, N - 2), Math.max(2, N - 2)], brick: [N + 2, N, Math.max(2, N - 1)] }[spec.shape] || [N, N, N];
    surf = boxSurface(dims[0], dims[1], dims[2]);
  } else {
    opt = P2[spec.diff]; const shape = SHAPES[spec.shape] ? spec.shape : 'square';
    let W, H;
    if (shape === 'rectangle') { W = Math.round(opt.W * 0.85); H = Math.round(opt.W * 1.2); }
    else if (shape === 'maze') { W = opt.W; H = Math.round(opt.W * 1.3); }
    else { // grow the box until the silhouette covers about as many cells as a full square board would
      const m0 = shapeMask(shape, 40, 40); let on = 0; for (const v of m0) on += v;
      W = H = Math.max(opt.W, Math.round(opt.W * Math.sqrt(1600 / Math.max(1, on))));
    }
    surf = flatSurface(W, H, shapeMask(shape, W, H));
  }
  return { surf, opt };
}
// the heavy part (can run in a worker): returns the arrow paths only. Deterministic from spec.seed.
function pathsFor(spec) {
  const R = rng(spec.seed >>> 0); const { surf, opt } = surfaceFor(spec);
  let best = null;
  for (let t = 0; t < opt.tries; t++) { // a few candidates; keep the one with the longest chain of dependencies
    const paths = fill(surf, opt, R);
    const sol = solve(finish(surf, paths));
    if (!sol.ok) continue;
    const score = sol.layers * 1000 + paths.length;
    if (!best || score > best.score) best = { paths, score };
  }
  if (!best) throw new Error('no solvable puzzle');
  return best.paths;
}
// rebuild the full puzzle from its paths and verify it with the solver before it is used
function assemble(spec, paths) {
  const { surf } = surfaceFor(spec);
  const arrows = finish(surf, paths);
  const sol = solve(arrows);
  if (!sol.ok) throw new Error('unsolvable puzzle rejected');
  return { spec, surf, arrows, layers: sol.layers, solution: sol.order, blockedBy: sol.block };
}
function makePuzzle(spec) { return assemble(spec, pathsFor(spec)); }

const api = { AX, OPP, inPlane, rng, hashStr, Surface, flatSurface, boxSurface, shapeMask, SHAPES, SHAPE_NAMES, SHAPES_2D, SOLIDS, DIFFS, DIFF_NAMES, P2, P3, fill, finish, blockers, solve, freeArrows, surfaceFor, pathsFor, assemble, makePuzzle };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.UnwindEngine = api;
