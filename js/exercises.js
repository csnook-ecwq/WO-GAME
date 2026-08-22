/**
 * exercises.js — the content layer: target areas, moves, and routines.
 *
 * House rule: EVERY exercise is performed lying down — on your back, on your
 * side, or face down. Nothing asks you to stand up, nothing needs equipment.
 *
 * Each move declares:
 *   signal / detector — how reps are counted (see detectors.js)
 *   needs             — landmarks the camera must actually be able to see
 *   view              — where the phone is:
 *                       handheld  in your hands above your hips, looking down
 *                                 your own legs (the default, first person)
 *                       prone     face down, front camera, legs behind you
 *                       propped    leaned against something beside you
 *   target            — where the game puts the orb you have to reach, as an
 *                       offset from the joint's resting position in body-frame
 *                       units (see game.js). null = no orb, just a power ring.
 *   zones             — muscles worked, used later by the Focus feature
 */

import { LM } from './detectors.js';

const LEGS = [LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE];
const FEET = [LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE, LM.L_FOOT, LM.R_FOOT];
const TRUNK = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE];
const ARMS = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST];

export const AREAS = [
  { id: 'legs',   name: 'Legs & Calves', emoji: '🦵', color: '#7CFF6B', blurb: 'Thighs, hamstrings, calves' },
  { id: 'glutes', name: 'Glutes & Hips', emoji: '🍑', color: '#FF7BD5', blurb: 'The part that sits all day' },
  { id: 'core',   name: 'Core',          emoji: '🎯', color: '#FFD166', blurb: 'Abs, obliques, low back' },
  { id: 'arms',   name: 'Arms & Chest',  emoji: '💪', color: '#6BE7FF', blurb: 'Shoulders, arms, chest' },
  { id: 'cardio', name: 'Cardio',        emoji: '🔥', color: '#FF6B6B', blurb: 'Heart rate, floor only' },
  { id: 'full',   name: 'Full Body',     emoji: '⚡', color: '#B98BFF', blurb: 'A bit of everything' },
];

export const AREA_BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a]));

export const POSITIONS = {
  back: { label: 'On your back', emoji: '🛏️' },
  side: { label: 'On your side', emoji: '↔️' },
  front: { label: 'Face down',   emoji: '⬇️' },
};

/** Where the phone goes. Each one gets its own setup card before a level. */
export const VIEWS = {
  handheld: {
    label: 'Phone in your hands',
    hint: 'Lie on your back and hold your phone above your hips, screen toward you, looking down your legs.',
    facing: 'environment',
  },
  prone: {
    label: 'Face down, selfie camera',
    hint: 'Lie on your front, prop up on your elbows and hold the phone in front of you so it sees past you to your legs.',
    facing: 'user',
  },
  propped: {
    label: 'Phone propped up',
    hint: 'Lean your phone against something beside you, about 2m away, so it can see your whole body.',
    facing: 'environment',
  },
};

/** Framing advice, written per camera setup rather than one line for everything. */
const FRAMING = 'Lean the phone against something beside you so it sees your whole body.';
const FRAMING_LEGS = 'Hold the phone above your hips, screen toward you, looking down your legs.';
const FRAMING_PRONE = 'On your front, hold the phone in front of you so it sees past you to your legs.';

/**
 * laziness — 1 (barely moving) .. 5 (you will feel this)
 * xp        — per rep; the live score adds 10× this per rep
 */
