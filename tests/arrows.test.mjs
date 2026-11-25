// Drift (arrows/): every shipped level must be clearable, and its recorded solution must work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const E = require('../arrows/engine.cjs');
const levels = JSON.parse(readFileSync(new URL('../arrows/levels.json', import.meta.url), 'utf8'));
const decode = code => { const [w, h, c] = code.split(','); return { W: +w, H: +h, cells: [...c].map(ch => parseInt(ch, 36)) }; };

test('fifteen levels ship', () => assert.equal(levels.length, 15));

for (const L of levels) {
  test(`level ${L.level}: recorded solution clears the board`, () => {
    let { W, H, cells } = decode(L.code);
    assert.equal(cells.length, W * H);
    for (const i of L.solution) {
      assert.ok(E.canFly(cells, W, H, i), `tap ${i} should be free`);
      cells = E.fly(cells, W, H, i).cells;
    }
    assert.ok(!cells.some(Boolean));
  });
}

test('every level is at least 15x15 and starts dense, and they get denser', () => {
  let prev = 0;
  for (const L of levels) {
    const { W, H, cells } = decode(L.code);
    assert.ok(W >= 15 && H >= 15, `level ${L.level} is ${W}x${H}`);
    const density = cells.filter(Boolean).length / cells.length;
    assert.ok(density >= 0.6, `level ${L.level} density ${density}`);
    assert.ok(density >= prev - 0.02, `level ${L.level} is sparser than the one before`);
    prev = density;
  }
});

test('the builder can fill big grids completely', () => {
  for (let s = 1; s <= 10; s++) {
    const c = E.build(17, 17, { density: 1, kinds: [0.3, 0.7], inward: 1.2 }, E.rng(s));
    assert.ok(c && c.every(Boolean), 'seed ' + s);
    let b = c.slice();
    for (const i of c.solution) { assert.ok(E.canFly(b, 17, 17, i)); b = E.fly(b, 17, 17, i).cells; }
    assert.ok(!b.some(Boolean));
  }
});

test('the last two levels fill the whole grid', () => {
  for (const L of levels.slice(13)) assert.ok(decode(L.code).cells.every(Boolean));
});

test('a blocked arrow cannot fly; a freed one can', () => {
  // row: [> >] — the left arrow waits on the right one
  const c = [E.mk(0, 1), E.mk(0, 1)];
  assert.equal(E.canFly(c, 2, 1, 0), false);
  assert.equal(E.canFly(c, 2, 1, 1), true);
  assert.equal(E.canFly(E.fly(c, 2, 1, 1).cells, 2, 1, 0), true);
});

test('turning arrows turn when a neighbour leaves', () => {
  const c = [E.mk(0, 0), E.mk(1, 0), E.mk(2, 0), E.mk(3, 0)]; // plain, cw, ccw, flip — all pointing up
  const after = E.fly([c[0], c[1]], 2, 1, 0).cells;
  assert.equal(E.dirOf(after[1]), 1);
  assert.equal(E.dirOf(E.fly([c[0], c[2]], 2, 1, 0).cells[1]), 3);
  assert.equal(E.dirOf(E.fly([c[0], c[3]], 2, 1, 0).cells[1]), 2);
});

test('generated boards are always solvable', () => {
  for (let s = 1; s <= 40; s++) {
    const R = E.rng(s);
    const c = E.build(5, 6, { density: 0.75, kinds: [0.4, 0.3, 0.15, 0.15], inward: 1.5 }, R);
    if (!c) continue;
    const r = E.solve(c, 5, 6, 1e6);
    assert.ok(r && r.ok, 'seed ' + s);
  }
});
