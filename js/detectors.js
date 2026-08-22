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
 * Reference frame tiers, best first.
 *
 * `torso`  needs your shoulders in shot — everything works.
 * `pelvis` needs hips and knees, which is what the camera sees when you hold the
 *          phone above your hips and look down your legs.
 * `limb`   needs only knees and ankles. It cannot give a body axis, so it serves
 *          pure joint-angle moves only — but it means pointing the phone at your
 *          own feet from a chair is enough for ankle pumps, which is exactly how
 *          someone naturally tests "point your toes".
 */
export const TIER = { TORSO: 'torso', PELVIS: 'pelvis', LIMB: 'limb' };

/** How much better than nothing a tier is, for "do I have enough to count?" checks. */
export const TIER_RANK = { [TIER.TORSO]: 3, [TIER.PELVIS]: 2, [TIER.LIMB]: 1 };

/** Hip width is roughly this fraction of torso length; keeps the tiers' units comparable. */
const HIP_TO_TORSO = 1.3;
/** Shin length as a fraction of torso, for the same reason in the limb tier. */
const SHIN_TO_TORSO = 0.6;

const unit = (vx, vy) => {
  const len = Math.hypot(vx, vy) || 1e-6;
  return { x: vx / len, y: vy / len };
};

/**
 * Pre-computes the derived points every signal needs, plus a body `scale` used
 * to make thresholds independent of how far you are from the camera.
 *
 * @param {Array} landmarks 33 pose landmarks
 * @param {{headWard?: {x:number,y:number}, minVisibility?: number}} [opts]
 *        `headWard` is the locked head-ward direction captured during the
 *        countdown. It matters more than it looks: in the pelvis tier the only
 *        clue to which way is "up the body" is that your knees sit below your
 *        hips — which stops being true the moment you pull your knees to your
 *        chest. Locking the direction once keeps the frame still while you move.
 */
export function buildFrame(landmarks, opts = {}) {
  if (!landmarks || landmarks.length < 33) return null;
  const minVis = opts.minVisibility ?? 0.35;
  const p = (i) => landmarks[i];
  const seen = (...idx) => idx.every((i) => vis(p(i)) >= minVis);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  // Without hips there is no body axis, but a knee-to-ankle frame still supports
  // joint-angle moves — enough to count toe points with only your feet in shot.
  if (!seen(LM.L_HIP, LM.R_HIP)) {
    if (!seen(LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE)) return null;
    return limbFrame(landmarks, p);
  }

  const shoulderMid = mid(p(LM.L_SHOULDER), p(LM.R_SHOULDER));
  const hipMid = mid(p(LM.L_HIP), p(LM.R_HIP));
  const ankleMid = mid(p(LM.L_ANKLE), p(LM.R_ANKLE));
  const kneeMid = mid(p(LM.L_KNEE), p(LM.R_KNEE));
  const torso = dist(shoulderMid, hipMid);
  const hipWidth = dist(p(LM.L_HIP), p(LM.R_HIP));
  const thigh = dist(hipMid, kneeMid);

  // Shoulders are only usable if they are both visible AND far enough from the
  // hips to give a meaningful direction — a torso seen end-on collapses to noise.
  const torsoUsable = seen(LM.L_SHOULDER, LM.R_SHOULDER) && torso > hipWidth * 0.35;
  const tier = torsoUsable ? TIER.TORSO : TIER.PELVIS;

  let u;
  if (torsoUsable) {
    u = unit(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y);
  } else {
    // Pelvis tier: the hip line is rigid, so its perpendicular is a stable body
    // axis no matter what the legs are doing. Two perpendiculars exist; pick the
    // head-ward one.
    const hipLine = unit(p(LM.R_HIP).x - p(LM.L_HIP).x, p(LM.R_HIP).y - p(LM.L_HIP).y);
    const candidate = { x: -hipLine.y, y: hipLine.x };
    const locked = opts.headWard;
    if (locked) {
      // Stay with the direction captured at calibration.
      const agrees = candidate.x * locked.x + candidate.y * locked.y >= 0;
      u = agrees ? candidate : { x: -candidate.x, y: -candidate.y };
    } else if (seen(LM.L_KNEE, LM.R_KNEE)) {
      // First guess: head-ward is whichever way points away from the knees.
      const toKnees = { x: kneeMid.x - hipMid.x, y: kneeMid.y - hipMid.y };
      const pointsAtKnees = candidate.x * toKnees.x + candidate.y * toKnees.y > 0;
      u = pointsAtKnees ? { x: -candidate.x, y: -candidate.y } : candidate;
    } else {
      return null;   // no shoulders and no knees: nothing to orient against
    }
  }

  const n = { x: -u.y, y: u.x };
  const scale = torsoUsable
    ? Math.max(torso, hipWidth * HIP_TO_TORSO, 0.08)
    : Math.max(hipWidth * HIP_TO_TORSO, 0.08);
  // The spine shortens when you curl up, so any signal measuring the torso
  // folding must be normalised by something that does not move with it.
  const rigid = Math.max(thigh, hipWidth * HIP_TO_TORSO, 0.05);

  const along = (q) => ((q.x - hipMid.x) * u.x + (q.y - hipMid.y) * u.y) / scale;
  const across = (q) => ((q.x - hipMid.x) * n.x + (q.y - hipMid.y) * n.y) / scale;
  /** Inverse of along/across: body-frame offsets back to image coordinates. */
  const place = (a, c) => ({
    x: hipMid.x + (u.x * a + n.x * c) * scale,
    y: hipMid.y + (u.y * a + n.y * c) * scale,
  });

  return {
    lm: landmarks, p, tier, shoulderMid, hipMid, ankleMid, kneeMid,
    torso, hipWidth, thigh, scale, rigid, u, n, headWard: u, along, across, place,
  };
}

