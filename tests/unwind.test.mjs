// Arrow Unwind (unwind/): puzzle engine checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../unwind/src/engine.cjs');

function checkPuzzle(P) {
  const { surf, arrows } = P, seen = new Map();
  for (const a of arrows) {
    assert.ok(a.cells.length >= 2, 'arrow has at least two cells');
    for (const c of a.cells) { assert.ok(!seen.has(c), `cell ${c} used twice`); seen.set(c, a.i); assert.ok(surf.cells[c].on, 'arrow inside the silhouette'); }
    for (let k = 0; k + 1 < a.cells.length; k++) { // a continuous path, one step at a time
      const s = E.inPlane(surf.cells[a.cells[k]].n).map(d => surf.step(a.cells[k], d)).find(s => s && s.id === a.cells[k + 1]);
      assert.ok(s, 'consecutive cells are neighbours on the surface');
    }
    assert.equal(a.hd, a.dirs[a.dirs.length - 1], 'head points the way the last step went');
    assert.deepEqual(a.ray, surf.ray(a.head, a.hd));
    for (const r of a.ray) assert.ok(!a.cells.includes(r), 'an arrow never lies across its own way out');
  }
  // the solver's order really clears the board, each arrow free at its turn
  const occ = new Int32Array(surf.cells.length).fill(-1); arrows.forEach(a => a.cells.forEach(c => { occ[c] = a.i; }));
  const removed = new Uint8Array(arrows.length);
  assert.equal(P.solution.length, arrows.length);
  for (const i of P.solution) {
    assert.ok(arrows[i].ray.every(r => occ[r] < 0), `arrow ${i} free when its turn comes`);
    removed[i] = 1; arrows[i].cells.forEach(c => { occ[c] = -1; });
  }
  return seen.size;
}

test('every difficulty and shape generates a solvable, well-formed puzzle (2D)', () => {
  for (const diff of E.DIFFS.slice(0, 5)) for (const shape of E.SHAPES_2D) {
    const P = E.makePuzzle({ type: '2d', diff, shape, seed: E.hashStr(diff + shape) });
    const used = checkPuzzle(P), on = P.surf.cells.filter(c => c.on).length;
    assert.ok(used / on > 0.85, `${diff} ${shape}: only ${(used / on * 100).toFixed(0)}% filled`);
  }
});

test('every difficulty and solid generates a solvable, well-formed puzzle (3D)', () => {
  for (const diff of E.DIFFS) for (const [shape] of E.SOLIDS) {
    const P = E.makePuzzle({ type: '3d', diff, shape, seed: E.hashStr('3d' + diff + shape) });
    const used = checkPuzzle(P);
    assert.ok(used / P.surf.cells.length > 0.9, `${diff} ${shape} filled`);
  }
});

test('nightmare and impossible boards hold hundreds of arrows', () => {
  for (const [diff, min] of [['nightmare', 200], ['impossible', 300]]) {
    const P = E.makePuzzle({ type: '2d', diff, shape: 'square', seed: 7 });
    checkPuzzle(P);
    assert.ok(P.arrows.length >= min, `${diff}: ${P.arrows.length} arrows`);
    assert.ok(P.layers >= 20, `${diff}: dependency chain of ${P.layers}`);
  }
});

test('puzzles get bigger and more tangled with difficulty', () => {
  let prev = 0;
  for (const diff of E.DIFFS) {
    const P = E.makePuzzle({ type: '2d', diff, shape: 'square', seed: 11 });
    assert.ok(P.arrows.length > prev, `${diff} has more arrows than the level below`); prev = P.arrows.length;
  }
  const turns = d => { const P = E.makePuzzle({ type: '2d', diff: d, shape: 'square', seed: 3 }); return Math.max(...P.arrows.map(a => a.out.filter((x, k) => k && x !== a.out[k - 1]).length)); };
  assert.ok(turns('extreme') >= 4, 'hard boards have arrows with several turns');
});

