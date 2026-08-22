import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LM, SIGNALS, buildFrame, angleAt, visibilityOf,
  createRepCounter, createExerciseTracker,
} from '../js/detectors.js';
import { EXERCISES, ROUTINES, EXERCISE_BY_ID, routineReps, routineXp } from '../js/exercises.js';
import { levelFor, streak, LEVELS } from '../js/store.js';

/* ------------------------------------------------------------ fake bodies */

/** A neutral standing body; overrides let a test move one joint. */
function body(overrides = {}) {
  const base = {
    [LM.NOSE]: [0.5, 0.10],
    [LM.L_SHOULDER]: [0.42, 0.25], [LM.R_SHOULDER]: [0.58, 0.25],
    [LM.L_ELBOW]: [0.38, 0.38], [LM.R_ELBOW]: [0.62, 0.38],
    [LM.L_WRIST]: [0.36, 0.50], [LM.R_WRIST]: [0.64, 0.50],
    [LM.L_HIP]: [0.45, 0.55], [LM.R_HIP]: [0.55, 0.55],
    [LM.L_KNEE]: [0.45, 0.72], [LM.R_KNEE]: [0.55, 0.72],
    [LM.L_ANKLE]: [0.45, 0.90], [LM.R_ANKLE]: [0.55, 0.90],
    [LM.L_HEEL]: [0.44, 0.92], [LM.R_HEEL]: [0.56, 0.92],
    [LM.L_FOOT]: [0.47, 0.93], [LM.R_FOOT]: [0.53, 0.93],
  };
  const lms = Array.from({ length: 33 }, (_, i) => {
    const [x, y] = overrides[i] || base[i] || [0.5, 0.5];
    return { x, y, z: 0, visibility: 0.95 };
  });
  return lms;
}

/* ---------------------------------------------------------------- helpers */

/** Feeds a triangle wave through a counter and returns the rep total. */
function driveWave(counter, { amplitude, cycles, framesPerCycle = 30, baseline = 0, signed = false, msPerFrame = 33 }) {
  for (let i = 0; i < 20; i++) counter.calibrate(baseline);
  let t = 0;
  for (let c = 0; c < cycles; c++) {
    for (let f = 0; f < framesPerCycle; f++) {
      const phase = (f / framesPerCycle) * Math.PI * 2;
      const v = signed
        ? baseline + Math.sin(phase) * amplitude
        : baseline + (1 - Math.cos(phase)) / 2 * amplitude;
      t += msPerFrame;
      counter.update(v, t);
    }
  }
  return counter.reps;
}

/* ------------------------------------------------------------------ tests */

test('buildFrame derives a stable body scale', () => {
  const f = buildFrame(body());
  assert.ok(f.scale > 0.2 && f.scale < 0.6, `unexpected scale ${f.scale}`);
  assert.equal(Math.round(f.hipMid.x * 100), 50);
  assert.equal(buildFrame(null), null);
  assert.equal(buildFrame([{ x: 0, y: 0 }]), null);
});

test('scale normalisation keeps signals distance-independent', () => {
  const near = buildFrame(body({ [LM.L_KNEE]: [0.45, 0.62] }));
  // Same pose, half the size and shifted: signal must be near-identical.
  const shrunk = body();
  const far = buildFrame(shrunk.map((p) => ({ ...p, x: 0.25 + p.x * 0.5, y: 0.25 + p.y * 0.5 })));
  const farLifted = buildFrame(
    body({ [LM.L_KNEE]: [0.45, 0.62] }).map((p) => ({ ...p, x: 0.25 + p.x * 0.5, y: 0.25 + p.y * 0.5 }))
  );
  const a = SIGNALS.kneeAlternate(near);
  const b = SIGNALS.kneeAlternate(farLifted);
  assert.ok(Math.abs(a - b) < 0.02, `signals drifted with distance: ${a} vs ${b}`);
  assert.ok(Math.abs(SIGNALS.kneeAlternate(far)) < 0.001);
});