/**
 * The fallback frame when the hips are out of shot: built from the shins.
 *
 * `along`/`across` exist so callers do not have to special-case it, but the axis
 * moves with your legs, so only joint-angle signals are trustworthy here. That is
 * enforced by the tier tags, not by hope.
 */
function limbFrame(landmarks, p) {
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const kneeMid = mid(p(LM.L_KNEE), p(LM.R_KNEE));
  const ankleMid = mid(p(LM.L_ANKLE), p(LM.R_ANKLE));
  const shin = dist(kneeMid, ankleMid);
  const scale = Math.max(shin / SHIN_TO_TORSO, 0.08);
  // Head-ward runs up the shin, from ankles toward knees.
  const u = unit(kneeMid.x - ankleMid.x, kneeMid.y - ankleMid.y);
  const n = { x: -u.y, y: u.x };
  const origin = kneeMid;
  const along = (q) => ((q.x - origin.x) * u.x + (q.y - origin.y) * u.y) / scale;
  const across = (q) => ((q.x - origin.x) * n.x + (q.y - origin.y) * n.y) / scale;
  const place = (a, c) => ({
    x: origin.x + (u.x * a + n.x * c) * scale,
    y: origin.y + (u.y * a + n.y * c) * scale,
  });
  return {
    lm: landmarks, p, tier: TIER.LIMB,
    shoulderMid: kneeMid, hipMid: origin, kneeMid, ankleMid,
    torso: shin, hipWidth: shin, thigh: shin, shin,
    scale, rigid: scale, u, n, headWard: u, along, across, place,
  };
}

/** True when a frame is good enough for a signal that needs `required`. */
export function tierSatisfies(frameTier, required) {
  return (TIER_RANK[frameTier] || 0) >= (TIER_RANK[required] || 0);
}

/* --------------------------------------------------------- plausibility gate */

/**
 * Decides whether a detection is actually a person in front of the camera.
 *
 * This exists because of a real failure: with only a foot in shot, the model
 * returned a confident, fully-formed skeleton standing next to a chair several
 * feet away — and the app drew it as the player's body and counted reps off it.
 * Confidence scores did not catch it. Geometry and persistence do.
 */