test('generation is deterministic', () => {
  const spec = { type: '3d', diff: 'expert', shape: 'cube', seed: 1234 };
  assert.deepEqual(E.pathsFor(spec), E.pathsFor(spec));
});

test('box surface: every step can be retraced, and wrapping turns onto the next face', () => {
  const s = E.boxSurface(3, 4, 5);
  assert.equal(s.cells.length, 2 * (3 * 4 + 4 * 5 + 3 * 5));
  for (const c of s.cells) for (const d of E.inPlane(c.n)) {
    const st = s.step(c.id, d); assert.ok(st, 'a box has no edge to fall off');
    const back = s.step(st.id, E.OPP[st.d]); assert.equal(back.id, c.id);
    if (s.cells[st.id].n !== c.n) { assert.equal(st.d, E.OPP[c.n], 'goes down the next face'); assert.equal(s.cells[st.id].n, d, 'next face faces the way we were going'); }
  }
  // walking straight round a 3-wide band comes back to the start after 2*(3+5) steps
  let id = s.at(1.5, 0.5, 5), d = 0; const start = id;
  for (let k = 0; k < 16; k++) { const st = s.step(id, d); id = st.id; d = st.d; }
  assert.equal(id, start);
});

test('the way out stops at the edge of the face, so cross-face blockers are the ones that matter', () => {
  const s = E.boxSurface(3, 3, 3);
  const h = s.at(0.5, 1.5, 3); // on the +z face, heading +x
  assert.deepEqual(s.ray(h, 0).map(i => s.cells[i].c), [[1.5, 1.5, 3], [2.5, 1.5, 3]]);
  // an arrow that runs across the top face's edge and down the +x face sits in its way:
  // it blocks the top-face arrow even though its head is on another face
  const blocker = [s.at(2.5, 1.5, 3), s.at(3, 1.5, 2.5)];
  const runner = [s.at(0.5, 1.5, 3), s.at(1.5, 1.5, 3)];
  const arrows = E.finish(s, [blocker, runner]);
  assert.equal(s.cells[arrows[0].head].n, 0, 'blocker head is on the +x face');
  assert.equal(arrows[0].hd, 5, 'and heads down it (-z)');
  const sol = E.solve(arrows);
  assert.ok(sol.ok);
  assert.deepEqual([...sol.block[1]], [0], 'the wrapped arrow blocks the one on the top face');
  assert.deepEqual(sol.order, [0, 1]);
});

test('blocked arrows wait; once the way is clear they can go', () => {
  const s = E.flatSurface(4, 1);
  const arrows = E.finish(s, [[0, 1], [2, 3]]); // two arrows both pointing right: [→][→]
  const occ = new Int32Array(4).fill(-1); arrows.forEach(a => a.cells.forEach(c => { occ[c] = a.i; }));
  assert.deepEqual(E.freeArrows(arrows, new Uint8Array(2), occ), [1]);
  occ[2] = occ[3] = -1;
  assert.deepEqual(E.freeArrows(arrows, Uint8Array.from([0, 1]), occ), [0]);
  // two arrows facing each other can never both leave
  const stuck = E.finish(s, [[0, 1], [3, 2]]);
  assert.equal(E.solve(stuck).ok, false);
});

test('any free arrow is always a safe move (hints can never strand the board)', () => {
  const P = E.makePuzzle({ type: '2d', diff: 'expert', shape: 'heart', seed: 99 });
  const R = E.rng(5), occ = new Int32Array(P.surf.cells.length).fill(-1), removed = new Uint8Array(P.arrows.length);
  P.arrows.forEach(a => a.cells.forEach(c => { occ[c] = a.i; }));
  for (let step = 0; step < P.arrows.length; step++) {
    const free = E.freeArrows(P.arrows, removed, occ);
    assert.ok(free.length > 0, 'never stuck while arrows remain');
    const i = free[(R() * free.length) | 0]; removed[i] = 1; P.arrows[i].cells.forEach(c => { occ[c] = -1; });
    assert.ok(E.solve(P.arrows, removed).ok);
  }
});
