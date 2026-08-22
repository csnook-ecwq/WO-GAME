import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LM, SIGNALS, buildFrame, angleAt, distanceToLine, visibilityOf,
  createRepCounter, createExerciseTracker, TIER, tierFor, tierSatisfies,
  createPoseGate, framingReport,
} from '../js/detectors.js';
import {
  EXERCISES, ROUTINES, EXERCISE_BY_ID, POSITIONS, VIEWS,
  routineReps, routineXp, routinePositions, repPoints, POINTS_PER_XP,
} from '../js/exercises.js';
import { rankFor, streak, LEVEL_TITLES } from '../js/store.js';
import { mapFromRotated, ROTATIONS } from '../js/pose.js';
import { LEVELS, WORLDS, levelView, levelReps, isUnlocked, nextLevel } from '../js/levels.js';
import { comboMultiplier, starsFor, isHit, targetFor, orbCoords, liftSide } from '../js/game.js';

/* ------------------------------------------------------------ fake bodies */

/**
 * A neutral body lying flat with the head "up" the frame. Overrides move one
 * joint. Rotating this with `rotate()` produces exactly what the camera sees
 * when someone is lying on the floor at any angle to the phone.
 */
function body(overrides = {}) {
  const base = {
    [LM.NOSE]: [0.50, 0.10],
    [LM.L_SHOULDER]: [0.42, 0.25], [LM.R_SHOULDER]: [0.58, 0.25],
    [LM.L_ELBOW]: [0.38, 0.38], [LM.R_ELBOW]: [0.62, 0.38],
    [LM.L_WRIST]: [0.36, 0.50], [LM.R_WRIST]: [0.64, 0.50],
    [LM.L_HIP]: [0.45, 0.55], [LM.R_HIP]: [0.55, 0.55],
    [LM.L_KNEE]: [0.45, 0.72], [LM.R_KNEE]: [0.55, 0.72],
    [LM.L_ANKLE]: [0.45, 0.90], [LM.R_ANKLE]: [0.55, 0.90],
    [LM.L_HEEL]: [0.44, 0.92], [LM.R_HEEL]: [0.56, 0.92],
    [LM.L_FOOT]: [0.47, 0.93], [LM.R_FOOT]: [0.53, 0.93],
  };
  return Array.from({ length: 33 }, (_, i) => {
    const [x, y] = overrides[i] || base[i] || [0.5, 0.5];
    return { x, y, z: 0, visibility: 0.95 };
  });
}

/** Rotates a whole body about the centre of the frame. */
function rotate(lms, deg, cx = 0.5, cy = 0.5) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return lms.map((p) => ({
    ...p,
    x: cx + (p.x - cx) * c - (p.y - cy) * s,
    y: cy + (p.x - cx) * s + (p.y - cy) * c,
  }));
}

const sig = (name, lms) => SIGNALS[name](buildFrame(lms));

/** Feeds a triangle/sine wave through a counter and returns the rep total. */
function driveWave(counter, { amplitude, cycles, framesPerCycle = 30, baseline = 0, signed = false, msPerFrame = 33 }) {
  for (let i = 0; i < 20; i++) counter.calibrate(baseline);
  let t = 0;
  for (let c = 0; c < cycles; c++) {
    for (let f = 0; f < framesPerCycle; f++) {
      const phase = (f / framesPerCycle) * Math.PI * 2;
      const v = signed
        ? baseline + Math.sin(phase) * amplitude
        : baseline + ((1 - Math.cos(phase)) / 2) * amplitude;
      t += msPerFrame;
      counter.update(v, t);
    }
  }
  return counter.reps;
}

/* ------------------------------------------------------- frame + geometry */

test('buildFrame derives a stable body scale and reference frame', () => {
  const f = buildFrame(body());
  assert.ok(f.scale > 0.2 && f.scale < 0.6, `unexpected scale ${f.scale}`);
  // u points from the hips toward the head: straight "up" the frame here.
  assert.ok(Math.abs(f.u.x) < 1e-9 && f.u.y < 0);
  // The shoulders are one torso length along the body axis from the hips.
  assert.ok(Math.abs(f.along(f.shoulderMid) - f.torso / f.scale) < 1e-9);
  assert.ok(Math.abs(f.across(f.shoulderMid)) < 1e-9);
  assert.equal(buildFrame(null), null);
  assert.equal(buildFrame([{ x: 0, y: 0 }]), null);
});

test('distanceToLine measures perpendicular offset', () => {
  assert.equal(distanceToLine({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 5, y: 0 }), 1);
  assert.equal(distanceToLine({ x: 3, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }), 0);
});

test('angleAt measures the interior angle', () => {
  assert.equal(Math.round(angleAt({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })), 90);
  assert.equal(Math.round(angleAt({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })), 180);
});

/* --------------------------------------------------- the lying-down claim */