export function createPoseGate(opts = {}) {
  // First-person views look down your own body, so it legitimately runs off the
  // near edge of the picture. Demanding every joint be comfortably inside the
  // frame — the first version of this — rejected the player and waved through a
  // hallucination floating in the middle of the room. Exactly backwards.
  const nearEdge = opts.nearEdge ?? true;
  const margin = nearEdge ? 0.12 : 0.02;         // how far outside a joint may sit
  const minScale = opts.minScale ?? 0.12;        // body smaller than this is furniture
  const maxJump = opts.maxJump ?? 0.3;           // of frame, between accepted detections
  const maxScaleRatio = opts.maxScaleRatio ?? 2; // sudden size changes are teleports
  const lockFrames = opts.lockFrames ?? 3;       // consecutive good frames to trust a new body
  const staleMs = opts.staleMs ?? 700;           // after this, treat the next body as new

  let anchor = null;      // last accepted { x, y, scale, t }
  let streak = 0;

  return {
    get locked() { return !!anchor; },
    reset() { anchor = null; streak = 0; },

    /**
     * @returns {{ok: boolean, reason?: string}}
     */
    check(frame, tMs, needed = []) {
      if (!frame) { streak = 0; return { ok: false, reason: 'nobody' }; }

      // 1. Joints we care about have to be roughly in the picture. When the model
      //    is guessing it puts them a long way outside it.
      for (const i of needed) {
        const q = frame.p(i);
        if (!q || q.x < -margin || q.x > 1 + margin || q.y < -margin || q.y > 1 + margin) {
          streak = 0;
          return { ok: false, reason: 'offscreen' };
        }
      }

      // 2. A real body at arm's length fills a decent part of the frame.
      if (!(frame.scale >= minScale)) {
        streak = 0;
        return { ok: false, reason: 'tiny' };
      }

      const here = { x: frame.hipMid.x, y: frame.hipMid.y, scale: frame.scale, t: tMs };
      const fresh = !anchor || tMs - anchor.t > staleMs;

      if (!fresh) {
        // 3. Bodies do not teleport. A hallucination flickers between places.
        const jumped = Math.hypot(here.x - anchor.x, here.y - anchor.y) > maxJump;
        const resized = here.scale > anchor.scale * maxScaleRatio
          || here.scale < anchor.scale / maxScaleRatio;
        if (jumped || resized) {
          streak = 0;
          return { ok: false, reason: 'jumped' };
        }
        anchor = here;
        streak = 0;
        return { ok: true };
      }

      // 4. Nothing to compare against — either the first sighting or the body
      //    went missing long enough to be a different one. Make it prove it is
      //    really there before trusting it again, or a hallucination that
      //    appears after a gap gets accepted on sight.
      streak += 1;
      if (streak < lockFrames) return { ok: false, reason: 'settling' };
      anchor = here;
      streak = 0;
      return { ok: true };
    },
  };
}

/* -------------------------------------------------------------- body picker */

/**
 * Which of the detected bodies is the player?
 *
 * The gate above can only say no, and that turned out not to be enough. When the
 * model found a person-shaped thing in a chair, that detection was stable, large
 * and comfortably inside the frame — it passed every plausibility test — and it
 * was the only candidate on offer, so refusing it just left the player with an
 * empty screen. The fix is to ask for more than one body and choose.
 *
 * The deciding signal is **articulation**: how much a body changes shape, having
 * divided out where it is and how big it is. A hand-held camera pans and shakes,
 * which moves every candidate on screen together, so raw movement proves nothing.
 * Real legs bend. Furniture does not. That is why the framing card asks for a
 * wiggle: it is a challenge the room cannot answer.
 */
