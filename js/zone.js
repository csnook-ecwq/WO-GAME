/**
 * zone.js — where your body has to be, and whether it got there.
 *
 * This file exists because of how the last attempt failed. The tracker locked
 * onto a chair, and then onto a person on the television, and counted their
 * movements as reps. Every fix I tried was a *rejector*: is this shape plausible,
 * is it big enough, is it stable, does it wiggle like a person. A person on a
 * television passes all of those, because they are a person.
 *
 * So the question is inverted here. Not "is this a plausible human" but "is
 * there a human where I asked them to be". The screen draws a zone, you put your
 * legs in it, and only landmarks inside that zone can score. Nobody on your
 * television is lying on your floor, so the television cannot win.
 *
 * Everything in this file is pure. No camera, no canvas, no DOM — which means
 * the logic that failed before can be tested without any of them, and is.
 *
 * Coordinates are normalised: 0..1 across the frame, 0 at the top.
 */

/** MediaPipe pose landmark indices, named. */
export const L = {
  nose: 0,
  leftShoulder: 11, rightShoulder: 12,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
  leftHeel: 29, rightHeel: 30,
  leftFoot: 31, rightFoot: 32,
};

/**
 * A target: one landmark, and the circle it has to be inside.
 *
 * @typedef {{ point: number, cx: number, cy: number, r: number, label: string }} Target
 * @typedef {{ id: string, name: string, hint: string, targets: Target[] }} Zone
 */

/**
 * The zones, one per exercise setup.
 *
 * Positions assume the phone propped at your feet looking back up your body,
 * which is the setup that works when you are on the floor and cannot reach the
 * phone. So your knees are NEARER the camera than your hips, and sit lower in
 * the frame — the opposite of how it looks standing up, and easy to get
 * backwards.
 *
 * The gate is knees only. Hips are what the reps are measured from, but they are
 * behind your knees from here and you cannot see them to place them; asking
 * someone to put four things in four circles, two of which overlap, is a gate
 * people give up at. If the knees are placed, the hips are in frame.
 *
 * Generous radii on purpose: this is a gate to start a game, not a measurement.
 */
export const ZONES = {
  bridge: {
    id: 'bridge',
    name: 'Glute bridge',
    hint: 'Lie back, knees bent, feet flat. Get both knees in the circles.',
    targets: [
      { point: L.leftKnee, cx: 0.35, cy: 0.58, r: 0.17, label: 'left knee' },
      { point: L.rightKnee, cx: 0.65, cy: 0.58, r: 0.17, label: 'right knee' },
    ],
  },
};

export function zoneFor(id) {
  return ZONES[id] || ZONES.bridge;
}

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/**
 * How well one body sits in a zone.
 *
 * @param {Array<{x:number,y:number,visibility?:number}>} landmarks
 * @param {Zone} zone
 * @returns {{ score: number, inside: number, total: number, misses: string[] }}
 *   `score` runs 0..1 and is the mean closeness of each target; 1 means every
 *   required landmark is dead centre in its circle.
 */
export function fitToZone(landmarks, zone) {
  const misses = [];
  let sum = 0;
  let inside = 0;

  for (const t of zone.targets) {
    const p = landmarks?.[t.point];
    // A landmark the model is guessing at is worse than useless here: it is
    // exactly how a chair leg becomes a knee. Treat it as absent.
    if (!p || (p.visibility !== undefined && p.visibility < 0.5)) {
      misses.push(t.label);
      continue;
    }
    const d = dist(p.x, p.y, t.cx, t.cy);
    if (d <= t.r) {
      inside += 1;
      sum += 1 - (d / t.r) * 0.5;   // dead centre = 1, on the rim = 0.5
    } else {
      misses.push(t.label);
      // Credit for being close, falling to nothing a radius outside. Without
      // this the readiness meter has nothing to say while you are shuffling
      // into place, which is precisely when you want it to say something.
      sum += Math.max(0, 0.5 - (d - t.r) / t.r * 0.5);
    }
  }

  return {
    score: zone.targets.length ? sum / zone.targets.length : 0,
    inside,
    total: zone.targets.length,
    misses,
  };
}