test('every signal is identical for a body lying at any angle', () => {
  // Same pose, seen as if the person were lying head-left, head-right, upside
  // down, or at an awkward diagonal because the phone slid.
  const pose = body({
    [LM.L_KNEE]: [0.45, 0.60], [LM.R_KNEE]: [0.56, 0.68],
    [LM.L_ANKLE]: [0.43, 0.78], [LM.R_ANKLE]: [0.58, 0.86],
    [LM.L_WRIST]: [0.34, 0.42], [LM.R_WRIST]: [0.66, 0.55],
  });
  const upright = buildFrame(pose);
  for (const deg of [30, 90, 180, 270, 315]) {
    const rotated = buildFrame(rotate(pose, deg));
    for (const [name, fn] of Object.entries(SIGNALS)) {
      const a = fn(upright);
      const b = fn(rotated);
      assert.ok(
        Math.abs(a - b) < 1e-6,
        `${name} changed when the body rotated ${deg}°: ${a} vs ${b}`
      );
    }
  }
});

test('signals are unchanged by camera distance', () => {
  const pose = body({ [LM.L_KNEE]: [0.45, 0.60] });
  const near = buildFrame(pose);
  const far = buildFrame(pose.map((p) => ({ ...p, x: 0.25 + p.x * 0.5, y: 0.25 + p.y * 0.5 })));
  for (const [name, fn] of Object.entries(SIGNALS)) {
    assert.ok(Math.abs(fn(near) - fn(far)) < 1e-6, `${name} drifted with distance`);
  }
});

test('signals point the right way', () => {
  const rest = body();

  // Knees pulled toward the chest folds the hip: hipTuck rises.
  const tucked = body({ [LM.L_KNEE]: [0.45, 0.42], [LM.R_KNEE]: [0.55, 0.42] });
  assert.ok(sig('hipTuck', tucked) > sig('hipTuck', rest) + 0.5);

  // Shoulders curling toward the knees shortens that distance: crunch rises.
  const curled = body({ [LM.L_SHOULDER]: [0.42, 0.34], [LM.R_SHOULDER]: [0.58, 0.34] });
  assert.ok(sig('crunch', curled) > sig('crunch', rest));

  // Hips pushed off the shoulder-to-knee line: bridge rises.
  const bridged = body({ [LM.L_HIP]: [0.55, 0.55], [LM.R_HIP]: [0.65, 0.55] });
  assert.ok(sig('bridge', bridged) > sig('bridge', rest) + 0.1);

  // One foot up and the other down. Which side reads positive depends on which
  // way you happen to be facing, so what matters is that the two mirror poses
  // swing hard in opposite directions either side of the resting value.
  const kickA = body({ [LM.L_ANKLE]: [0.30, 0.90], [LM.R_ANKLE]: [0.62, 0.90] });
  const kickB = body({ [LM.L_ANKLE]: [0.62, 0.90], [LM.R_ANKLE]: [0.30, 0.90] });
  const restSplit = sig('ankleSplit', rest);
  assert.ok(sig('ankleSplit', kickA) < restSplit - 0.2);
  assert.ok(sig('ankleSplit', kickB) > restSplit + 0.2);
  assert.ok(Math.sign(sig('ankleSplit', kickA) - restSplit) !== Math.sign(sig('ankleSplit', kickB) - restSplit));

  // Feet apart: legSpread rises.
  const wide = body({ [LM.L_ANKLE]: [0.28, 0.90], [LM.R_ANKLE]: [0.72, 0.90] });
  assert.ok(sig('legSpread', wide) > sig('legSpread', rest) + 0.5);

  // A bent knee lowers kneeExtend.
  const bent = body({ [LM.L_ANKLE]: [0.60, 0.80], [LM.R_ANKLE]: [0.70, 0.80] });
  assert.ok(sig('kneeExtend', bent) < sig('kneeExtend', rest) - 0.1);

  // Bent elbows raise elbowBend.
  const folded = body({ [LM.L_WRIST]: [0.44, 0.28], [LM.R_WRIST]: [0.56, 0.28] });
  assert.ok(sig('elbowBend', folded) > sig('elbowBend', rest) + 0.4);

  // Hands apart: armSpread rises.
  const armsOut = body({ [LM.L_WRIST]: [0.15, 0.40], [LM.R_WRIST]: [0.85, 0.40] });
  assert.ok(sig('armSpread', armsOut) > sig('armSpread', rest) + 0.8);

  // One knee drawn up the body: kneeAlternate swings.
  const leftKnee = body({ [LM.L_KNEE]: [0.45, 0.55] });
  assert.ok(sig('kneeAlternate', leftKnee) > 0.2);
});

/* ------------------------------------------------------------- rep counting */

test('cycle counter counts one rep per full swing', () => {
  const counter = createRepCounter({ mode: 'cycle', enter: 0.3, exit: 0.12, minIntervalMs: 200 });
  assert.equal(driveWave(counter, { amplitude: 0.5, cycles: 8 }), 8);
});

test('cycle counter ignores movement below threshold', () => {
  const counter = createRepCounter({ mode: 'cycle', enter: 0.3, exit: 0.12, minIntervalMs: 200, adaptive: false });
  assert.equal(driveWave(counter, { amplitude: 0.08, cycles: 10 }), 0);
});

test('adaptive thresholds learn a shallow but consistent range', () => {
  const counter = createRepCounter({ mode: 'cycle', enter: 0.5, exit: 0.2, minIntervalMs: 200 });
  const reps = driveWave(counter, { amplitude: 0.32, cycles: 12 });
  assert.ok(reps >= 9, `expected the counter to adapt, got ${reps} reps`);
});

