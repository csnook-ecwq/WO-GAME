// Builds Set 1 (15 levels, 15x15 and up, dense from the start) and writes ../levels.json.
// Every board is built backwards from an empty grid, so it is always clearable; its solution is
// recorded and replayed here before saving. usage: node tools/set1.cjs
const E = require('../engine.cjs');
const fs = require('fs'), path = require('path');

// how far a random tapper gets before the board locks (share of arrows cleared), averaged
function randomReach(c, W, H, R, n = 80) {
  const total = c.filter(Boolean).length; let sum = 0;
  for (let t = 0; t < n; t++) {
    let b = c, left = total;
    for (;;) { const m = E.moves(b, W, H); if (!m.length) break; b = E.fly(b, W, H, m[R() * m.length | 0]).cells; left--; }
    sum += (total - left) / total;
  }
  return sum / n;
}

const out = [];
for (let i = 0; i < 15; i++) {
  const t = i / 12;
  const N = i < 6 ? 15 : i < 10 ? 16 : 17;
  const night = i >= 13;
  const density = night ? 1 : 0.62 + 0.3 * t;
  const sw = night ? 0.7 : 0.45 + 0.22 * t;
  const target = night ? 0 : 0.45 - 0.3 * t;   // later boards lock up sooner under careless tapping
  const R = E.rng(4242 + i * 101);
  let best = null;
  for (let k = 0; k < 40; k++) {
    const c = E.build(N, N, { density, kinds: [1 - sw, sw], inward: 1.2 }, R);
    if (!c) continue;
    const reach = randomReach(c, N, N, R);
    const score = Math.abs(reach - target);
    if (!best || score < best.score) best = { c, reach, score };
  }
  const { c, reach } = best;
  // replay the recorded solution to be sure
  let b = c.slice();
  for (const j of c.solution) { if (!E.canFly(b, N, N, j)) throw new Error('bad solution on level ' + (i + 1)); b = E.fly(b, N, N, j).cells; }
  if (b.some(Boolean)) throw new Error('solution leaves arrows on level ' + (i + 1));
  const code = N + ',' + N + ',' + c.map(v => v.toString(36)).join('');
  out.push({ level: i + 1, code, arrows: c.filter(Boolean).length, firstFree: E.moves(c, N, N).length,
    randomReach: +reach.toFixed(3), solution: c.solution });
  console.log(`level ${i + 1}: ${N}x${N}, ${c.filter(Boolean).length} arrows, ${E.moves(c, N, N).length} free at start, random tapping clears ${(reach * 100).toFixed(0)}% before locking`);
}
fs.writeFileSync(path.join(__dirname, '..', 'levels.json'), JSON.stringify(out, null, 1));