/**
 * Pick which detected body is the player.
 *
 * The model can return several. Rather than judging which looks most human —
 * the thing that let a televised person win last time — this picks whichever one
 * is actually lying in the zone, and refuses them all if none is.
 *
 * @param {Array<Array<{x:number,y:number,visibility?:number}>>} bodies
 * @param {Zone} zone
 * @returns {{ index: number, fit: ReturnType<typeof fitToZone> } | null}
 */
export function pickPlayer(bodies, zone) {
  let best = null;
  (bodies || []).forEach((landmarks, index) => {
    const fit = fitToZone(landmarks, zone);
    if (!best || fit.score > best.fit.score) best = { index, fit };
  });
  // A body that matches nothing in the zone is not the player, however
  // convincing a human it is.
  if (!best || best.fit.inside === 0) return null;
  return best;
}

/** Every required landmark is in its circle. */
export function isReady(fit) {
  return !!fit && fit.inside === fit.total;
}

/* --------------------------------------------------------------------- reps
 *
 * A bridge is the hips rising and coming back down. Measured against a baseline
 * taken while you are lying still, because "how high is a hip" means nothing in
 * absolute terms — it depends where the phone is and how tall you are.
 */

/**
 * @param {{ rise?: number, drop?: number }} [opts]
 *   `rise` is how far the hips must travel from the baseline to count, as a
 *   fraction of the frame height. `drop` is how far back down before the next
 *   one can start — the gap between them is what stops a single shaky hold
 *   registering as twenty reps.
 */
export function createRepCounter({ rise = 0.055, drop = 0.030 } = {}) {
  let baseline = null;
  let samples = [];
  let up = false;
  let count = 0;
  let peak = 0;

  const hipY = (landmarks) => {
    const a = landmarks?.[L.leftHip];
    const b = landmarks?.[L.rightHip];
    const ok = (p) => p && (p.visibility === undefined || p.visibility >= 0.5);
    if (ok(a) && ok(b)) return (a.y + b.y) / 2;
    if (ok(a)) return a.y;
    if (ok(b)) return b.y;
    return null;
  };

  return {
    /** Feed frames while she is lying still; the median becomes the baseline. */
    calibrate(landmarks) {
      const y = hipY(landmarks);
      if (y === null) return false;
      samples.push(y);
      if (samples.length > 45) samples.shift();
      // Median, not mean: one frame where a knee is mistaken for a hip should
      // not drag the baseline that every rep is measured against.
      if (samples.length >= 12) {
        const sorted = [...samples].sort((p, q) => p - q);
        baseline = sorted[Math.floor(sorted.length / 2)];
      }
      return baseline !== null;
    },

    /**
     * @returns {{ count: number, lift: number, popped: boolean }}
     *   `lift` is 0..1 — how far into a full rep she is right now, which is what
     *   drives the bubble on screen. `popped` is true only on the frame a rep
     *   completes.
     */
    push(landmarks) {
      const y = hipY(landmarks);
      if (y === null || baseline === null) return { count, lift: 0, popped: false };

      // Up the screen is a smaller y, so a lift is the baseline minus now.
      const travel = baseline - y;
      const lift = Math.max(0, Math.min(1, travel / rise));
      peak = Math.max(peak, travel);

      let popped = false;
      if (!up && travel >= rise) {
        up = true;
      } else if (up && travel <= drop) {
        up = false;
        count += 1;
        peak = 0;
        popped = true;
      }
      return { count, lift, popped };
    },

    get baseline() { return baseline; },
    get count() { return count; },
    reset() { baseline = null; samples = []; up = false; count = 0; peak = 0; },
  };
}