test('adaptive mode still ignores jitter', () => {
  const counter = createRepCounter({ mode: 'cycle', enter: 0.3, exit: 0.12, minIntervalMs: 200 });
  assert.equal(driveWave(counter, { amplitude: 0.05, cycles: 20, framesPerCycle: 20 }), 0);
});

test('alternate counter counts every side change', () => {
  const counter = createRepCounter({ mode: 'alternate', enter: 0.15, minIntervalMs: 150 });
  assert.equal(driveWave(counter, { amplitude: 0.4, cycles: 6, signed: true, framesPerCycle: 40 }), 12);
});

test('alternate counter does not double-count one long hold', () => {
  const counter = createRepCounter({ mode: 'alternate', enter: 0.15, minIntervalMs: 150 });
  for (let i = 0; i < 20; i++) counter.calibrate(0);
  let t = 0;
  for (let i = 0; i < 200; i++) { t += 33; counter.update(0.5, t); }
  assert.equal(counter.reps, 1);
});

test('adaptive alternate mode ignores a trembling baseline', () => {
  const counter = createRepCounter({ mode: 'alternate', enter: 0.15, minIntervalMs: 150 });
  assert.equal(driveWave(counter, { amplitude: 0.04, cycles: 20, signed: true, framesPerCycle: 20 }), 0);
});

test('minimum interval rejects impossible rep rates', () => {
  const counter = createRepCounter({ mode: 'cycle', enter: 0.3, exit: 0.1, minIntervalMs: 600, adaptive: false });
  const reps = driveWave(counter, { amplitude: 0.6, cycles: 10, framesPerCycle: 6 });
  assert.ok(reps <= 4, `debounce failed, counted ${reps}`);
});

test('calibration re-bases the resting pose', () => {
  const counter = createRepCounter({ mode: 'cycle', enter: 0.3, exit: 0.12, adaptive: false, minIntervalMs: 100 });
  assert.equal(driveWave(counter, { amplitude: 0.5, cycles: 5, baseline: 5 }), 5);
});

/* ------------------------------------------------------------------ tracker */

test('tracker refuses to count when the legs are not visible', () => {
  const tracker = createExerciseTracker(EXERCISE_BY_ID['flutter-kicks']);
  const hidden = body().map((p, i) =>
    EXERCISE_BY_ID['flutter-kicks'].needs.includes(i) ? { ...p, visibility: 0.05 } : p
  );
  const out = tracker.update(hidden, 100);
  assert.equal(out.tracking, false);
  assert.equal(out.reason, 'framing');
  assert.equal(out.reps, 0);
  assert.equal(tracker.update(null, 200).reason, 'nobody');
});

test('end to end: flutter kicks counted while lying at 90° to the camera', () => {
  const tracker = createExerciseTracker(EXERCISE_BY_ID['flutter-kicks']);
  const lying = (lms) => rotate(lms, 90);          // head to the left of frame
  let t = 0;
  for (let i = 0; i < 20; i++) { t += 33; tracker.update(lying(body()), t, true); }

  const KICKS = 12;
  for (let k = 0; k < KICKS; k++) {
    const left = k % 2 === 0;
    for (let f = 0; f < 10; f++) {
      const swing = Math.sin((f / 10) * Math.PI) * 0.12;
      const lm = body({
        [LM.L_ANKLE]: [0.45 + (left ? -swing : swing), 0.90],
        [LM.R_ANKLE]: [0.55 + (left ? swing : -swing), 0.90],
      });
      t += 33;
      tracker.update(lying(lm), t);
    }
  }
  const counted = tracker.counter.reps;
  assert.ok(counted >= KICKS - 1 && counted <= KICKS + 1, `counted ${counted} of ${KICKS} kicks`);
});

test('end to end: bridges counted while lying at 90° to the camera', () => {
  const tracker = createExerciseTracker(EXERCISE_BY_ID['glute-bridge']);
  const lying = (lms) => rotate(lms, -90);
  let t = 0;
  const flat = body({ [LM.L_KNEE]: [0.40, 0.70], [LM.R_KNEE]: [0.60, 0.70] });
  for (let i = 0; i < 20; i++) { t += 33; tracker.update(lying(flat), t, true); }

  const REPS = 8;
  for (let r = 0; r < REPS; r++) {
    for (let f = 0; f < 24; f++) {
      const lift = Math.sin((f / 24) * Math.PI) * 0.13;   // hips travel up and back
      const lm = body({
        [LM.L_HIP]: [0.45 - lift, 0.55], [LM.R_HIP]: [0.55 - lift, 0.55],
        [LM.L_KNEE]: [0.40, 0.70], [LM.R_KNEE]: [0.60, 0.70],
      });
      t += 33;
      tracker.update(lying(lm), t);
    }
  }
  const counted = tracker.counter.reps;
  assert.ok(counted >= REPS - 1 && counted <= REPS + 1, `counted ${counted} of ${REPS} bridges`);
});

/* ----------------------------------------------------------------- content */

