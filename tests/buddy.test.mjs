import { test } from 'node:test';
import assert from 'node:assert/strict';

// buddy.js touches the DOM only inside createBuddy(), so the geometry and the
// skins table can be imported and checked in plain node.
const { SKINS, skinFor, halfOutline, TOP, BOTTOM, HALF_WIDTH, MAX_HALF_WIDTH } =
  await import('../js/buddy.js');

const HEX = /^#[0-9A-Fa-f]{6}$/;

test('every skin is complete enough to draw with', () => {
  assert.ok(SKINS.length >= 1);
  for (const s of SKINS) {
    assert.match(s.id, /^[a-z][a-z0-9-]*$/, `${s.id}: id should be a slug`);
    assert.ok(s.name && s.name.length, `${s.id}: needs a display name`);
    assert.match(s.wash, HEX, `${s.id}: wash must be a six-digit hex`);
    assert.ok(s.contour, `${s.id}: needs a contour colour`);
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
  assert.equal(skinFor('pearl').id, 'pearl');
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
