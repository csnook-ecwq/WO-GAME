/**
 * exercises.js — the content layer: target areas, moves, and routines.
 *
 * Every move declares which signal from detectors.js counts its reps and which
 * landmarks the camera must actually be able to see. Nearly all of them are
 * counted from the feet, ankles and knees, so you can prop the phone up a few
 * feet away and never touch it again.
 */

import { LM } from './detectors.js';

const LOWER = [LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE];
const FEET = [LM.L_ANKLE, LM.R_ANKLE, LM.L_HEEL, LM.R_HEEL, LM.L_FOOT, LM.R_FOOT];
const TORSO = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP];
const UPPER = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST];

export const AREAS = [
  { id: 'legs',   name: 'Legs & Calves', emoji: '🦵', color: '#7CFF6B', blurb: 'Quads, hamstrings, calves' },
  { id: 'glutes', name: 'Glutes & Hips', emoji: '🍑', color: '#FF7BD5', blurb: 'The part that sits all day' },
  { id: 'core',   name: 'Core',          emoji: '🎯', color: '#FFD166', blurb: 'Abs, obliques, low back' },
  { id: 'arms',   name: 'Arms & Chest',  emoji: '💪', color: '#6BE7FF', blurb: 'Shoulders, arms, push' },
  { id: 'cardio', name: 'Cardio',        emoji: '🔥', color: '#FF6B6B', blurb: 'Heart rate, gently' },
  { id: 'full',   name: 'Full Body',     emoji: '⚡', color: '#B98BFF', blurb: 'A bit of everything' },
];

export const AREA_BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a]));

/**
 * position  — where you are: 'floor' | 'seated' | 'standing'
 * laziness  — 1 (horizontal) .. 5 (you might sweat)
 * framing   — what to tell the user to point the camera at
 */