test('every exercise is done lying down', () => {
  for (const ex of EXERCISES) {
    assert.ok(POSITIONS[ex.position], `${ex.id}: "${ex.position}" is not a lying position`);
  }
});

test('every exercise is wired to a real signal and sane detector', () => {
  for (const ex of EXERCISES) {
    assert.ok(SIGNALS[ex.signal], `${ex.id}: unknown signal ${ex.signal}`);
    assert.ok(ex.needs?.length, `${ex.id}: no required landmarks`);
    assert.ok(ex.needs.every((i) => i >= 0 && i < 33), `${ex.id}: landmark index out of range`);
    assert.ok(ex.detector?.enter > 0, `${ex.id}: missing enter threshold`);
    if (ex.detector.mode === 'cycle') {
      assert.ok(ex.detector.exit < ex.detector.enter, `${ex.id}: exit must sit below enter`);
    }
    assert.ok(ex.cue && ex.framing && ex.tips.length, `${ex.id}: missing coaching copy`);
    assert.doesNotThrow(() => createExerciseTracker(ex));
    // The signal must actually be computable from the landmarks we require.
    assert.ok(Number.isFinite(sig(ex.signal, body())), `${ex.id}: signal is not finite at rest`);
  }
});

test('every routine references real exercises and scores points', () => {
  const ids = new Set(EXERCISES.map((e) => e.id));
  for (const r of ROUTINES) {
    assert.ok(r.moves.length >= 2, `${r.id}: too short`);
    for (const [id, reps] of r.moves) {
      assert.ok(ids.has(id), `${r.id}: unknown exercise ${id}`);
      assert.ok(reps > 0 && reps <= 60, `${r.id}: silly rep count for ${id}`);
      assert.equal(EXERCISE_BY_ID[id].area, EXERCISE_BY_ID[id].area);
    }
    assert.ok(routineReps(r) > 0 && routineXp(r) > 0);
    assert.ok(routinePositions(r).every((p) => POSITIONS[p]), `${r.id}: bad position tag`);
  }
});

test('every area offers at least three routines', () => {
  const byArea = {};
  for (const r of ROUTINES) byArea[r.area] = (byArea[r.area] || 0) + 1;
  for (const area of ['legs', 'glutes', 'core', 'arms', 'cardio', 'full']) {
    assert.ok(byArea[area] >= 3, `${area} only has ${byArea[area] || 0} routines`);
  }
});

test('rep points line up with the score shown during a workout', () => {
  const ex = EXERCISE_BY_ID['glute-bridge'];
  assert.equal(repPoints(ex.id), ex.xp * POINTS_PER_XP);
  assert.equal(repPoints(ex.id, 2), ex.xp * POINTS_PER_XP * 2);
  // A full clean run of a routine scores its advertised total.
  for (const r of ROUTINES) {
    const live = r.moves.reduce((n, [id, reps]) => n + repPoints(id, r.xpMultiplier || 1) * reps, 0);
    assert.equal(live, routineXp(r) * POINTS_PER_XP, `${r.id}: live score does not match the tag`);
  }
});

/* -------------------------------------------------------------- rotation IO */

test('landmarks map back from every rotation the prober tries', () => {
  // Mirrors the canvas transform used before inference.
  const forward = {
    0: (x, y) => [x, y],
    90: (x, y) => [1 - y, x],
    180: (x, y) => [1 - x, 1 - y],
    270: (x, y) => [y, 1 - x],
  };
  for (const deg of ROTATIONS) {
    for (const [x, y] of [[0.1, 0.2], [0.72, 0.94], [0.5, 0.5]]) {
      const [cx, cy] = forward[deg](x, y);
      const back = mapFromRotated({ x: cx, y: cy, visibility: 0.9 }, deg);
      assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.y - y) < 1e-9, `rotation ${deg} does not round-trip`);
      assert.equal(back.visibility, 0.9, 'mapping must preserve the other landmark fields');
    }
  }
});

/* -------------------------------------------------------------- progression */

test('ranks are ordered and map stars correctly', () => {
  for (let i = 1; i < LEVEL_TITLES.length; i++) {
    assert.ok(LEVEL_TITLES[i].stars > LEVEL_TITLES[i - 1].stars);
  }
  assert.equal(rankFor(0).index, 0);
  assert.equal(rankFor(LEVEL_TITLES[2].stars).title, LEVEL_TITLES[2].title);
  assert.equal(rankFor(LEVEL_TITLES[1].stars - 1).index, 0);
  assert.equal(rankFor(9999).progress, 1);
  const mid = rankFor(Math.round((LEVEL_TITLES[1].stars + LEVEL_TITLES[2].stars) / 2));
  assert.ok(mid.progress > 0.3 && mid.progress < 0.7);
});

test('streak counts consecutive days and tolerates a session today', () => {
  const day = 86400000;
  const now = Date.now();
  assert.equal(streak([]), 0);
  assert.equal(streak([{ ts: now }, { ts: now - day }, { ts: now - 2 * day }]), 3);
  assert.equal(streak([{ ts: now }, { ts: now - 2 * day }]), 1);
  assert.equal(streak([{ ts: now - day }, { ts: now - 2 * day }]), 2);
  assert.equal(streak([{ ts: now - 5 * day }]), 0);
});