export function createBodyPicker(opts = {}) {
  const matchDist = opts.matchDist ?? 0.2;      // frame widths between sightings
  const memory = opts.memory ?? 0.85;           // how long articulation is remembered
  const sizeMemory = opts.sizeMemory ?? 0.96;   // body size settles slowly, on purpose
  const wiggleMin = opts.wiggleMin ?? 0.02;     // accumulated shape change that is life
  const tapRadius = opts.tapRadius ?? 0.28;
  const keepRadius = opts.keepRadius ?? 0.25;
  const forgetMs = opts.forgetMs ?? 900;
  const minScore = opts.minScore ?? 0.55;
  const W = { alive: 2.4, edge: 0.9, size: 0.8, tap: 3, keep: 1.4, ...(opts.weights || {}) };

  let tracks = [];
  let chosen = null;   // { x, y, scale } of the body we last handed back
  let lastT = 0;

  /** Landmark spread, as a stand-in for body scale when there is no frame yet. */
  function measure(lm, points) {
    const pts = points.map((i) => lm[i]).filter(Boolean);
    if (!pts.length) return null;
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    x /= pts.length; y /= pts.length;
    let spread = 0;
    for (const p of pts) spread = Math.max(spread, Math.hypot(p.x - x, p.y - y));
    // Every landmark, for how far down the picture the body reaches.
    let low = 0;
    for (const p of lm) if (p && p.y > low) low = p.y;
    return { x, y, scale: Math.max(spread, 0.02), low };
  }

  /** Landmark offsets from the body's own centre, divided by a settled size. */
  function shapeOf(lm, points, at, size) {
    const s = Math.max(size || at.scale, 0.02);
    return points.map((i) => {
      const p = lm[i];
      if (!p) return null;
      return { x: (p.x - at.x) / s, y: (p.y - at.y) / s };
    });
  }

  function flexBetween(a, b) {
    if (!a || !b) return 0;
    let sum = 0, n = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (!a[i] || !b[i]) continue;
      sum += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
      n++;
    }
    return n ? sum / n : 0;
  }

  return {
    get locked() { return !!chosen; },
    reset() { tracks = []; chosen = null; lastT = 0; },
    /** Forget where the player was, but keep watching who is moving. */
    unlock() { chosen = null; },

    /**
     * @param {Array<Array>} candidates one landmark array per detected body
     * @param {number} tMs
     * @param {object} ctx
     * @param {number[]} ctx.points  the joints this move cares about
     * @param {boolean} ctx.nearEdge  true when the player's body legitimately
     *   runs off the bottom of the picture — any first-person view
     * @param {{x:number,y:number}|null} ctx.tap  where the player just tapped
     * @param {boolean} ctx.requireAlive  demand a wiggle before locking on
     * @returns {{index: number, score: number, parts: object, scores: number[]}}
     */
    update(candidates, tMs, ctx = {}) {
      const points = ctx.points?.length ? ctx.points : [LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE];
      const gap = lastT ? tMs - lastT : 0;
      lastT = tMs;
      if (gap > forgetMs) { tracks = []; chosen = null; }

      const seen = (candidates || []).map((lm) => {
        if (!lm || !lm.length) return null;
        const at = measure(lm, points);
        return at ? { at, lm } : null;
      });

      // Follow each body from the last frame to this one, nearest first, so a
      // candidate keeps its history when the model reorders its output.
      const next = [];
      for (const s of seen) {
        if (!s) { next.push(null); continue; }
        let best = null, bestD = matchDist;
        for (const t of tracks) {
          if (t.taken) continue;
          const d = Math.hypot(t.x - s.at.x, t.y - s.at.y);
          if (d < bestD) { bestD = d; best = t; }
        }
        if (best) {
          best.taken = true;
          // Normalise by a size that settles slowly rather than this frame's
          // spread. Flutter kicks change a body's width symmetrically, so
          // dividing by the current spread would cancel the very movement we
          // are looking for.
          const size = best.size * sizeMemory + s.at.scale * (1 - sizeMemory);
          const shape = shapeOf(s.lm, points, s.at, size);
          // Accumulate rather than average: a wiggle is a stream of small
          // changes, and an average of small numbers is a small number.
          next.push({
            x: s.at.x, y: s.at.y, scale: s.at.scale, low: s.at.low, shape, size,
            flex: best.flex * memory + flexBetween(best.shape, shape),
          });
        } else {
          next.push({
            x: s.at.x, y: s.at.y, scale: s.at.scale, low: s.at.low, size: s.at.scale,
            shape: shapeOf(s.lm, points, s.at, s.at.scale), flex: 0,
          });
        }
      }
      tracks = next.filter(Boolean);

      // Score every candidate on what we know that the model does not. Life is
      // judged against the liveliest body on offer as well as against a fixed
      // floor, so the choice between two candidates does not hinge on a
      // threshold tuned in a different room to yours.
      const liveliest = Math.max(wiggleMin, ...next.map((t) => t?.flex || 0));
      const parts = [];
      const scores = next.map((t) => {
        if (!t) { parts.push(null); return -1; }
        const alive = Math.min(t.flex / wiggleMin, 1.4) * 0.6 + (t.flex / liveliest) * 0.4;
        // Your own body runs off the near edge of a first-person picture. A
        // hallucination floats in the middle of the room.
        const edge = ctx.nearEdge ? Math.min(Math.max((t.low - 0.72) / 0.2, 0), 1) : 1;
        const size = Math.min(t.scale / 0.16, 1);
        const tap = ctx.tap
          ? Math.max(1 - Math.hypot(ctx.tap.x - t.x, ctx.tap.y - t.y) / tapRadius, 0)
          : 0;
        const keep = chosen
          ? Math.max(1 - Math.hypot(chosen.x - t.x, chosen.y - t.y) / keepRadius, 0)
          : 0;
        const p = { alive, edge, size, tap, keep };
        parts.push(p);
        return W.alive * alive + W.edge * edge + W.size * size + W.tap * tap + W.keep * keep;
      });

      let index = -1, score = -1;
      for (let i = 0; i < scores.length; i++) if (scores[i] > score) { score = scores[i]; index = i; }

      const pick = index >= 0 ? next[index] : null;
      // Before lock-on we insist on seeing life. Once locked, holding still
      // between reps must not throw the player away — continuity carries it.
      const alive = parts[index]?.alive >= 1;
      const tapped = parts[index]?.tap > 0;
      const held = parts[index]?.keep > 0;
      const proven = alive || tapped || held || !ctx.requireAlive;
      if (!pick || score < minScore || !proven) {
        return { index: -1, score, parts: parts[index] || null, scores, reason: !pick ? 'nobody' : !proven ? 'still' : 'weak' };
      }
      chosen = { x: pick.x, y: pick.y, scale: pick.scale };
      return { index, score, parts: parts[index], scores };
    },
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

  /**
   * Hip folding: knees toward the chest, or legs lowering away from it.
   *
   * Measured against the frame's head-ward axis rather than the shoulders, so it
   * reads the same whether the camera can see your torso or only your hips and
   * legs. In the torso tier this is arithmetically identical to the angle
   * shoulder-hip-knee; in the pelvis tier it still works, which matters because
   * knee tucks are the signature move of the whole app.
   */
  hipTuck: (f) => {
    const vx = f.kneeMid.x - f.hipMid.x;
    const vy = f.kneeMid.y - f.hipMid.y;
    const len = Math.hypot(vx, vy) || 1e-6;
    const cos = Math.max(-1, Math.min(1, (vx * f.u.x + vy * f.u.y) / len));
    const deg = (Math.acos(cos) * 180) / Math.PI;   // 0 = knees at chest, 180 = legs straight
    return (180 - deg) / 90;
  },
  /** One leg lifted away from the floor while face down (prone kickbacks). */
  legLift: (f) =>
    Math.max(Math.abs(f.across(f.p(LM.L_ANKLE))), Math.abs(f.across(f.p(LM.R_ANKLE)))),
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

/**
 * The reference frame each signal needs. Anything listed as `torso` measures the
 * upper body and therefore only works with the phone propped where it can see
 * your shoulders; everything else survives the hand-held, legs-only view.
 */
export const SIGNAL_TIER = {
  anklePump: TIER.LIMB,
  crunch: TIER.TORSO,
  bridge: TIER.TORSO,
  elbowBend: TIER.TORSO,
  elbowAlternate: TIER.TORSO,
  armSpread: TIER.TORSO,
  armReach: TIER.TORSO,
};

/** @returns {'torso'|'pelvis'|'limb'} the frame tier a signal requires. */
export const tierFor = (signal) => SIGNAL_TIER[signal] || TIER.PELVIS;

/** The landmarks a move needs in shot, for the framing checklist. */
export const TIER_JOINTS = {
  [TIER.TORSO]: [
    { name: 'shoulders', points: [LM.L_SHOULDER, LM.R_SHOULDER] },
    { name: 'hips', points: [LM.L_HIP, LM.R_HIP] },
    { name: 'knees', points: [LM.L_KNEE, LM.R_KNEE] },
  ],
  [TIER.PELVIS]: [
    { name: 'hips', points: [LM.L_HIP, LM.R_HIP] },
    { name: 'knees', points: [LM.L_KNEE, LM.R_KNEE] },
    { name: 'ankles', points: [LM.L_ANKLE, LM.R_ANKLE] },
  ],
  [TIER.LIMB]: [
    { name: 'knees', points: [LM.L_KNEE, LM.R_KNEE] },
    { name: 'ankles', points: [LM.L_ANKLE, LM.R_ANKLE] },
    { name: 'feet', points: [LM.L_FOOT, LM.R_FOOT] },
  ],
};

/**
 * Which of the parts a move needs are currently visible — drives the live
 * framing checklist, so "move the phone" can say what is actually missing.
 */
export function framingReport(landmarks, signal, minVis = 0.4) {
  const groups = TIER_JOINTS[tierFor(signal)] || TIER_JOINTS[TIER.PELVIS];
  return groups.map((g) => ({
    name: g.name,
    ok: !!landmarks && visibilityOf(landmarks, g.points) >= minVis,
  }));
}

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
  const required = tierFor(exercise.signal);
  // A propped phone sees your whole body with room to spare, so anything hanging
  // off the edge there is suspect. Held in your hands, it is just your legs.
  const gate = createPoseGate({ nearEdge: exercise.view !== 'propped', ...exercise.gate });

  // Captured during the countdown and held for the rest of the set.
  let headWard = null;

  return {
    counter,
    exercise,
    gate,
    requiredTier: required,
    get headWard() { return headWard; },
    reset() { counter.reset(); gate.reset(); headWard = null; },
    /**
     * @param {Array} landmarks 33 pose landmarks (or null when nobody is seen)
     * @param {number} tMs
     * @param {boolean} calibrating true during the get-ready countdown
     */
    update(landmarks, tMs, calibrating = false) {
      if (!landmarks) {
        return { tracking: false, reason: 'nobody', reps: counter.reps, repDelta: 0, progress: 0 };
      }
      const frame = buildFrame(landmarks, { headWard });
      if (!frame) {
        // You are in shot, but the parts that define a body frame are not.
        return { tracking: false, reason: 'framing', reps: counter.reps, repDelta: 0, progress: 0 };
      }
      if (!tierSatisfies(frame.tier, required)) {
        // We can see you, just not enough of you for this particular move.
        return {
          tracking: false, reason: 'tier', tier: frame.tier, requiredTier: required,
          reps: counter.reps, repDelta: 0, progress: 0, frame,
        };
      }
      const v = visibilityOf(landmarks, needs);
      if (v < minVis) {
        return { tracking: false, reason: 'framing', visibility: v, reps: counter.reps, repDelta: 0, progress: 0, frame };
      }
      // Last line of defence: is this detection actually a person, and the same
      // person as a moment ago? Everything downstream — the ghost, the orbs, the
      // rep counter — depends on this being true.
      const sane = gate.check(frame, tMs, needs);
      if (!sane.ok) {
        return {
          tracking: false, reason: sane.reason, visibility: v, tier: frame.tier,
          reps: counter.reps, repDelta: 0, progress: 0, frame,
        };
      }
      const value = signalFn(frame);
      if (calibrating) {
        // Lock which way is head-ward while you are still lying at rest, before
        // any knee can travel above the hip line and confuse the pelvis frame.
        if (!headWard) headWard = { x: frame.u.x, y: frame.u.y };
        counter.calibrate(value);
        return { tracking: true, calibrating: true, reps: counter.reps, repDelta: 0, progress: 0, frame, value };
      }
      const out = counter.update(value, tMs);
      return { tracking: true, ...out, frame, value, visibility: v };
    },
  };
}