export const EXERCISES = [
  /* ------------------------------------------------------------------ core */
  {
    id: 'knee-tucks',
    name: 'Knee Tucks',
    area: 'core', emoji: '🧲', position: 'back', laziness: 2,
    view: 'handheld', zones: ['lower-abs','core'],
    target: { joints: ['L_KNEE','R_KNEE'], pairing: 'mirror', along: 0.55, across: 0 },
    cue: 'Pull both knees toward your chest, then lower them halfway.',
    framing: FRAMING,
    tips: ['Keep your head down on the floor', 'Slow on the way out'],
    signal: 'hipTuck', needs: TRUNK,
    detector: { mode: 'cycle', enter: 0.5, exit: 0.2, minIntervalMs: 600 },
    xp: 2,
  },
  {
    id: 'flutter-kicks',
    name: 'Flutter Kicks',
    area: 'core', emoji: '🌊', position: 'back', laziness: 2,
    view: 'handheld', zones: ['lower-abs','core'],
    target: { joints: ['L_ANKLE','R_ANKLE'], pairing: 'alternate', along: 0, across: 0.28 },
    cue: 'Legs straight-ish, small alternating kicks. One kick, one rep.',
    framing: FRAMING_LEGS,
    tips: ['Press your low back into the floor', 'Hands under your hips if it helps'],
    signal: 'ankleSplit', needs: LEGS,
    detector: { mode: 'alternate', enter: 0.11, minIntervalMs: 240 },
    xp: 1,
  },
  {
    id: 'bicycles',
    name: 'Slow Bicycles',
    area: 'core', emoji: '🚲', position: 'back', laziness: 3,
    view: 'handheld', zones: ['core','obliques'],
    target: { joints: ['L_KNEE','R_KNEE'], pairing: 'alternate', along: 0.5, across: 0 },
    cue: 'Cycle your knees in the air, one at a time.',
    framing: FRAMING,
    tips: ['Drive each knee toward your chest', 'Each knee drive counts'],
    signal: 'kneeAlternate', needs: LEGS,
    detector: { mode: 'alternate', enter: 0.24, minIntervalMs: 320 },
    xp: 2,
  },
  {
    id: 'crunches',
    name: 'Lazy Crunches',
    area: 'core', emoji: '🙃', position: 'back', laziness: 3,
    view: 'propped', zones: ['core','upper-abs'],
    target: { joints: ['L_SHOULDER','R_SHOULDER'], pairing: 'mirror', along: -0.28, across: 0, radius: 0.22 },
    cue: 'Knees bent, curl your shoulders a few inches off the floor.',
    framing: FRAMING,
    tips: ['Chin off your chest, eyes at the ceiling', 'Small range is fine'],
    signal: 'crunch', needs: TRUNK,
    detector: { mode: 'cycle', enter: 0.18, exit: 0.07, minIntervalMs: 550 },
    xp: 2,
  },
  {
    id: 'dead-bug',
    name: 'Dead Bug',
    area: 'core', emoji: '🐞', position: 'back', laziness: 2,
    view: 'handheld', zones: ['core','lower-abs'],
    target: { joints: ['L_KNEE','R_KNEE'], pairing: 'alternate', along: 0.35, across: 0 },
    cue: 'Knees over hips, lower one leg at a time. Slowly.',
    framing: FRAMING,
    tips: ['Low back stays flat on the floor', 'Each leg counts as a rep'],
    signal: 'kneeAlternate', needs: LEGS,
    detector: { mode: 'alternate', enter: 0.2, minIntervalMs: 700 },
    xp: 2,
  },
  {
    id: 'leg-lowers',
    name: 'Double Leg Lowers',
    area: 'core', emoji: '⬇️', position: 'back', laziness: 5,
    view: 'handheld', zones: ['lower-abs','core'],
    target: { joints: ['L_ANKLE','R_ANKLE'], pairing: 'mirror', along: -0.55, across: 0, radius: 0.3 },
    cue: 'Both legs up, lower them as far as you can, bring them back.',
    framing: FRAMING_LEGS,
    tips: ['Stop before your back arches', 'Bend the knees if it is too much'],
    signal: 'hipTuck', needs: LEGS,
    detector: { mode: 'cycle', enter: 0.45, exit: 0.18, minIntervalMs: 900 },
    xp: 4,
  },

  /* ---------------------------------------------------------------- glutes */
  {
    id: 'glute-bridge',
    name: 'Floor Bridges',
    area: 'glutes', emoji: '🌉', position: 'back', laziness: 2,
    view: 'propped', zones: ['glutes','hamstrings'],
    target: { joints: ['L_HIP','R_HIP'], pairing: 'mirror', anchor: 'shoulderKneeMid', along: 0, across: 0.3, radius: 0.22 },
    cue: 'Feet flat, push your hips to the ceiling, lower almost to the floor.',
    framing: FRAMING,
    tips: ['Squeeze hard at the top', 'Push through your heels'],
    signal: 'bridge', needs: TRUNK,
    detector: { mode: 'cycle', enter: 0.18, exit: 0.07, minIntervalMs: 650 },
    xp: 3,
  },
  {
    id: 'single-bridge',
    name: 'One-Leg Bridges',
    area: 'glutes', emoji: '🦩', position: 'back', laziness: 4,
    view: 'propped', zones: ['glutes','hamstrings'],
    target: { joints: ['L_HIP','R_HIP'], pairing: 'mirror', anchor: 'shoulderKneeMid', along: 0, across: 0.28, radius: 0.22 },
    cue: 'Same bridge, one foot off the floor. Swap legs halfway.',
    framing: FRAMING,
    tips: ['Keep your hips level', 'Half the reps per leg'],
    signal: 'bridge', needs: TRUNK,
    detector: { mode: 'cycle', enter: 0.16, exit: 0.06, minIntervalMs: 700 },
    xp: 4,
  },
  {
    id: 'clamshells',
    name: 'Clamshells',
    area: 'glutes', emoji: '🐚', position: 'side', laziness: 1,
    view: 'propped', zones: ['glutes','outer-thigh'],
    target: { joints: ['L_KNEE','R_KNEE'], pairing: 'mirror', along: 0, across: 0.25 },
    cue: 'On your side, knees bent and stacked. Open the top knee, close it.',
    framing: FRAMING,
    tips: ['Feet stay touching', 'Do not roll your hips back'],
    signal: 'kneeSpread', needs: LEGS,
    detector: { mode: 'cycle', enter: 0.2, exit: 0.08, minIntervalMs: 500 },
    xp: 2,
  },
  {
    id: 'side-leg-lifts',
    name: 'Side Leg Lifts',
    area: 'glutes', emoji: '📐', position: 'side', laziness: 2,
    view: 'propped', zones: ['glutes','outer-thigh'],
    target: { joints: ['L_ANKLE','R_ANKLE'], pairing: 'alternate', along: 0, across: 0.4 },
    cue: 'On your side, legs straight. Lift the top leg, lower it slow.',
    framing: FRAMING_LEGS,
    tips: ['Lead with the heel', 'Swap sides halfway through'],
    signal: 'legSpread', needs: LEGS,
    detector: { mode: 'cycle', enter: 0.3, exit: 0.12, minIntervalMs: 500 },
    xp: 3,
  },
  {
    id: 'prone-lifts',
    name: 'Face-Down Leg Lifts',
    area: 'glutes', emoji: '🛼', position: 'front', laziness: 3,
    view: 'prone', zones: ['glutes','hamstrings'],
    target: { joints: ['L_ANKLE','R_ANKLE'], pairing: 'alternate', along: 0, across: 0.35 },
    cue: 'Face down, head on your hands. Lift one straight leg, then the other.',
    framing: FRAMING_LEGS,
    tips: ['Small lift is plenty', 'Squeeze the glute, not the low back'],
    signal: 'kneeSplit', needs: LEGS,
    detector: { mode: 'alternate', enter: 0.1, minIntervalMs: 600 },
    xp: 3,
  },

  {
    id: 'donkey-kicks',
    name: 'Donkey Kicks',
    area: 'glutes', emoji: '🦵', position: 'front', laziness: 3,
    view: 'prone', zones: ['glutes'],
    target: { joints: ['L_ANKLE','R_ANKLE'], pairing: 'alternate', along: 0, across: 0.42 },
    cue: 'Face down, knee bent, drive one heel up toward the ceiling. Swap.',
    framing: FRAMING_PRONE,
    tips: ['Keep the knee bent the whole way', 'Squeeze at the top, do not arch your back'],
    signal: 'kneeSplit', needs: LEGS,
    detector: { mode: 'alternate', enter: 0.12, minIntervalMs: 550 },
    xp: 3,
  },
  {
    id: 'prone-scissors',
    name: 'Face-Down Scissors',
    area: 'glutes', emoji: '✂️', position: 'front', laziness: 2,
    view: 'prone', zones: ['glutes','hamstrings'],
    target: { joints: ['L_ANKLE','R_ANKLE'], pairing: 'alternate', along: 0, across: 0.25 },
    cue: 'Face down, legs straight and slightly lifted, cross them past each other.',
    framing: FRAMING_PRONE,
    tips: ['Small and controlled', 'Each cross counts as a rep'],
    signal: 'ankleSplit', needs: LEGS,
    detector: { mode: 'alternate', enter: 0.09, minIntervalMs: 300 },
    xp: 2,
  },

  /* ------------------------------------------------------------------ legs */
  {
    id: 'ceiling-press',
    name: 'Ceiling Leg Press',
    area: 'legs', emoji: '🚀', position: 'back', laziness: 3,
    view: 'handheld', zones: ['quads','glutes'],
    target: { joints: ['L_ANKLE','R_ANKLE'], pairing: 'mirror', along: -0.6, across: 0 },
    cue: 'Knees to chest, then press both feet straight up at the ceiling.',
    framing: FRAMING_LEGS,
    tips: ['Full lockout at the top', 'Control the way back down'],
    signal: 'kneeExtend', needs: LEGS,
    detector: { mode: 'cycle', enter: 0.28, exit: 0.12, minIntervalMs: 700 },
    xp: 3,
  },
  {
    id: 'leg-extends',
    name: 'Alternating Extends',
    area: 'legs', emoji: '🦿', position: 'back', laziness: 2,
    view: 'handheld', zones: ['quads'],
    target: { joints: ['L_ANKLE','R_ANKLE'], pairing: 'alternate', along: -0.45, across: 0 },
    cue: 'Knees bent, straighten one leg at a time.',
    framing: FRAMING_LEGS,
    tips: ['Squeeze the thigh at the top', 'Each leg counts as a rep'],
    signal: 'kneeExtendAlternate', needs: LEGS,
    detector: { mode: 'alternate', enter: 0.22, minIntervalMs: 420 },
    xp: 2,
  },
  {
    id: 'heel-curls',
    name: 'Face-Down Heel Curls',
    area: 'legs', emoji: '🔙', position: 'front', laziness: 2,
    view: 'prone', zones: ['hamstrings','glutes'],
    target: { joints: ['L_ANKLE','R_ANKLE'], pairing: 'alternate', along: 0.4, across: 0 },
    cue: 'Face down, curl one heel toward your glutes, then the other.',
    framing: FRAMING_LEGS,
    tips: ['Hips stay on the floor', 'Slow is harder — good'],
    signal: 'kneeExtendAlternate', needs: LEGS,
    detector: { mode: 'alternate', enter: 0.2, minIntervalMs: 450 },
    xp: 2,
  },
  {
    id: 'ankle-pumps',
    name: 'Ankle Pumps',
    area: 'legs', emoji: '🦶', position: 'back', laziness: 1,
    view: 'handheld', zones: ['calves'],
    target: { joints: ['L_FOOT','R_FOOT'], pairing: 'mirror', along: -0.22, across: 0, radius: 0.13 },
    cue: 'Legs out straight. Point your toes hard, then pull them back.',
    framing: FRAMING_LEGS,
    tips: ['The laziest move in the app', 'Great for stiff calves'],
    signal: 'anklePump', needs: FEET,
    detector: { mode: 'cycle', enter: 0.12, exit: 0.05, minIntervalMs: 420 },
    xp: 1,
  },
  {
    id: 'wall-marches',
    name: 'Air Marches',
    area: 'legs', emoji: '🚶', position: 'back', laziness: 2,
    view: 'handheld', zones: ['quads','core'],
    target: { joints: ['L_KNEE','R_KNEE'], pairing: 'alternate', along: 0.4, across: 0 },
    cue: 'Feet in the air, march slowly — one knee down, one knee up.',
    framing: FRAMING_LEGS,
    tips: ['Keep both knees bent at 90°', 'Each knee counts'],
    signal: 'kneeAlternate', needs: LEGS,
    detector: { mode: 'alternate', enter: 0.18, minIntervalMs: 400 },
    xp: 2,
  },

  /* ------------------------------------------------------------------ arms */
  {
    id: 'floor-press',
    name: 'Floor Presses',
    area: 'arms', emoji: '🏋️', position: 'back', laziness: 2,
    view: 'propped', zones: ['chest','arms'],
    target: { joints: ['L_WRIST','R_WRIST'], pairing: 'mirror', along: 0, across: 0.45 },
    cue: 'Elbows on the floor, press both hands up toward the ceiling.',
    framing: 'Phone on the floor, side-on, arms and chest in shot.',
    tips: ['Squeeze at the top', 'Add a water bottle in each hand to make it real'],
    signal: 'elbowBend', needs: ARMS,
    detector: { mode: 'cycle', enter: 0.45, exit: 0.18, minIntervalMs: 600 },
    xp: 2,
  },
  {
    id: 'ceiling-punches',
    name: 'Ceiling Punches',
    area: 'arms', emoji: '🥊', position: 'back', laziness: 3,
    view: 'propped', zones: ['arms','chest'],
    target: { joints: ['L_WRIST','R_WRIST'], pairing: 'alternate', along: 0, across: 0.5 },
    cue: 'Punch one arm straight up, then the other.',
    framing: 'Phone on the floor, side-on, arms and chest in shot.',
    tips: ['Each punch counts as a rep', 'Keep your shoulders down'],
    signal: 'elbowAlternate', needs: ARMS,
    detector: { mode: 'alternate', enter: 0.24, minIntervalMs: 300 },
    xp: 1,
  },
  {
    id: 'snow-angels',
    name: 'Floor Snow Angels',
    area: 'arms', emoji: '❄️', position: 'back', laziness: 1,
    view: 'propped', zones: ['arms','back'],
    target: { joints: ['L_WRIST','R_WRIST'], pairing: 'mirror', along: 0.6, across: 0 },
    cue: 'Arms out wide on the floor, sweep them overhead and back.',
    framing: 'Phone on the floor, side-on, arms and chest in shot.',
    tips: ['Keep your arms in contact with the floor', 'Slow and wide'],
    signal: 'armSpread', needs: ARMS,
    detector: { mode: 'cycle', enter: 0.55, exit: 0.22, minIntervalMs: 700 },
    xp: 2,
  },
  {
    id: 'skull-crushers',
    name: 'Skull Crushers',
    area: 'arms', emoji: '💀', position: 'back', laziness: 3,
    view: 'propped', zones: ['arms'],
    target: { joints: ['L_WRIST','R_WRIST'], pairing: 'mirror', along: 0.4, across: 0, radius: 0.25 },
    cue: 'Arms straight up, bend at the elbows toward your forehead, press back.',
    framing: 'Phone on the floor, side-on, arms and chest in shot.',
    tips: ['Elbows stay pointing at the ceiling', 'Water bottles optional'],
    signal: 'elbowBend', needs: ARMS,
    detector: { mode: 'cycle', enter: 0.5, exit: 0.2, minIntervalMs: 650 },
    xp: 3,
  },

  /* ---------------------------------------------------------------- cardio */
  {
    id: 'fast-bicycles',
    name: 'Fast Bicycles',
    area: 'cardio', emoji: '⚡', position: 'back', laziness: 4,
    view: 'handheld', zones: ['core','quads'],
    target: { joints: ['L_KNEE','R_KNEE'], pairing: 'alternate', along: 0.45, across: 0 },
    cue: 'Same bicycles, quicker. Keep the knees driving.',
    framing: FRAMING,
    tips: ['Breathe', 'Each knee drive counts'],
    signal: 'kneeAlternate', needs: LEGS,
    detector: { mode: 'alternate', enter: 0.2, minIntervalMs: 200 },
    xp: 1,
  },
  {
    id: 'lying-jacks',
    name: 'Lying Jacks',
    area: 'cardio', emoji: '🌟', position: 'back', laziness: 3,
    view: 'handheld', zones: ['outer-thigh','core'],
    target: { joints: ['L_ANKLE','R_ANKLE'], pairing: 'mirror', along: 0, across: 0.45 },
    cue: 'On your back, slide both legs out wide and back together.',
    framing: FRAMING_LEGS,
    tips: ['Add the arms overhead for extra credit', 'Out and back is one rep'],
    signal: 'legSpread', needs: LEGS,
    detector: { mode: 'cycle', enter: 0.4, exit: 0.16, minIntervalMs: 380 },
    xp: 2,
  },
  {
    id: 'knee-drives',
    name: 'Floor Knee Drives',
    area: 'cardio', emoji: '🏃', position: 'back', laziness: 5,
    view: 'handheld', zones: ['core','quads'],
    target: { joints: ['L_KNEE','R_KNEE'], pairing: 'alternate', along: 0.5, across: 0 },
    cue: 'Running on your back: drive one knee in, then the other, quickly.',
    framing: FRAMING,
    tips: ['Shoulders stay down', 'Each knee counts'],
    signal: 'kneeAlternate', needs: LEGS,
    detector: { mode: 'alternate', enter: 0.22, minIntervalMs: 200 },
    xp: 1,
  },
  {
    id: 'fast-flutters',
    name: 'Fast Flutters',
    area: 'cardio', emoji: '💨', position: 'back', laziness: 4,
    view: 'handheld', zones: ['lower-abs','core'],
    target: { joints: ['L_ANKLE','R_ANKLE'], pairing: 'alternate', along: 0, across: 0.22 },
    cue: 'Quick small flutter kicks. Do not stop early.',
    framing: FRAMING_LEGS,
    tips: ['Small and fast beats big and slow', 'Each kick counts'],
    signal: 'ankleSplit', needs: LEGS,
    detector: { mode: 'alternate', enter: 0.09, minIntervalMs: 180 },
    xp: 1,
  },
];