test('visibilityOf averages the landmarks it is given', () => {
  const lms = body();
  assert.ok(visibilityOf(lms, [LM.L_ANKLE, LM.R_ANKLE]) > 0.9);
  assert.equal(visibilityOf(lms, []), 0);
  assert.equal(visibilityOf(null, [1]), 0);
});

/* ------------------------------------------------------- tiered body frames */

/** Hides landmarks from the frame builder, the way a phone held low would. */
function hide(lms, indices) {
  return lms.map((p, i) => (indices.includes(i) ? { ...p, visibility: 0.02 } : p));
}

const SHOULDERS = [LM.L_SHOULDER, LM.R_SHOULDER];

test('a hips-to-feet view still produces a usable body frame', () => {
  const full = buildFrame(body());
  assert.equal(full.tier, TIER.TORSO);

  const legsOnly = buildFrame(hide(body(), SHOULDERS));
  assert.ok(legsOnly, 'a body with no shoulders in shot must still give a frame');
  assert.equal(legsOnly.tier, TIER.PELVIS);
  // Head-ward is inferred from the knees sitting foot-ward of the hips, so it
  // should agree with the direction the shoulders would have given.
  const agreement = legsOnly.u.x * full.u.x + legsOnly.u.y * full.u.y;
  assert.ok(agreement > 0.95, `pelvis frame points the wrong way (dot ${agreement})`);
});

test('with no hips in shot, the shins still give a frame', () => {
  // Pointing the phone at your own feet from a chair: no torso, no hips, just
  // legs. Enough for joint-angle moves like toe points.
  const feetOnly = buildFrame(hide(body(), [...SHOULDERS, LM.L_HIP, LM.R_HIP]));
  assert.ok(feetOnly, 'knees and ankles should be enough for a limb frame');
  assert.equal(feetOnly.tier, TIER.LIMB);
  assert.ok(feetOnly.scale > 0.2, `limb scale looks wrong: ${feetOnly.scale}`);

  // Lose the legs as well and there is genuinely nothing to work with.
  assert.equal(buildFrame(hide(body(), [...SHOULDERS, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE])), null);
  // Hips visible but nothing to orient against.
  assert.equal(buildFrame(hide(body(), [...SHOULDERS, LM.L_KNEE, LM.R_KNEE])), null);
});

test('toe points count with only the feet in shot', () => {
  // The exact case that failed on the phone: ankle pumps, feet only.
  const tracker = createExerciseTracker(EXERCISE_BY_ID['ankle-pumps']);
  const feetOnly = (lms) => hide(lms, [...SHOULDERS, LM.L_HIP, LM.R_HIP]);
  let t = 0;
  for (let i = 0; i < 24; i++) { t += 33; tracker.update(feetOnly(body()), t, true); }

  const PUMPS = 8;
  for (let r = 0; r < PUMPS; r++) {
    for (let f = 0; f < 18; f++) {
      // Toes swing from pointed to pulled back, pivoting at the ankle.
      const point = Math.sin((f / 18) * Math.PI) * 0.05;
      const lm = body({
        [LM.L_FOOT]: [0.47, 0.93 + point], [LM.R_FOOT]: [0.53, 0.93 + point],
      });
      t += 33;
      tracker.update(feetOnly(lm), t);
    }
  }
  assert.ok(tracker.counter.reps >= PUMPS - 1, `only counted ${tracker.counter.reps} of ${PUMPS} toe points`);
});

test('locked head-ward survives knees coming above the hips', () => {
  // Legs extended: the frame can work out head-ward on its own.
  const rest = buildFrame(hide(body(), SHOULDERS));
  const locked = { x: rest.u.x, y: rest.u.y };

  // Knees pulled past the hip line — now the "knees are foot-ward" assumption
  // is false, and an unlocked frame flips its axis by 180°.
  const tucked = hide(body({ [LM.L_KNEE]: [0.45, 0.38], [LM.R_KNEE]: [0.55, 0.38] }), SHOULDERS);
  const unlocked = buildFrame(tucked);
  const held = buildFrame(tucked, { headWard: locked });

  assert.ok(unlocked.u.x * locked.x + unlocked.u.y * locked.y < 0, 'expected the naive frame to flip');
  assert.ok(held.u.x * locked.x + held.u.y * locked.y > 0.99, 'locked frame must not flip');
});

test('hipTuck reads the same in both tiers', () => {
  // Head-ward is locked from the resting pose, exactly as the tracker does
  // during the countdown — without it a deep tuck flips the pelvis frame.
  const locked = buildFrame(hide(body(), SHOULDERS)).headWard;

  for (const pose of [
    body(),
    body({ [LM.L_KNEE]: [0.45, 0.60], [LM.R_KNEE]: [0.55, 0.60] }),
    body({ [LM.L_KNEE]: [0.45, 0.50], [LM.R_KNEE]: [0.55, 0.50] }),
    body({ [LM.L_KNEE]: [0.45, 0.42], [LM.R_KNEE]: [0.55, 0.42] }),
  ]) {
    const withTorso = SIGNALS.hipTuck(buildFrame(pose));
    const withoutTorso = SIGNALS.hipTuck(buildFrame(hide(pose, SHOULDERS), { headWard: locked }));
    assert.ok(
      Math.abs(withTorso - withoutTorso) < 1e-6,
      `hipTuck disagrees across tiers: ${withTorso} vs ${withoutTorso}`
    );
  }
});

