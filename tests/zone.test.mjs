import { test } from 'node:test';
import assert from 'node:assert/strict';

const { L, ZONES, zoneFor, fitToZone, pickPlayer, isReady, createRepCounter } =
  await import('../js/zone.js');

const BRIDGE = ZONES.bridge;

/** A body with every landmark at the origin, then whatever you override. */
function body(overrides = {}, visibility = 1) {
  const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility }));
  for (const [k, v] of Object.entries(overrides)) {
    pts[k] = { x: v.x, y: v.y, visibility: v.visibility ?? visibility };
  }
  return pts;
}

/** Someone lying in the zone exactly as asked. */
function inZone(offset = { x: 0, y: 0 }) {
  const o = {};
  for (const t of BRIDGE.targets) {
    o[t.point] = { x: t.cx + offset.x, y: t.cy + offset.y };
  }
  return body(o);
}

test('a body in the zone reads as ready', () => {
  const fit = fitToZone(inZone(), BRIDGE);
  assert.equal(fit.inside, fit.total);
  assert.ok(isReady(fit));
  assert.ok(fit.score > 0.95, `dead centre should score near 1, got ${fit.score}`);
  assert.deepEqual(fit.misses, []);
});

test('the readiness meter moves while you shuffle into place', () => {
  // Without partial credit the meter sits at zero until you are already there,
  // which is exactly when it has nothing useful left to tell you.
  const far = fitToZone(inZone({ x: 0.3, y: 0.3 }), BRIDGE).score;
  const near = fitToZone(inZone({ x: 0.1, y: 0.1 }), BRIDGE).score;
  const there = fitToZone(inZone(), BRIDGE).score;
  assert.ok(far < near, `${far} should be under ${near}`);
  assert.ok(near < there, `${near} should be under ${there}`);
});

test('landmarks the model is guessing at do not count', () => {
  // Low visibility is how a chair leg becomes a knee.
  const guessed = inZone().map((p) => ({ ...p, visibility: 0.2 }));
  const fit = fitToZone(guessed, BRIDGE);
  assert.equal(fit.inside, 0);
  assert.equal(fit.misses.length, fit.total);
  assert.ok(!isReady(fit));
});

test('a missing landmark is named, not silently ignored', () => {
  const partial = inZone();
  partial[L.leftKnee] = undefined;
  const fit = fitToZone(partial, BRIDGE);
  assert.ok(fit.misses.includes('left knee'));
  assert.ok(!isReady(fit));
});

/* ------------------------------------------------------- the television bug */

test('a person on the television cannot become the player', () => {
  // This is the failure that killed the last attempt, written down. Someone on
  // a screen across the room is a real, complete, perfectly plausible human —
  // every "is this a person" check passes them. What they are not is lying on
  // the floor in the zone.
  const onTv = body({
    [L.leftKnee]: { x: 0.08, y: 0.12 },
    [L.rightKnee]: { x: 0.13, y: 0.12 },
    [L.leftHip]: { x: 0.09, y: 0.20 },
    [L.rightHip]: { x: 0.13, y: 0.20 },
  });
  assert.equal(pickPlayer([onTv], BRIDGE), null);

  // And with a real player also in frame, she wins rather than merely tying.
  const picked = pickPlayer([onTv, inZone()], BRIDGE);
  assert.equal(picked.index, 1);
  assert.ok(isReady(picked.fit));
});

test('furniture that holds still is still not a player', () => {
  const chair = body({
    [L.leftKnee]: { x: 0.02, y: 0.95 },
    [L.rightKnee]: { x: 0.97, y: 0.95 },
  });
  assert.equal(pickPlayer([chair], BRIDGE), null);
});

test('an empty room picks nobody rather than picking badly', () => {
  assert.equal(pickPlayer([], BRIDGE), null);
  assert.equal(pickPlayer(undefined, BRIDGE), null);
});

test('zoneFor always returns a zone', () => {
  assert.equal(zoneFor('bridge').id, 'bridge');
  assert.equal(zoneFor('nope').id, 'bridge');
  assert.equal(zoneFor(undefined).id, 'bridge');
});

/* ------------------------------------------------------------------- reps */

const atHip = (y) => body({ [L.leftHip]: { x: 0.4, y }, [L.rightHip]: { x: 0.6, y } });

function calibrated(rep, y = 0.70) {
  for (let i = 0; i < 20; i++) rep.calibrate(atHip(y));
  return rep;
}

test('a bridge counts when the hips go up and come back down', () => {
  const rep = calibrated(createRepCounter());
  assert.equal(rep.push(atHip(0.70)).count, 0);
  assert.equal(rep.push(atHip(0.63)).count, 0, 'not counted at the top');
  const done = rep.push(atHip(0.70));
  assert.equal(done.count, 1, 'counted on the way back down');
  assert.ok(done.popped);
});

test('holding at the top does not rack up reps', () => {
  // The bug this guards: a shaky hold at the top registering as twenty.
  const rep = calibrated(createRepCounter());
  rep.push(atHip(0.70));
  for (let i = 0; i < 40; i++) rep.push(atHip(0.63 + Math.sin(i) * 0.004));
  assert.equal(rep.count, 0);
  rep.push(atHip(0.70));
  assert.equal(rep.count, 1);
});

test('a small wobble is not a rep', () => {
  const rep = calibrated(createRepCounter());
  for (let i = 0; i < 30; i++) rep.push(atHip(0.70 - (i % 2) * 0.02));
  assert.equal(rep.count, 0);
});

test('lift runs 0 to 1 so the bubble has something to follow', () => {
  const rep = calibrated(createRepCounter({ rise: 0.05 }));
  assert.equal(rep.push(atHip(0.70)).lift, 0);
  assert.ok(Math.abs(rep.push(atHip(0.675)).lift - 0.5) < 0.01);
  assert.equal(rep.push(atHip(0.62)).lift, 1, 'clamped, not unbounded');
});

test('the baseline is a median, so one bad frame cannot poison it', () => {
  const rep = createRepCounter();
  for (let i = 0; i < 20; i++) rep.calibrate(atHip(0.70));
  rep.calibrate(atHip(0.10));          // one frame where a knee was read as a hip
  rep.calibrate(atHip(0.70));
  assert.ok(Math.abs(rep.baseline - 0.70) < 0.001,
    `baseline drifted to ${rep.baseline}`);
});

test('no hips means no reps and no crash', () => {
  const rep = createRepCounter();
  const blind = body({}, 0.1);
  assert.equal(rep.calibrate(blind), false);
  const out = rep.push(blind);
  assert.equal(out.count, 0);
  assert.equal(out.lift, 0);
  assert.equal(out.popped, false);
});

test('nothing counts before calibration', () => {
  // Otherwise the first frame sets an accidental baseline and everything after
  // it is measured against wherever she happened to be standing.
  const rep = createRepCounter();
  assert.equal(rep.push(atHip(0.30)).count, 0);
  assert.equal(rep.push(atHip(0.70)).count, 0);
});
