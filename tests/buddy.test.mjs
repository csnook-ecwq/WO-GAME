import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// buddy.js touches the DOM only inside createBuddy(), so the geometry and the
// skins table can be imported and checked in plain node.
const {
  SKINS, skinFor, halfOutline, TOP, BOTTOM, HALF_WIDTH, MAX_HALF_WIDTH,
  FACES, POSTURE, parseMaterial, MATERIAL_DEFAULTS, solveWash, washFor, CENTRE_ALPHA,
} = await import('../js/buddy.js');

const HEX = /^#[0-9A-Fa-f]{6}$/;

test('every skin is complete enough to draw with', () => {
  assert.ok(SKINS.length >= 1);
  for (const s of SKINS) {
    assert.match(s.id, /^[a-z][a-z0-9-]*$/, `${s.id}: id should be a slug`);
    assert.ok(s.name && s.name.length, `${s.id}: needs a display name`);
    // Colour is NOT stored on the skin — it comes from the --bubble-<id> token.
    assert.equal(s.wash, undefined, `${s.id}: wash must not be hardcoded`);
    assert.ok(MATERIAL_DEFAULTS.palette[s.id], `${s.id}: has no hue in the palette`);
    // Fewer than three bands and the "iridescence" is just a gradient.
    assert.ok(s.bands.length >= 3, `${s.id}: needs at least three bands`);
    for (const b of s.bands) assert.match(b, HEX, `${s.id}: band ${b} is not hex`);
  }
});