test('a full knee tuck counts in a legs-only view', () => {
  // The end-to-end case the pelvis tier exists for: phone held above the hips,
  // shoulders out of shot, knees driving past the hip line every rep.
  const tracker = createExerciseTracker(EXERCISE_BY_ID['knee-tucks']);
  let t = 0;
  const legsOnly = (lms) => hide(lms, SHOULDERS);
  for (let i = 0; i < 20; i++) { t += 33; tracker.update(legsOnly(body()), t, true); }

  const REPS = 8;
  for (let r = 0; r < REPS; r++) {
    for (let f = 0; f < 20; f++) {
      const pull = Math.sin((f / 20) * Math.PI) * 0.30;   // knees travel up toward the chest
      const lm = body({
        [LM.L_KNEE]: [0.45, 0.72 - pull], [LM.R_KNEE]: [0.55, 0.72 - pull],
        [LM.L_ANKLE]: [0.45, 0.90 - pull * 0.6], [LM.R_ANKLE]: [0.55, 0.90 - pull * 0.6],
      });
      t += 33;
      tracker.update(legsOnly(lm), t);
    }
  }
  const counted = tracker.counter.reps;
  assert.ok(counted >= REPS - 1 && counted <= REPS + 1, `counted ${counted} of ${REPS} knee tucks`);
});

test('signals are tagged with the frame they need', () => {
  assert.equal(tierFor('crunch'), TIER.TORSO);
  assert.equal(tierFor('bridge'), TIER.TORSO);
  assert.equal(tierFor('elbowBend'), TIER.TORSO);
  assert.equal(tierFor('kneeAlternate'), TIER.PELVIS);
  assert.equal(tierFor('hipTuck'), TIER.PELVIS);
  assert.ok(tierSatisfies(TIER.TORSO, TIER.PELVIS), 'a full view covers a leg-only signal');
  assert.ok(!tierSatisfies(TIER.PELVIS, TIER.TORSO), 'a leg-only view cannot serve a torso signal');
});

test('a torso-only move reports why it cannot count in a legs-only view', () => {
  const tracker = createExerciseTracker(EXERCISE_BY_ID['glute-bridge']);
  const out = tracker.update(hide(body(), SHOULDERS), 100);
  assert.equal(out.tracking, false);
  assert.equal(out.reason, 'tier');
  assert.equal(out.requiredTier, TIER.TORSO);
});

test('place() is the exact inverse of along/across', () => {
  const f = buildFrame(body());
  for (const q of [f.p(LM.L_ANKLE), f.p(LM.R_KNEE), f.shoulderMid]) {
    const back = f.place(f.along(q), f.across(q));
    assert.ok(Math.abs(back.x - q.x) < 1e-9 && Math.abs(back.y - q.y) < 1e-9,
      'body-frame coordinates must round-trip back to the same pixel');
  }
});

test('legLift rises as one leg comes off the floor', () => {
  const flat = SIGNALS.legLift(buildFrame(body()));
  const lifted = SIGNALS.legLift(buildFrame(body({ [LM.L_ANKLE]: [0.30, 0.88] })));
  assert.ok(lifted > flat + 0.2, `legLift did not respond: ${flat} → ${lifted}`);
});

test('moves that need your torso are only ever propped-phone moves', () => {
  // The whole point of the hand-held view is that your shoulders are out of
  // shot. A move whose signal needs them can never be counted there, so it must
  // be tagged as a propped level or the level will look broken to the player.
  for (const ex of EXERCISES) {
    if (tierFor(ex.signal) === TIER.TORSO) {
      assert.equal(ex.view, 'propped', `${ex.id} needs your torso but is a "${ex.view}" move`);
    }
  }
});

test('every move declares a camera setup, zones and a sane target', () => {
  const JOINTS = new Set([
    'L_ANKLE', 'R_ANKLE', 'L_KNEE', 'R_KNEE', 'L_WRIST', 'R_WRIST',
    'L_SHOULDER', 'R_SHOULDER', 'L_HIP', 'R_HIP', 'L_FOOT', 'R_FOOT',
  ]);
  for (const ex of EXERCISES) {
    assert.ok(VIEWS[ex.view], `${ex.id}: unknown view ${ex.view}`);
    assert.ok(ex.zones?.length, `${ex.id}: no muscle zones tagged`);
    if (!ex.target) continue;   // null target is allowed: it plays as a power ring
    assert.ok(ex.target.joints?.length, `${ex.id}: target has no joints`);
    for (const j of ex.target.joints) assert.ok(JOINTS.has(j), `${ex.id}: bad target joint ${j}`);
    assert.ok(['mirror', 'alternate'].includes(ex.target.pairing), `${ex.id}: bad pairing`);
    const travel = Math.hypot(ex.target.along || 0, ex.target.across || 0);
    assert.ok(travel > 0.1 && travel < 1.5, `${ex.id}: target travel of ${travel} is implausible`);
  }
});