test('signals point the right way', () => {
  const rest = buildFrame(body());
  // A lifted left knee (smaller y) makes kneeAlternate positive.
  const lifted = buildFrame(body({ [LM.L_KNEE]: [0.45, 0.60] }));
  assert.ok(SIGNALS.kneeAlternate(lifted) > SIGNALS.kneeAlternate(rest));
  // Heels off the floor (heel above toes) increases heelLift.
  const onToes = buildFrame(body({ [LM.L_HEEL]: [0.44, 0.86], [LM.R_HEEL]: [0.56, 0.86] }));
  assert.ok(SIGNALS.heelLift(onToes) > SIGNALS.heelLift(rest));
  // Feet apart increases ankleSpread.
  const wide = buildFrame(body({ [LM.L_ANKLE]: [0.32, 0.90], [LM.R_ANKLE]: [0.68, 0.90] }));
  assert.ok(SIGNALS.ankleSpread(wide) > SIGNALS.ankleSpread(rest) + 0.5);
  // Hips dropping toward the ankles increases squatDepth.
  const squat = buildFrame(body({ [LM.L_HIP]: [0.45, 0.68], [LM.R_HIP]: [0.55, 0.68] }));
  assert.ok(SIGNALS.squatDepth(squat) > SIGNALS.squatDepth(rest));
  // Hands overhead increases wristLift.
  const reach = buildFrame(body({ [LM.L_WRIST]: [0.40, 0.05], [LM.R_WRIST]: [0.60, 0.05] }));
  assert.ok(SIGNALS.wristLift(reach) > SIGNALS.wristLift(rest) + 0.5);
});

test('angleAt measures the interior angle', () => {
  assert.equal(Math.round(angleAt({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })), 90);
  assert.equal(Math.round(angleAt({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })), 180);
});

test('cycle counter counts one rep per full swing', () => {
  const counter = createRepCounter({ mode: 'cycle', enter: 0.3, exit: 0.12, minIntervalMs: 200 });
  const reps = driveWave(counter, { amplitude: 0.5, cycles: 8 });
  assert.equal(reps, 8);
});

test('cycle counter ignores movement below threshold', () => {
  const counter = createRepCounter({ mode: 'cycle', enter: 0.3, exit: 0.12, minIntervalMs: 200, adaptive: false });
  const reps = driveWave(counter, { amplitude: 0.08, cycles: 10 });
  assert.equal(reps, 0, 'twitching should not count as reps');
});

test('adaptive thresholds learn a shallow but consistent range', () => {
  // Half-hearted squats: only 60% of the nominal range, but repeated cleanly.
  const counter = createRepCounter({ mode: 'cycle', enter: 0.5, exit: 0.2, minIntervalMs: 200 });
  const reps = driveWave(counter, { amplitude: 0.32, cycles: 12 });
  assert.ok(reps >= 9, `expected the counter to adapt, got ${reps} reps`);
});

test('alternate counter counts every side change', () => {
  const counter = createRepCounter({ mode: 'alternate', enter: 0.15, minIntervalMs: 150 });
  // 6 sine cycles = 12 crossings = 12 reps (each leg counts).
  const reps = driveWave(counter, { amplitude: 0.4, cycles: 6, signed: true, framesPerCycle: 40 });
  assert.equal(reps, 12);
});

test('alternate counter does not double-count one long hold', () => {
  const counter = createRepCounter({ mode: 'alternate', enter: 0.15, minIntervalMs: 150 });
  for (let i = 0; i < 20; i++) counter.calibrate(0);
  let t = 0;
  for (let i = 0; i < 200; i++) { t += 33; counter.update(0.5, t); }
  assert.equal(counter.reps, 1);
});

test('minimum interval rejects impossible rep rates', () => {
  const counter = createRepCounter({ mode: 'cycle', enter: 0.3, exit: 0.1, minIntervalMs: 600, adaptive: false });
  // 10 full swings in ~2 seconds: physically a vibration, not reps.
  const reps = driveWave(counter, { amplitude: 0.6, cycles: 10, framesPerCycle: 6, msPerFrame: 33 });
  assert.ok(reps <= 4, `debounce failed, counted ${reps}`);
});

test('calibration re-bases the resting pose', () => {
  const counter = createRepCounter({ mode: 'cycle', enter: 0.3, exit: 0.12, adaptive: false, minIntervalMs: 100 });
  // Rest position sits at 5.0 rather than 0 (e.g. a seated baseline).
  const reps = driveWave(counter, { amplitude: 0.5, cycles: 5, baseline: 5 });
  assert.equal(reps, 5);
});