export const EXERCISES = [
  // ---------------------------------------------------------------- legs
  {
    id: 'march',
    name: 'Lazy March',
    area: 'legs', emoji: '🚶', position: 'standing', laziness: 2,
    cue: 'Lift one knee, then the other. Slower than you think.',
    framing: 'Stand side-on or facing the phone, whole body in shot.',
    tips: ['Knee up to hip height counts as a rep', 'Hold a wall if balance is a myth for you'],
    signal: 'kneeAlternate', needs: LOWER,
    detector: { mode: 'alternate', enter: 0.13, minIntervalMs: 380 },
    xp: 2,
  },
  {
    id: 'calf-raises',
    name: 'Heel Pops',
    area: 'legs', emoji: '🦶', position: 'standing', laziness: 1,
    cue: 'Push up onto your toes, lower with control.',
    framing: 'Point the phone at your feet from the side, about 2m away.',
    tips: ['Feet in frame the whole time', 'Pause at the top for one second'],
    signal: 'heelLift', needs: FEET,
    detector: { mode: 'cycle', enter: 0.1, exit: 0.04, minIntervalMs: 420 },
    xp: 2,
  },
  {
    id: 'chair-stands',
    name: 'Couch Escapes',
    area: 'legs', emoji: '🪑', position: 'seated', laziness: 3,
    cue: 'Stand up off the couch, sit back down. That is the whole move.',
    framing: 'Phone side-on so it can see your hips and feet.',
    tips: ['No hands if you are showing off', 'Stand all the way tall to lock the rep'],
    signal: 'squatDepth', needs: LOWER,
    detector: { mode: 'cycle', enter: 0.35, exit: 0.14, minIntervalMs: 700 },
    xp: 4,
  },
  {
    id: 'half-squat',
    name: 'Half-Hearted Squats',
    area: 'legs', emoji: '⬇️', position: 'standing', laziness: 4,
    cue: 'Sit back to about half depth, drive up.',
    framing: 'Side-on, full body in shot.',
    tips: ['Knees track over toes', 'Half depth is fine — that is the point'],
    signal: 'squatDepth', needs: LOWER,
    detector: { mode: 'cycle', enter: 0.28, exit: 0.12, minIntervalMs: 650 },
    xp: 4,
  },
  {
    id: 'leg-extend',
    name: 'Seated Leg Extends',
    area: 'legs', emoji: '🦿', position: 'seated', laziness: 1,
    cue: 'Straighten one leg out, lower it, swap.',
    framing: 'Phone side-on at knee height so both feet are visible.',
    tips: ['Each leg counts as its own rep', 'Squeeze the thigh at the top'],
    signal: 'ankleAlternate', needs: LOWER,
    detector: { mode: 'alternate', enter: 0.09, minIntervalMs: 340 },
    xp: 2,
  },

  // -------------------------------------------------------------- glutes
  {
    id: 'glute-bridge',
    name: 'Floor Bridges',
    area: 'glutes', emoji: '🌉', position: 'floor', laziness: 2,
    cue: 'On your back, feet flat, push your hips to the ceiling.',
    framing: 'Phone on the floor, side-on, whole body in shot.',
    tips: ['Squeeze at the top', 'Lower until your hips almost touch down'],
    signal: 'hipRaise', needs: [...TORSO, LM.L_KNEE, LM.R_KNEE],
    detector: { mode: 'cycle', enter: 0.3, exit: 0.12, minIntervalMs: 700 },
    xp: 3,
  },
  {
    id: 'side-leg-raise',
    name: 'Side Kick-Outs',
    area: 'glutes', emoji: '↔️', position: 'standing', laziness: 2,
    cue: 'Sweep one leg out to the side, bring it back, swap.',
    framing: 'Face the phone so it sees both feet moving sideways.',
    tips: ['Stay tall, do not lean', 'Slow beats high'],
    signal: 'legAbduct', needs: LOWER,
    detector: { mode: 'cycle', enter: 0.35, exit: 0.15, minIntervalMs: 500 },
    xp: 3,
  },
  {
    id: 'heel-curl',
    name: 'Heel Curls',
    area: 'glutes', emoji: '🔙', position: 'standing', laziness: 2,
    cue: 'Kick your heel back toward your glutes, alternate legs.',
    framing: 'Side-on so the camera sees your heel travel.',
    tips: ['Keep knees together', 'Each leg counts'],
    signal: 'heelCurl', needs: LOWER,
    detector: { mode: 'cycle', enter: 0.22, exit: 0.08, minIntervalMs: 450 },
    xp: 3,
  },

  // ---------------------------------------------------------------- core
  {
    id: 'flutter-kicks',
    name: 'Flutter Kicks',
    area: 'core', emoji: '🌊', position: 'floor', laziness: 2,
    cue: 'On your back, small alternating kicks with straight-ish legs.',
    framing: 'Phone on the floor, side-on, feet clearly in shot.',
    tips: ['Low back stays glued down', 'Each kick is a rep'],
    signal: 'ankleAlternate', needs: [...LOWER, LM.L_HEEL, LM.R_HEEL],
    detector: { mode: 'alternate', enter: 0.08, minIntervalMs: 240 },
    xp: 1,
  },
  {
    id: 'bicycle',
    name: 'Slow Bicycles',
    area: 'core', emoji: '🚲', position: 'floor', laziness: 3,
    cue: 'Cycle your knees in the air, one at a time.',
    framing: 'Phone on the floor, side-on.',
    tips: ['Drive the knee toward your chest', 'Each knee drive counts'],
    signal: 'kneeAlternate', needs: LOWER,
    detector: { mode: 'alternate', enter: 0.14, minIntervalMs: 320 },
    xp: 2,
  },
  {
    id: 'toe-taps',
    name: 'Seated Toe Taps',
    area: 'core', emoji: '👟', position: 'seated', laziness: 1,
    cue: 'Sit tall, tap one toe up, then the other.',
    framing: 'Phone on the floor a couple of metres away, pointed at your feet.',
    tips: ['Sit up off the backrest to make the core work', 'Each tap counts'],
    signal: 'ankleAlternate', needs: FEET,
    detector: { mode: 'alternate', enter: 0.06, minIntervalMs: 260 },
    xp: 1,
  },
  {
    id: 'knee-tucks',
    name: 'Couch Knee Tucks',
    area: 'core', emoji: '🧲', position: 'seated', laziness: 3,
    cue: 'Lean back slightly, pull both knees toward your chest.',
    framing: 'Side-on, hips and knees in shot.',
    tips: ['Hands on the seat behind you', 'Control the way back down'],
    signal: 'kneeLift', needs: LOWER,
    detector: { mode: 'cycle', enter: 0.25, exit: 0.1, minIntervalMs: 600 },
    xp: 3,
  },

  // ---------------------------------------------------------------- arms
  {
    id: 'arm-raises',
    name: 'Ceiling Reaches',
    area: 'arms', emoji: '🙌', position: 'seated', laziness: 1,
    cue: 'Press both hands overhead, lower to your shoulders.',
    framing: 'Phone facing you, head and hands in shot.',
    tips: ['Full lockout at the top', 'Slow on the way down'],
    signal: 'wristLift', needs: UPPER,
    detector: { mode: 'cycle', enter: 0.55, exit: 0.15, minIntervalMs: 550 },
    xp: 2,
  },
  {
    id: 'wall-pushups',
    name: 'Wall Push-Ups',
    area: 'arms', emoji: '🧱', position: 'standing', laziness: 3,
    cue: 'Hands on the wall, bend the elbows, push away.',
    framing: 'Phone side-on so it sees your elbows bend.',
    tips: ['Body in one line', 'Nose toward the wall'],
    signal: 'elbowBend', needs: UPPER,
    detector: { mode: 'cycle', enter: 0.55, exit: 0.22, minIntervalMs: 600 },
    xp: 3,
  },
  {
    id: 'couch-dips',
    name: 'Couch Dips',
    area: 'arms', emoji: '🛋️', position: 'seated', laziness: 4,
    cue: 'Hands on the couch edge, slide off, bend and press.',
    framing: 'Side-on, arms and hips in shot.',
    tips: ['Elbows back, not out', 'Small range is still a rep'],
    signal: 'elbowBend', needs: UPPER,
    detector: { mode: 'cycle', enter: 0.5, exit: 0.2, minIntervalMs: 650 },
    xp: 4,
  },

  // -------------------------------------------------------------- cardio
  {
    id: 'high-knees',
    name: 'High Knees',
    area: 'cardio', emoji: '⚡', position: 'standing', laziness: 5,
    cue: 'Jog on the spot, knees up toward hip height.',
    framing: 'Whole body in shot, a good 2–3m back.',
    tips: ['Each knee counts as one rep', 'Land soft'],
    signal: 'kneeAlternate', needs: LOWER,
    detector: { mode: 'alternate', enter: 0.16, minIntervalMs: 200 },
    xp: 1,
  },
  {
    id: 'step-jacks',
    name: 'Step Jacks',
    area: 'cardio', emoji: '✳️', position: 'standing', laziness: 3,
    cue: 'Step one foot out wide, bring it back. No jumping required.',
    framing: 'Face the phone, feet in shot.',
    tips: ['Add the arms if you are feeling brave', 'Out-and-back is one rep'],
    signal: 'ankleSpread', needs: FEET,
    detector: { mode: 'cycle', enter: 0.45, exit: 0.18, minIntervalMs: 450 },
    xp: 2,
  },
  {
    id: 'jumping-jacks',
    name: 'Jumping Jacks',
    area: 'cardio', emoji: '🌟', position: 'standing', laziness: 5,
    cue: 'The classic. Feet out, feet in.',
    framing: 'Stand back so your whole body fits in frame.',
    tips: ['Soft knees', 'Out-and-back is one rep'],
    signal: 'ankleSpread', needs: FEET,
    detector: { mode: 'cycle', enter: 0.6, exit: 0.22, minIntervalMs: 320 },
    xp: 2,
  },
  {
    id: 'shuffle',
    name: 'Side Shuffles',
    area: 'cardio', emoji: '↩️', position: 'standing', laziness: 4,
    cue: 'Two steps left, two steps right, on repeat.',
    framing: 'Stand back — you need room to move sideways.',
    tips: ['Stay low-ish', 'Each direction change counts'],
    signal: 'ankleSpread', needs: FEET,
    detector: { mode: 'cycle', enter: 0.5, exit: 0.2, minIntervalMs: 380 },
    xp: 2,
  },
];