/* ------------------------------------------------------------- the levels */

test('every level keeps one camera setup from start to finish', () => {
  // The camera is positioned once when a level begins. A level mixing views
  // would ask you to get up and move the phone halfway through.
  for (const level of LEVELS) {
    const views = new Set(level.moves.map(([id]) => EXERCISE_BY_ID[id].view));
    assert.equal(views.size, 1, `${level.id} mixes camera setups: ${[...views].join(', ')}`);
    assert.equal(levelView(level), [...views][0]);
  }
});

test('levels reference real moves and sit in real worlds', () => {
  const worlds = new Set(WORLDS.map((w) => w.id));
  for (const level of LEVELS) {
    assert.ok(worlds.has(level.world), `${level.id}: unknown world ${level.world}`);
    assert.ok(level.moves.length >= 2, `${level.id}: too short`);
    for (const [id, reps] of level.moves) {
      assert.ok(EXERCISE_BY_ID[id], `${level.id}: unknown move ${id}`);
      assert.ok(reps > 0 && reps <= 60, `${level.id}: odd rep count for ${id}`);
    }
    assert.ok(levelReps(level) > 0);
  }
  assert.ok(WORLDS.every((w) => LEVELS.some((l) => l.world === w.id)), 'every world needs levels');
});

test('levels unlock one at a time', () => {
  assert.ok(isUnlocked('l1', {}), 'the first level is always open');
  assert.ok(!isUnlocked('l2', {}), 'the second waits for a star on the first');
  assert.ok(isUnlocked('l2', { l1: 1 }));
  assert.ok(!isUnlocked('l3', { l1: 3 }), 'stars do not skip ahead');
  assert.equal(nextLevel({}).id, 'l1');
  assert.equal(nextLevel({ l1: 3 }).id, 'l2', 'a cleared level points at the next one');
  assert.equal(nextLevel({ l1: 1 }).id, 'l1', 'an unfinished level stays the suggestion');
});

/* --------------------------------------------------------- game mechanics */

test('combo multiplier steps up and stars follow the hit rate', () => {
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(4), 1);
  assert.equal(comboMultiplier(5), 2);
  assert.equal(comboMultiplier(10), 3);
  assert.equal(comboMultiplier(50), 4);

  assert.equal(starsFor(10, 10), 3);
  assert.equal(starsFor(9, 10), 3);
  assert.equal(starsFor(7, 10), 2);
  assert.equal(starsFor(3, 10), 1);
  assert.equal(starsFor(0, 0), 1, 'a level with no orbs still gives a star for finishing');
});

test('orbs sit where the joint has to travel, mirrored per side', () => {
  const spec = { joints: ['L_ANKLE', 'R_ANKLE'], pairing: 'mirror', along: 0, across: 0.45 };
  const restL = { along: -1.6, across: -0.12 };
  const restR = { along: -1.6, across: 0.12 };
  const left = targetFor(spec, restL, 'L_ANKLE');
  const right = targetFor(spec, restR, 'R_ANKLE');
  // "Outward" has to mean outward on both sides, so the offsets are mirrored.
  assert.ok(left.across > restL.across, 'left orb should sit further left');
  assert.ok(right.across < restR.across, 'right orb should sit further right');
  assert.equal(left.along, restL.along);

  // Travel along the body is not mirrored — both knees come up the same way.
  const tuck = { joints: ['L_KNEE', 'R_KNEE'], pairing: 'mirror', along: 0.55, across: 0 };
  assert.equal(targetFor(tuck, { along: -0.9, across: -0.1 }, 'L_KNEE').along, -0.35);
  assert.equal(targetFor(tuck, { along: -0.9, across: 0.1 }, 'R_KNEE').along, -0.35);
});

test('hit detection is a plain distance check in body units', () => {
  const orb = { along: 1, across: 0, radius: 0.3 };
  assert.ok(isHit(1, 0, orb), 'dead centre');
  assert.ok(isHit(1.2, 0.1, orb), 'inside the radius');
  assert.ok(!isHit(1.4, 0, orb), 'outside the radius');
  assert.ok(isHit(1, 0.3, orb), 'exactly on the edge counts');
});

test('quick-play routines also keep one camera setup', () => {
  // Same rule as levels: the camera is placed once, so a routine that jumps
  // between hand-held and propped would strand you mid-workout.
  for (const r of ROUTINES) {
    const views = new Set(r.moves.map(([id]) => EXERCISE_BY_ID[id].view));
    assert.equal(views.size, 1, `${r.id} mixes camera setups: ${[...views].join(', ')}`);
  }
});

/* ------------------------------------------------------- plausibility gate */

/** Shifts and scales a whole body, the way a different detection would sit. */
function moveBody(lms, { dx = 0, dy = 0, scale = 1, cx = 0.5, cy = 0.5 } = {}) {
  return lms.map((p) => ({
    ...p,
    x: cx + (p.x - cx) * scale + dx,
    y: cy + (p.y - cy) * scale + dy,
  }));
}

