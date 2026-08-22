/**
 * detectors.js — pure rep-counting logic.
 *
 * No DOM, no camera, no MediaPipe: everything here takes plain landmark arrays
 * (or plain numbers) so it can be unit tested with `npm test`.
 *
 * Landmarks follow the BlazePose 33-point layout used by MediaPipe Pose
 * Landmarker, normalized 0..1.
 *
 * Every exercise in this app is performed lying down, which means the body can
 * appear at any angle in the frame — head left, head right, feet toward the
 * camera. So NO signal here uses raw image axes. They are all either joint
 * angles or projections onto the body's own frame of reference (the spine axis
 * and its perpendicular), which makes them identical whichever way the phone
 * is lying. Every signal is written so a bigger number means more effort.
 */

export const LM = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
  L_HEEL: 29, R_HEEL: 30,
  L_FOOT: 31, R_FOOT: 32,
};

const vis = (p) => (p && p.visibility === undefined ? 1 : p ? p.visibility : 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Average visibility of a set of landmark indices (0..1). */
export function visibilityOf(landmarks, indices) {
  if (!landmarks || !indices || !indices.length) return 0;
  let sum = 0;
  for (const i of indices) sum += vis(landmarks[i]);
  return sum / indices.length;
}

/**
 * Pre-computes the derived points every signal needs, plus a body `scale`
 * (roughly torso length) used to make thresholds independent of how far you
 * are from the camera.
 */
export function buildFrame(landmarks) {
  if (!landmarks || landmarks.length < 33) return null;
  const p = (i) => landmarks[i];
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const shoulderMid = mid(p(LM.L_SHOULDER), p(LM.R_SHOULDER));
  const hipMid = mid(p(LM.L_HIP), p(LM.R_HIP));
  const ankleMid = mid(p(LM.L_ANKLE), p(LM.R_ANKLE));
  const kneeMid = mid(p(LM.L_KNEE), p(LM.R_KNEE));
  const torso = dist(shoulderMid, hipMid);
  const hipWidth = dist(p(LM.L_HIP), p(LM.R_HIP));
  const thigh = dist(hipMid, kneeMid);
  // A body seen end-on foreshortens the torso, so fall back to hip width.
  const scale = Math.max(torso, hipWidth * 1.3, 0.08);
  // The spine shortens when you curl up, so any signal measuring the torso
  // folding must be normalised by something that does not move with it.
  const rigid = Math.max(thigh, hipWidth * 1.3, 0.05);

  // Body reference frame: `u` runs from the hips toward the head, `n` is
  // perpendicular to it (the direction the belly or back faces). Measuring in
  // this frame is what makes every signal rotation-independent.
  const axisLen = Math.max(torso, 1e-6);
  const u = { x: (shoulderMid.x - hipMid.x) / axisLen, y: (shoulderMid.y - hipMid.y) / axisLen };
  const n = { x: -u.y, y: u.x };
  const along = (q) => ((q.x - hipMid.x) * u.x + (q.y - hipMid.y) * u.y) / scale;
  const across = (q) => ((q.x - hipMid.x) * n.x + (q.y - hipMid.y) * n.y) / scale;

  return {
    lm: landmarks, p, shoulderMid, hipMid, ankleMid, kneeMid,
    torso, hipWidth, thigh, scale, rigid, u, n, along, across,
  };
}

/** Perpendicular distance from point q to the line through a and b. */
export function distanceToLine(q, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return dist(q, a);
  return Math.abs((q.x - a.x) * vy - (q.y - a.y) * vx) / len;
}

/** Interior angle at point b, in degrees. */
export function angleAt(a, b, c) {
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

/**
 * Signal library. Each entry maps a frame to a single scalar where bigger means
 * further into the rep. `alternate`-mode signals are signed: positive means the
 * left side is working, negative the right.
 *
 * These are all angles or body-frame projections, so they read the same whether
 * you are lying with your head to the left of the frame, to the right, or with
 * the phone at your feet.
 */
export const SIGNALS = {
  /* --- along the spine: toward the head is positive --------------------- */

  /** Which knee is drawn further up toward the chest (bicycles, dead bugs). */
  kneeAlternate: (f) => f.along(f.p(LM.L_KNEE)) - f.along(f.p(LM.R_KNEE)),
  /** Which foot is further up the body (alternating extensions, marches). */
  ankleAlternate: (f) => f.along(f.p(LM.L_ANKLE)) - f.along(f.p(LM.R_ANKLE)),
  /** How far the hands reach past the head (overhead reaches). */
  armReach: (f) => (f.along(f.p(LM.L_WRIST)) + f.along(f.p(LM.R_WRIST))) / 2,

  /* --- across the body: off the floor / one side vs the other ----------- */

  /** One foot lifted while the other drops (flutter kicks, scissors). */
  ankleSplit: (f) => f.across(f.p(LM.L_ANKLE)) - f.across(f.p(LM.R_ANKLE)),
  /** One knee lifted away from the other (prone leg lifts, side kicks). */
  kneeSplit: (f) => f.across(f.p(LM.L_KNEE)) - f.across(f.p(LM.R_KNEE)),

  /* --- distances between limbs ----------------------------------------- */

  /** Gap between the feet (lying jacks, side-lying leg lifts). */
  legSpread: (f) => dist(f.p(LM.L_ANKLE), f.p(LM.R_ANKLE)) / f.scale,
  /** Gap between the knees (clamshells). */
  kneeSpread: (f) => dist(f.p(LM.L_KNEE), f.p(LM.R_KNEE)) / f.scale,
  /** Gap between the hands (snow angels, floor flys). */
  armSpread: (f) => dist(f.p(LM.L_WRIST), f.p(LM.R_WRIST)) / f.scale,

  /* --- joint angles: identical from any camera angle -------------------- */

  /** Hip folding: knees toward the chest, or legs lowering away from it. */
  hipTuck: (f) => (180 - angleAt(f.shoulderMid, f.hipMid, f.kneeMid)) / 90,
  /**
   * Shoulders curling toward the knees (crunches, sit-backs). Normalised by the
   * thigh rather than the torso: curling shortens the measured torso, which
   * would otherwise cancel out the very movement we are trying to detect.
   */
  crunch: (f) => -dist(f.shoulderMid, f.kneeMid) / f.rigid,
  /** Both knees straightening (ceiling presses). */
  kneeExtend: (f) =>
    (angleAt(f.p(LM.L_HIP), f.p(LM.L_KNEE), f.p(LM.L_ANKLE)) +
     angleAt(f.p(LM.R_HIP), f.p(LM.R_KNEE), f.p(LM.R_ANKLE))) / 2 / 180,
  /** One knee straightening while the other bends (alternating extensions). */
  kneeExtendAlternate: (f) =>
    (angleAt(f.p(LM.L_HIP), f.p(LM.L_KNEE), f.p(LM.L_ANKLE)) -
     angleAt(f.p(LM.R_HIP), f.p(LM.R_KNEE), f.p(LM.R_ANKLE))) / 180,
  /** Ankles flexing back toward the shins (ankle pumps). */
  anklePump: (f) =>
    (angleAt(f.p(LM.L_KNEE), f.p(LM.L_ANKLE), f.p(LM.L_FOOT)) +
     angleAt(f.p(LM.R_KNEE), f.p(LM.R_ANKLE), f.p(LM.R_FOOT))) / 2 / 180,
  /** Elbows bending (floor presses, skull crushers). */
  elbowBend: (f) => {
    const l = angleAt(f.p(LM.L_SHOULDER), f.p(LM.L_ELBOW), f.p(LM.L_WRIST));
    const r = angleAt(f.p(LM.R_SHOULDER), f.p(LM.R_ELBOW), f.p(LM.R_WRIST));
    return (180 - (l + r) / 2) / 90;
  },
  /** One arm punching out while the other folds in (ceiling punches). */
  elbowAlternate: (f) =>
    (angleAt(f.p(LM.L_SHOULDER), f.p(LM.L_ELBOW), f.p(LM.L_WRIST)) -
     angleAt(f.p(LM.R_SHOULDER), f.p(LM.R_ELBOW), f.p(LM.R_WRIST))) / 180,

  /** Hips pushed away from the shoulder-to-knee line (glute bridges). */
  bridge: (f) => distanceToLine(f.hipMid, f.shoulderMid, f.kneeMid) / f.scale,
};

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Rep counter with a calibrated baseline + adaptive thresholds.
 *
 * Two modes:
 *  - `cycle`     : one rep per out-and-back swing (squats, calf raises, jacks).
 *  - `alternate` : one rep per side, counted as the signal swings across the
 *                  baseline (high knees, flutter kicks, toe taps).
 *
 * `enter` / `exit` are expressed as deltas from the calibrated resting value,
 * in units of body scale (~torso lengths), so they hold at any camera distance.
 * Once the counter has seen a couple of real reps it switches to thresholds
 * derived from your actual range of motion, which handles short legs, tight
 * hips, deep couches and generally lazy technique.
 */
export function createRepCounter(spec = {}) {
  const mode = spec.mode || 'cycle';
  const enter = spec.enter ?? 0.2;
  const exit = spec.exit ?? enter * 0.45;
  const minIntervalMs = spec.minIntervalMs ?? 320;
  // Smallest range of motion (in body-scale units) we are willing to treat as a
  // real rep. Below this it is jitter; above it, the counter re-tunes itself to
  // whatever range you are actually producing, which is the whole point of a
  // lazy workout app.
  const minRange = spec.minRange ?? Math.max(0.06, enter * 0.55);
  const smoothing = spec.smoothing ?? 0.4;
  const adaptive = spec.adaptive !== false;
  const decay = spec.decay ?? 0.004;

  let baseline = null;
  let calSamples = [];
  let smoothed = null;
  let lo = Infinity;
  let hi = -Infinity;
  let phase = 'ready';     // cycle: ready | up   |  alternate: ready
  let side = 0;            // alternate: -1 right, +1 left, 0 none yet
  let reps = 0;
  let lastRepAt = -Infinity;
  let peak = 0;            // best progress reached in the current attempt

  function thresholds() {
    const base = baseline ?? 0;
    if (mode === 'alternate') {
      const amp = Math.max(Math.abs(hi - base), Math.abs(base - lo));
      const useAdaptive = adaptive && Number.isFinite(amp) && amp >= Math.max(0.05, enter * 0.6);
      const t = useAdaptive ? Math.max(enter * 0.75, amp * 0.55) : enter;
      return { enterT: base + t, exitT: base - t, releaseT: base + t * 0.35 };
    }
    const range = hi - lo;
    const useAdaptive = adaptive && Number.isFinite(range) && range >= minRange;
    if (useAdaptive) return { enterT: lo + range * 0.68, exitT: lo + range * 0.34, releaseT: 0 };
    return { enterT: base + enter, exitT: base + exit, releaseT: 0 };
  }

  return {
    /** Feed frames during the "get ready" countdown to learn the rest pose. */
    calibrate(value) {
      if (!Number.isFinite(value)) return;
      calSamples.push(value);
      if (calSamples.length > 90) calSamples.shift();
      baseline = median(calSamples);
      smoothed = baseline;
      lo = baseline;
      hi = baseline;
    },
    get baseline() { return baseline; },
    get reps() { return reps; },

    reset() {
      smoothed = baseline;
      lo = baseline ?? Infinity;
      hi = baseline ?? -Infinity;
      phase = 'ready';
      side = 0;
      reps = 0;
      lastRepAt = -Infinity;
      peak = 0;
    },

    /**
     * @param {number} value raw signal for this frame
     * @param {number} tMs   timestamp in ms
     * @returns {{reps:number, repDelta:number, phase:string, progress:number, side:number}}
     */
    update(value, tMs) {
      if (!Number.isFinite(value)) {
        return { reps, repDelta: 0, phase, progress: peak, side };
      }
      if (baseline === null) { baseline = value; lo = value; hi = value; }
      smoothed = smoothed === null ? value : smoothed + (value - smoothed) * smoothing;
      const v = smoothed;

      // Track the working range, decaying slowly so old extremes fade out.
      lo = Math.min(v, lo + (v - lo) * decay);
      hi = Math.max(v, hi + (v - hi) * decay);

      const { enterT, exitT, releaseT } = thresholds();
      let repDelta = 0;

      if (mode === 'alternate') {
        const amp = Math.max(enterT - (baseline ?? 0), 1e-6);
        const progress = clamp01(Math.abs(v - (baseline ?? 0)) / amp);
        peak = progress;
        const wantSide = v >= enterT ? 1 : v <= exitT ? -1 : 0;
        if (wantSide !== 0 && wantSide !== side && tMs - lastRepAt >= minIntervalMs) {
          side = wantSide;
          reps += 1;
          repDelta = 1;
          lastRepAt = tMs;
        } else if (wantSide !== 0 && side === 0) {
          side = wantSide;
        }
        // Returning near the middle re-arms the same side after a long pause.
        if (Math.abs(v - (baseline ?? 0)) < releaseT && tMs - lastRepAt > minIntervalMs * 6) side = 0;
        phase = wantSide === 0 ? 'ready' : 'up';
        return { reps, repDelta, phase, progress, side: wantSide || side };
      }

      const span = Math.max(enterT - exitT, 1e-6);
      const progress = clamp01((v - exitT) / span);
      if (phase === 'ready') {
        peak = Math.max(peak, progress);
        if (v >= enterT && tMs - lastRepAt >= minIntervalMs) {
          phase = 'up';
          reps += 1;
          repDelta = 1;
          lastRepAt = tMs;
          peak = 1;
        }
      } else if (v <= exitT) {
        phase = 'ready';
        peak = 0;
      }
      return { reps, repDelta, phase, progress, side: 0 };
    },
  };
}

/**
 * Wraps a signal + counter for one exercise and adds the visibility gate,
 * so the UI can tell the difference between "not moving" and "I can't see
 * your feet".
 */
export function createExerciseTracker(exercise) {
  const signalFn = SIGNALS[exercise.signal];
  if (!signalFn) throw new Error(`Unknown signal: ${exercise.signal}`);
  const counter = createRepCounter(exercise.detector || {});
  const needs = exercise.needs || [];
  const minVis = exercise.minVisibility ?? 0.45;

  return {
    counter,
    exercise,
    reset: () => counter.reset(),
    /**
     * @param {Array} landmarks 33 pose landmarks (or null when nobody is seen)
     * @param {number} tMs
     * @param {boolean} calibrating true during the get-ready countdown
     */
    update(landmarks, tMs, calibrating = false) {
      const frame = buildFrame(landmarks);
      if (!frame) {
        return { tracking: false, reason: 'nobody', reps: counter.reps, repDelta: 0, progress: 0 };
      }
      const v = visibilityOf(landmarks, needs);
      if (v < minVis) {
        return { tracking: false, reason: 'framing', visibility: v, reps: counter.reps, repDelta: 0, progress: 0 };
      }
      const value = signalFn(frame);
      if (calibrating) {
        counter.calibrate(value);
        return { tracking: true, calibrating: true, reps: counter.reps, repDelta: 0, progress: 0, frame, value };
      }
      const out = counter.update(value, tMs);
      return { tracking: true, ...out, frame, value, visibility: v };
    },
  };
}