export const EXERCISE_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

/**
 * Routines. `moves` are [exerciseId, reps] pairs, run in order with a short
 * rest between each. Keep them short — the whole premise is low friction.
 */
export const ROUTINES = [
  // legs
  { id: 'legs-horizontal', area: 'legs', name: 'Barely Standing', laziness: 1, minutes: 3,
    blurb: 'Feet and calves only. You can do this in slippers.',
    moves: [['calf-raises', 12], ['leg-extend', 16], ['calf-raises', 12]] },
  { id: 'legs-classic', area: 'legs', name: 'Leg Day, Lite', laziness: 3, minutes: 6,
    blurb: 'The one that actually makes stairs easier.',
    moves: [['march', 20], ['chair-stands', 8], ['calf-raises', 15], ['half-squat', 10]] },
  { id: 'legs-tryhard', area: 'legs', name: 'Fine, Real Leg Day', laziness: 5, minutes: 9,
    blurb: 'You will feel this tomorrow. Sorry.',
    moves: [['half-squat', 15], ['march', 30], ['chair-stands', 12], ['half-squat', 15], ['calf-raises', 20]] },

  // glutes
  { id: 'glutes-floor', area: 'glutes', name: 'Floor Is Comfy', laziness: 2, minutes: 4,
    blurb: 'Lie down. Push hips up. Repeat.',
    moves: [['glute-bridge', 12], ['glute-bridge', 12]] },
  { id: 'glutes-standing', area: 'glutes', name: 'Standing Glute Wake-Up', laziness: 3, minutes: 5,
    blurb: 'For hips that have been in a chair since Tuesday.',
    moves: [['side-leg-raise', 12], ['heel-curl', 14], ['side-leg-raise', 12]] },
  { id: 'glutes-full', area: 'glutes', name: 'Peach Protocol', laziness: 4, minutes: 8,
    blurb: 'Bridges, kicks, curls. In that order, on purpose.',
    moves: [['glute-bridge', 15], ['side-leg-raise', 14], ['heel-curl', 16], ['glute-bridge', 15]] },

  // core
  { id: 'core-seated', area: 'core', name: 'Desk Core', laziness: 1, minutes: 3,
    blurb: 'Nobody in the room will notice.',
    moves: [['toe-taps', 24], ['knee-tucks', 10], ['toe-taps', 24]] },
  { id: 'core-floor', area: 'core', name: 'Horizontal Abs', laziness: 3, minutes: 5,
    blurb: 'Everything here happens lying down.',
    moves: [['flutter-kicks', 24], ['bicycle', 20], ['flutter-kicks', 24]] },
  { id: 'core-full', area: 'core', name: 'Core, Genuinely', laziness: 4, minutes: 7,
    blurb: 'Three rounds. Short ones.',
    moves: [['bicycle', 24], ['flutter-kicks', 30], ['knee-tucks', 12], ['bicycle', 24]] },

  // arms
  { id: 'arms-seated', area: 'arms', name: 'Sofa Arms', laziness: 1, minutes: 3,
    blurb: 'Reaches only. No equipment, no standing.',
    moves: [['arm-raises', 15], ['arm-raises', 15]] },
  { id: 'arms-push', area: 'arms', name: 'Push Something', laziness: 3, minutes: 5,
    blurb: 'A wall counts as equipment.',
    moves: [['wall-pushups', 10], ['arm-raises', 15], ['wall-pushups', 10]] },
  { id: 'arms-full', area: 'arms', name: 'Arms, Committed', laziness: 4, minutes: 7,
    blurb: 'Dips included. You were warned.',
    moves: [['wall-pushups', 12], ['couch-dips', 10], ['arm-raises', 20], ['couch-dips', 10]] },

  // cardio
  { id: 'cardio-gentle', area: 'cardio', name: 'Heart Rate, Slightly Up', laziness: 2, minutes: 4,
    blurb: 'Step jacks only. No jumping, no noise, no neighbours upset.',
    moves: [['step-jacks', 20], ['march', 30], ['step-jacks', 20]] },
  { id: 'cardio-burst', area: 'cardio', name: 'Two Minute Burn', laziness: 4, minutes: 4,
    blurb: 'Short. Unpleasant. Over quickly.',
    moves: [['high-knees', 30], ['jumping-jacks', 20], ['high-knees', 30]] },
  { id: 'cardio-full', area: 'cardio', name: 'Actual Cardio', laziness: 5, minutes: 8,
    blurb: 'The one you pick when you feel guilty.',
    moves: [['jumping-jacks', 25], ['high-knees', 40], ['shuffle', 20], ['jumping-jacks', 25], ['march', 30]] },

  // full body
  { id: 'full-wake', area: 'full', name: 'Wake Up Body', laziness: 2, minutes: 5,
    blurb: 'One move per body part. Then you are done.',
    moves: [['march', 20], ['arm-raises', 12], ['glute-bridge', 12], ['toe-taps', 20]] },
  { id: 'full-standard', area: 'full', name: 'The Whole Sloth', laziness: 3, minutes: 8,
    blurb: 'The default. Do this one when you cannot decide.',
    moves: [['step-jacks', 20], ['chair-stands', 10], ['wall-pushups', 10], ['flutter-kicks', 24], ['calf-raises', 15]] },
  { id: 'full-boss', area: 'full', name: 'Boss Fight', laziness: 5, minutes: 12,
    blurb: 'Every area, one after another. Double XP.',
    xpMultiplier: 2,
    moves: [['high-knees', 30], ['half-squat', 15], ['wall-pushups', 12], ['glute-bridge', 15], ['bicycle', 24], ['jumping-jacks', 25], ['calf-raises', 20]] },
];

export const ROUTINES_BY_AREA = (areaId) => ROUTINES.filter((r) => r.area === areaId);
export const ROUTINE_BY_ID = Object.fromEntries(ROUTINES.map((r) => [r.id, r]));

/** Total reps in a routine — used for XP estimates and progress bars. */
export function routineReps(routine) {
  return routine.moves.reduce((sum, [, reps]) => sum + reps, 0);
}

/** Rough XP if you finish every rep. */
export function routineXp(routine) {
  const base = routine.moves.reduce(
    (sum, [id, reps]) => sum + (EXERCISE_BY_ID[id]?.xp ?? 2) * reps,
    0
  );
  return Math.round(base * (routine.xpMultiplier || 1));
}

export const LAZINESS_LABEL = ['', 'Horizontal', 'Barely Moving', 'Mild Effort', 'Some Sweat', 'Actually Trying'];