const settle = (gate, lms, frames = 4, t0 = 0) => {
  let out;
  for (let i = 0; i < frames; i++) out = gate.check(buildFrame(lms), t0 + i * 33, LEGS_NEEDED);
  return out;
};
const LEGS_NEEDED = [LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE];

test('the gate makes a new body prove itself before trusting it', () => {
  const gate = createPoseGate();
  const frame = buildFrame(body());
  // One good-looking frame is not enough — a hallucination looks fine for a frame.
  assert.equal(gate.check(frame, 0, LEGS_NEEDED).ok, false);
  assert.equal(gate.check(frame, 33, LEGS_NEEDED).ok, false);
  assert.equal(gate.check(frame, 66, LEGS_NEEDED).ok, true, 'three steady frames should lock on');
});

test('the gate rejects a body that teleports across the room', () => {
  // This is the actual bug from the phone: the model found a person standing by
  // a chair while her real leg was elsewhere, and the app drew and scored it.
  const gate = createPoseGate();
  const real = body();
  settle(gate, real);

  const elsewhere = moveBody(real, { dx: 0.45, dy: -0.2 });
  const verdict = gate.check(buildFrame(elsewhere), 200, LEGS_NEEDED);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'jumped');

  // The real body carrying on as normal is still fine.
  assert.equal(gate.check(buildFrame(moveBody(real, { dx: 0.02 })), 233, LEGS_NEEDED).ok, true);
});

test('the gate rejects a body too small to be in the room with you', () => {
  const gate = createPoseGate();
  const distant = moveBody(body(), { scale: 0.18 });
  const verdict = gate.check(buildFrame(distant), 0, LEGS_NEEDED);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'tiny');
});

test('the gate rejects joints pinned outside the picture', () => {
  const gate = createPoseGate();
  const offscreen = body({ [LM.L_ANKLE]: [1.4, 0.9], [LM.R_ANKLE]: [1.5, 0.9] });
  const verdict = gate.check(buildFrame(offscreen), 0, LEGS_NEEDED);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'offscreen');
});

test('the gate lets go after a gap, so you can move and be found again', () => {
  const gate = createPoseGate();
  const real = body();
  settle(gate, real);
  // A second later, in a completely different place: treated as a fresh body,
  // which has to settle again rather than being accepted or refused forever.
  const far = buildFrame(moveBody(real, { dx: 0.4 }));
  assert.equal(gate.check(far, 2000, LEGS_NEEDED).ok, false, 'must re-settle, not snap on');
  gate.check(far, 2033, LEGS_NEEDED);
  assert.equal(gate.check(far, 2066, LEGS_NEEDED).ok, true, 'and then it locks on again');
});

test('a rejected pose never counts a rep', () => {
  const tracker = createExerciseTracker(EXERCISE_BY_ID['knee-tucks']);
  let t = 0;
  // A body that jumps around the frame every frame — exactly what a hallucinated
  // detection does — should never score, however much the signal swings.
  for (let i = 0; i < 60; i++) {
    const jumpy = moveBody(
      body({ [LM.L_KNEE]: [0.45, i % 2 ? 0.42 : 0.72], [LM.R_KNEE]: [0.55, i % 2 ? 0.42 : 0.72] }),
      { dx: i % 2 ? 0.4 : -0.4 }
    );
    t += 33;
    tracker.update(jumpy, t);
  }
  assert.equal(tracker.counter.reps, 0, 'a teleporting body scored reps');
});

test('every move has something to pop', () => {
  // The first real test session was spent on a level with no orbs in it. A move
  // with nothing to aim at reads as broken, so this is now a hard rule.
  for (const ex of EXERCISES) {
    assert.ok(ex.target, `${ex.id} has no orb target`);
  }
});

test('anchored orbs stay put while the joint they follow moves', () => {
  // Bridges are the awkward case: the hips both do the work and define the
  // coordinate system, so an orb placed relative to the hips would ride along
  // with them and never be reachable.
  // Knees bent up off the body line, feet planted — the bridge start position.
  const KNEES = { [LM.L_KNEE]: [0.62, 0.66], [LM.R_KNEE]: [0.66, 0.70] };
  const flat = buildFrame(body(KNEES));
  const lifted = buildFrame(body({
    ...KNEES,
    [LM.L_HIP]: [0.56, 0.55], [LM.R_HIP]: [0.66, 0.55],   // hips pushed toward the knees' side
  }));
  const spec = EXERCISE_BY_ID['glute-bridge'].target;
  assert.equal(spec.anchor, 'shoulderKneeMid');

  const orb = { ...targetFor(spec, { along: 0, across: 0 }, 'L_HIP'), liftSide: liftSide(flat) };
  const restingHipGap = Math.hypot(
    flat.along(flat.hipMid) - orbCoords(orb, flat).along,
    flat.across(flat.hipMid) - orbCoords(orb, flat).across
  );
  const liftedHipGap = Math.hypot(
    lifted.along(lifted.hipMid) - orbCoords(orb, lifted).along,
    lifted.across(lifted.hipMid) - orbCoords(orb, lifted).across
  );
  assert.ok(
    liftedHipGap < restingHipGap,
    `lifting the hips must close the gap to the orb (${restingHipGap} → ${liftedHipGap})`
  );
});