export const EXERCISE_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

/**
 * Routines. `moves` are [exerciseId, reps] pairs, run in order with a short
 * rest between each. Every routine is done without getting up.
 */
export const ROUTINES = [
  // ---- core
  { id: 'core-barely', area: 'core', name: 'Barely Awake Abs', laziness: 1, minutes: 4,
    blurb: 'Flat on your back the entire time. No crunching.',
    moves: [['flutter-kicks', 20], ['dead-bug', 12], ['flutter-kicks', 20]] },
  { id: 'core-classic', area: 'core', name: 'Horizontal Abs', laziness: 3, minutes: 6,
    blurb: 'The one from the ad. Knees in, knees out.',
    moves: [['knee-tucks', 12], ['bicycles', 20], ['dead-bug', 14], ['flutter-kicks', 24]] },
  { id: 'core-tryhard', area: 'core', name: 'Core, Genuinely', laziness: 5, minutes: 9,
    blurb: 'Leg lowers included. You will notice these.',
    moves: [['knee-tucks', 15], ['leg-lowers', 10], ['bicycles', 24], ['dead-bug', 16], ['leg-lowers', 10]] },

  // ---- glutes
  { id: 'glutes-lazy', area: 'glutes', name: 'Side-Lying Special', laziness: 1, minutes: 4,
    blurb: 'Roll onto your side. That is the hardest part.',
    moves: [['clamshells', 15], ['side-leg-lifts', 12], ['clamshells', 15]] },
  { id: 'glutes-bridge', area: 'glutes', name: 'Bridge Club', laziness: 3, minutes: 5,
    blurb: 'Hips up, hips down. The best glute move there is.',
    moves: [['glute-bridge', 15], ['clamshells', 15], ['glute-bridge', 15]] },
  { id: 'glutes-full', area: 'glutes', name: 'Peach Protocol', laziness: 4, minutes: 8,
    blurb: 'Back, side and front. A full rotation.',
    moves: [['glute-bridge', 15], ['single-bridge', 12], ['side-leg-lifts', 14], ['clamshells', 16], ['glute-bridge', 15]] },
  { id: 'glutes-prone', area: 'glutes', name: 'Face-Down Glutes', laziness: 3, minutes: 5,
    blurb: 'Roll onto your front and kick. Phone stays in your hands.',
    moves: [['donkey-kicks', 16], ['prone-scissors', 24], ['prone-lifts', 16], ['donkey-kicks', 16]] },

  // ---- legs
  { id: 'legs-lazy', area: 'legs', name: 'Feet Only', laziness: 1, minutes: 3,
    blurb: 'Ankle pumps and slow extends. Practically a nap.',
    moves: [['ankle-pumps', 20], ['leg-extends', 16], ['ankle-pumps', 20]] },
  { id: 'legs-air', area: 'legs', name: 'Air Legs', laziness: 3, minutes: 6,
    blurb: 'Everything happens with your feet off the floor.',
    moves: [['wall-marches', 24], ['ceiling-press', 12], ['leg-extends', 16], ['ankle-pumps', 20]] },
  { id: 'legs-full', area: 'legs', name: 'Leg Day, Horizontal', laziness: 4, minutes: 8,
    blurb: 'Presses, curls and marches. Still no standing.',
    moves: [['ceiling-press', 15], ['leg-extends', 16], ['wall-marches', 30], ['ceiling-press', 15], ['ankle-pumps', 20]] },

  // ---- arms
  { id: 'arms-lazy', area: 'arms', name: 'Angels Only', laziness: 1, minutes: 3,
    blurb: 'Sweep your arms around on the floor. That is it.',
    moves: [['snow-angels', 15], ['ceiling-punches', 20], ['snow-angels', 15]] },
  { id: 'arms-press', area: 'arms', name: 'Press Something', laziness: 3, minutes: 5,
    blurb: 'Better with a water bottle in each hand.',
    moves: [['floor-press', 12], ['ceiling-punches', 24], ['floor-press', 12]] },
  { id: 'arms-full', area: 'arms', name: 'Arms, Committed', laziness: 4, minutes: 7,
    blurb: 'Skull crushers. Do not actually crush your skull.',
    moves: [['floor-press', 14], ['skull-crushers', 12], ['snow-angels', 15], ['skull-crushers', 12]] },

  // ---- cardio
  { id: 'cardio-gentle', area: 'cardio', name: 'Quiet Cardio', laziness: 2, minutes: 4,
    blurb: 'No jumping, no thumping. The downstairs neighbour will never know.',
    moves: [['lying-jacks', 20], ['fast-bicycles', 30], ['lying-jacks', 20]] },
  { id: 'cardio-burst', area: 'cardio', name: 'Two Minute Burn', laziness: 4, minutes: 4,
    blurb: 'Short. Unpleasant. Over quickly.',
    moves: [['knee-drives', 30], ['fast-flutters', 30], ['knee-drives', 30]] },
  { id: 'cardio-full', area: 'cardio', name: 'Floor Sprint', laziness: 5, minutes: 8,
    blurb: 'The one you pick when you feel guilty.',
    moves: [['fast-bicycles', 40], ['lying-jacks', 25], ['knee-drives', 40], ['fast-flutters', 30], ['lying-jacks', 25]] },

  // ---- full body
  { id: 'full-wake', area: 'full', name: 'Wake Up Body', laziness: 2, minutes: 5,
    blurb: 'One move per area, done before you get out of bed.',
    moves: [['snow-angels', 12], ['glute-bridge', 12], ['crunches', 10], ['clamshells', 14]] },
  { id: 'full-standard', area: 'full', name: 'The Whole Sloth', laziness: 3, minutes: 8,
    blurb: 'The default. Do this one when you cannot decide.',
    moves: [['glute-bridge', 15], ['floor-press', 12], ['crunches', 12], ['single-bridge', 12], ['clamshells', 15]] },
  { id: 'full-boss', area: 'full', name: 'Boss Fight', laziness: 5, minutes: 12,
    blurb: 'Every area, back to back, without getting up. Double points.',
    xpMultiplier: 2,
    moves: [['knee-drives', 30], ['ceiling-press', 15], ['leg-lowers', 10], ['lying-jacks', 20],
            ['knee-tucks', 14], ['fast-bicycles', 30], ['fast-flutters', 30]] },
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

/** Live score shown during a workout: a rounder, more satisfying number. */
export const POINTS_PER_XP = 10;
export function repPoints(exerciseId, multiplier = 1) {
  return (EXERCISE_BY_ID[exerciseId]?.xp ?? 2) * POINTS_PER_XP * multiplier;
}

/** Which positions a routine involves, for the "on your back" tags. */
export function routinePositions(routine) {
  const seen = [];
  for (const [id] of routine.moves) {
    const pos = EXERCISE_BY_ID[id]?.position;
    if (pos && !seen.includes(pos)) seen.push(pos);
  }
  return seen;
}

export const LAZINESS_LABEL = ['', 'Horizontal', 'Barely Moving', 'Mild Effort', 'Some Sweat', 'Actually Trying'];