test('skin ids are unique', () => {
  const ids = SKINS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('an unknown skin falls back rather than drawing nothing', () => {
  assert.equal(skinFor('does-not-exist'), SKINS[0]);
  assert.equal(skinFor(undefined), SKINS[0]);
  assert.equal(skinFor('pink').id, 'pink');
});

/** Sample a cubic bezier, so control points are checked and not just endpoints. */
function bezier(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p1;
}

function samples(armLift) {
  const segs = halfOutline(armLift);
  const pts = [[0, TOP]];
  let [x0, y0] = [0, TOP];
  for (const [c1x, c1y, c2x, c2y, x, y] of segs) {
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      pts.push([bezier(x0, c1x, c2x, x, t), bezier(y0, c1y, c2y, y, t)]);
    }
    [x0, y0] = [x, y];
  }
  return pts;
}

test('the outline stays inside its declared bounding box', () => {
  // A mistyped control point flies off-canvas silently — the creature just looks
  // wrong. This catches it, at rest and at both ends of the arm swing.
  // At rest she must fit HALF_WIDTH, which is what the gradients are sized to.
  for (const [x] of samples(0)) {
    assert.ok(x >= -0.001 && x <= HALF_WIDTH + 0.001,
      `resting x ${x.toFixed(3)} outside 0..${HALF_WIDTH}`);
  }
  // Under any swing — including one the spring could never actually reach — she
  // must fit MAX_HALF_WIDTH, which is what the canvas is sized to.
  for (const lift of [-3, -1.2, -0.5, 0, 0.5, 1.2, 9]) {
    for (const [x, y] of samples(lift)) {
      assert.ok(x >= -0.001 && x <= MAX_HALF_WIDTH + 0.001,
        `armLift ${lift}: x ${x.toFixed(3)} outside 0..${MAX_HALF_WIDTH}`);
      assert.ok(y >= TOP - 0.001 && y <= BOTTOM + 0.001,
        `armLift ${lift}: y ${y.toFixed(3)} outside ${TOP}..${BOTTOM}`);
    }
  }
});

test('the half-outline starts at the apex and ends on the centre line', () => {
  const segs = halfOutline(0);
  const last = segs[segs.length - 1];
  // It must end at x = 0 or the mirrored half joins with a visible step at the
  // arch between the legs.
  assert.equal(last[4], 0);
  assert.ok(last[5] > 0 && last[5] < BOTTOM);
});

test('the arm swing moves the arm and leaves the rest alone', () => {
  const rest = halfOutline(0);
  const up = halfOutline(1);
  assert.equal(rest.length, up.length);

  // the dome and the shoulder are upstream of the pivot
  assert.deepEqual(rest[0], up[0]);
  assert.deepEqual(rest[1], up[1]);
  // the arm itself has to actually move, or `wave` does nothing
  assert.notDeepEqual(rest[2], up[2]);
  // and the torso below it is untouched
  assert.deepEqual(rest.at(-1), up.at(-1));
});

/* ------------------------------------------------------------- the material */

const reader = (map) => (name) => map[name] ?? '';

test('the material reads the tokens', () => {
  const m = parseMaterial(reader({
    '--bubble-body-opacity': ' 0.5 ',
    '--bubble-highlight': 'rgba(1,2,3,0.4)',
    '--bubble-face': '#ABCDEF',
    '--bubble-shadow': 'rgb(9, 8, 7)',
    '--bubble-shadow-blur': '18px',
    '--bubble-iridescent-pink': 'rgba(255,0,0,0.1)',
    '--bubble-mint': '#123456',
  }));
  assert.equal(m.bodyOpacity, 0.5);
  assert.equal(m.highlight, 'rgba(1,2,3,0.4)');
  assert.equal(m.faceInk, '#ABCDEF');
  assert.equal(m.shadow, 'rgb(9, 8, 7)');
  assert.equal(m.shadowBlur, 18);
  assert.equal(m.iridescent[0], 'rgba(255,0,0,0.1)');
  assert.equal(m.palette.mint, '#123456');
  // the ones not supplied fall back individually, not as a block
  assert.equal(m.iridescent[1], MATERIAL_DEFAULTS.iridescent[1]);
  assert.equal(m.palette.pink, MATERIAL_DEFAULTS.palette.pink);
});

test('a missing stylesheet gives the defaults, not a blank creature', () => {
  // This is the failure that matters: an unparsed --bubble-opacity would reach
  // globalAlpha as NaN, and a NaN globalAlpha draws absolutely nothing.
  for (const broken of [{}, { '--bubble-body-opacity': 'wat' },
                        { '--bubble-body-opacity': '' }]) {
    const m = parseMaterial(reader(broken));
    assert.equal(m.bodyOpacity, MATERIAL_DEFAULTS.bodyOpacity);
    assert.ok(Number.isFinite(m.bodyOpacity));
  }
});

test('nonsense colours fall back rather than drawing invisibly', () => {
  const m = parseMaterial(reader({
    '--bubble-highlight': 'not-a-colour',
    '--bubble-shadow': '   ',
    '--bubble-iridescent-blue': 'rgba(oops)',
  }));
  assert.equal(m.highlight, MATERIAL_DEFAULTS.highlight);
  assert.equal(m.shadow, MATERIAL_DEFAULTS.shadow);
  assert.equal(m.iridescent[1], MATERIAL_DEFAULTS.iridescent[1]);
});

test('material numbers are clamped to something drawable', () => {
  const m = parseMaterial(reader({
    '--bubble-body-opacity': '9', '--bubble-expression': '-3',
    '--bubble-shadow-blur': '-1',
  }));
  assert.equal(m.bodyOpacity, 1);
  assert.equal(m.expression, 0);
  assert.equal(m.shadowBlur, 0);
});

test('every material token in tokens.css is one the renderer reads', async () => {
  // Catches the quiet failure of a token being renamed in one file only.
  const css = await readFile(new URL('../styles/tokens.css', import.meta.url), 'utf8');
  const declared = [...css.matchAll(/(--bubble-[a-z-]+)\s*:/g)].map((m) => m[1]);
  assert.ok(declared.length >= 16, `only found ${declared.length} bubble tokens`);

  const src = await readFile(new URL('../js/buddy.js', import.meta.url), 'utf8');
  const hues = Object.keys(MATERIAL_DEFAULTS.palette).map((id) => `--bubble-${id}`);
  for (const name of declared) {
    // The hue tokens are read by template, not by literal.
    if (hues.includes(name)) continue;
    assert.ok(src.includes(`'${name}'`), `${name} is declared but never read`);
  }
  for (const hue of hues) {
    assert.ok(declared.includes(hue), `${hue} is read but never declared`);
  }
});

/* ------------------------------------------------------------------ colour */

test('the wash solves back to the hue it came from', () => {
  // The whole point of deriving rather than storing: whatever the token says,
  // the middle of her body has to land on it.
  const mat = parseMaterial(reader({}));
  const alpha = CENTRE_ALPHA * mat.bodyOpacity;
  for (const s of SKINS) {
    const base = mat.palette[s.id];
    const paint = washFor(s.id, mat);
    const hex = (c, i) => parseInt(c.replace('#', '').slice(i, i + 2), 16);
    for (const i of [0, 2, 4]) {
      const seen = hex(paint, i) * alpha + hex(mat.bg, i) * (1 - alpha);
      assert.ok(Math.abs(seen - hex(base, i)) <= 1.5,
        `${s.id}: channel ${i / 2} renders ${seen.toFixed(1)}, token says ${hex(base, i)}`);
    }
  }
});

test('an unknown hue still paints something', () => {
  const mat = parseMaterial(reader({}));
  assert.match(washFor('nonsense', mat), HEX);
  assert.match(solveWash('#FFFFFF', '#FFFFFF', 0), HEX);
});

/* ------------------------------------------------------------------- faces */

test('every face has a posture', () => {
  assert.equal(FACES.length, 10);
  for (const f of FACES) assert.ok(POSTURE[f], `${f} has no posture`);
  assert.equal(Object.keys(POSTURE).length, FACES.length);
});

test('expression scales toward neutral, and bob/rate toward one', () => {
  // The trap this guards: bob and rate are multipliers around 1. Scaling them
  // the same way as tilt would send them to zero at low expression, which stops
  // her breathing rather than calming her.
  const off = parseMaterial(reader({ '--bubble-expression': '0' }));
  assert.equal(off.expression, 0);
  const full = parseMaterial(reader({ '--bubble-expression': '1' }));
  assert.equal(full.expression, 1);
  assert.equal(parseMaterial(reader({ '--bubble-expression': '4' })).expression, 1);

  for (const mood of Object.keys(POSTURE)) {
    const p = POSTURE[mood];
    for (const e of [0, 0.6, 1]) {
      assert.ok(Math.abs(p.tilt * e) <= Math.abs(p.tilt) + 1e-9);
      assert.ok(Math.abs((1 + (p.bob - 1) * e) - 1) <= Math.abs(p.bob - 1) + 1e-9);
      assert.ok(1 + (p.rate - 1) * e > 0, `${mood} at ${e} would stop her breathing`);
    }
  }
});
