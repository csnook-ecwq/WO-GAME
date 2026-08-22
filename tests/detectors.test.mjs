import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LM, SIGNALS, buildFrame, angleAt, distanceToLine, visibilityOf,
  createRepCounter, createExerciseTracker,
} from '../js/detectors.js';
import {
  EXERCISES, ROUTINES, EXERCISE_BY_ID, POSITIONS,
  routineReps, routineXp, routinePositions, repPoints, POINTS_PER_XP,
} from '../js/exercises.js';
import { levelFor, streak, LEVELS } from '../js/store.js';
import { mapFromRotated, ROTATIONS } from '../js/pose.js';

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

test('levels are ordered and map XP correctly', () => {
  for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i].xp > LEVELS[i - 1].xp);
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(LEVELS[2].xp).title, LEVELS[2].title);
  assert.equal(levelFor(LEVELS[1].xp - 1).level, 1);
  assert.equal(levelFor(999999).progress, 1);
  const mid = levelFor(Math.round((LEVELS[1].xp + LEVELS[2].xp) / 2));
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