test('tracker refuses to count when the feet are not visible', () => {
  const ex = EXERCISE_BY_ID['high-knees'];
  const tracker = createExerciseTracker(ex);
  const hidden = body({ [LM.L_KNEE]: [0.45, 0.60] }).map((p, i) =>
    [LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE, LM.L_HIP, LM.R_HIP].includes(i)
      ? { ...p, visibility: 0.05 }
      : p
  );
  const out = tracker.update(hidden, 100);
  assert.equal(out.tracking, false);
  assert.equal(out.reason, 'framing');
  assert.equal(out.reps, 0);
  assert.equal(tracker.update(null, 200).reason, 'nobody');
});

test('end to end: synthetic high knees are counted', () => {
  const tracker = createExerciseTracker(EXERCISE_BY_ID['high-knees']);
  let t = 0;
  for (let i = 0; i < 20; i++) { t += 33; tracker.update(body(), t, true); }
  const KICKS = 10;
  for (let k = 0; k < KICKS; k++) {
    const left = k % 2 === 0;
    for (let f = 0; f < 12; f++) {
      const lift = Math.sin((f / 12) * Math.PI) * 0.16;    // knee travels up and back down
      const lm = body({
        [LM.L_KNEE]: [0.45, left ? 0.72 - lift : 0.72],
        [LM.R_KNEE]: [0.55, left ? 0.72 : 0.72 - lift],
      });
      t += 33;
      tracker.update(lm, t);
    }
  }
  assert.ok(tracker.counter.reps >= KICKS - 1, `counted ${tracker.counter.reps} of ${KICKS} knee drives`);
  assert.ok(tracker.counter.reps <= KICKS + 1, `over-counted: ${tracker.counter.reps}`);
});

test('every exercise is wired to a real signal and sane detector', () => {
  for (const ex of EXERCISES) {
    assert.ok(SIGNALS[ex.signal], `${ex.id}: unknown signal ${ex.signal}`);
    assert.ok(ex.needs?.length, `${ex.id}: no required landmarks`);
    assert.ok(ex.detector?.enter > 0, `${ex.id}: missing enter threshold`);
    if (ex.detector.mode === 'cycle') {
      assert.ok(ex.detector.exit < ex.detector.enter, `${ex.id}: exit must sit below enter`);
    }
    assert.ok(ex.cue && ex.framing && ex.tips.length, `${ex.id}: missing coaching copy`);
    assert.doesNotThrow(() => createExerciseTracker(ex));
  }
});

test('every routine references real exercises and earns XP', () => {
  const ids = new Set(EXERCISES.map((e) => e.id));
  for (const r of ROUTINES) {
    assert.ok(r.moves.length >= 2, `${r.id}: too short`);
    for (const [id, reps] of r.moves) {
      assert.ok(ids.has(id), `${r.id}: unknown exercise ${id}`);
      assert.ok(reps > 0 && reps <= 60, `${r.id}: silly rep count for ${id}`);
    }
    assert.ok(routineReps(r) > 0 && routineXp(r) > 0);
  }
});

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
  // A gap breaks it.
  assert.equal(streak([{ ts: now }, { ts: now - 2 * day }]), 1);
  // Nothing today but a session yesterday: the streak is still alive.
  assert.equal(streak([{ ts: now - day }, { ts: now - 2 * day }]), 2);
  // Stale history does not count.
  assert.equal(streak([{ ts: now - 5 * day }]), 0);
});

test('visibilityOf averages the landmarks it is given', () => {
  const lms = body();
  assert.ok(visibilityOf(lms, [LM.L_ANKLE, LM.R_ANKLE]) > 0.9);
  assert.equal(visibilityOf(lms, []), 0);
  assert.equal(visibilityOf(null, [1]), 0);
});

test('adaptive mode still ignores jitter', () => {
  const counter = createRepCounter({ mode: 'cycle', enter: 0.3, exit: 0.12, minIntervalMs: 200 });
  const reps = driveWave(counter, { amplitude: 0.05, cycles: 20, framesPerCycle: 20 });
  assert.equal(reps, 0, 'adaptive thresholds must not chase noise');
});

test('adaptive alternate mode ignores a trembling baseline', () => {
  const counter = createRepCounter({ mode: 'alternate', enter: 0.15, minIntervalMs: 150 });
  const reps = driveWave(counter, { amplitude: 0.04, cycles: 20, signed: true, framesPerCycle: 20 });
  assert.equal(reps, 0);
});
