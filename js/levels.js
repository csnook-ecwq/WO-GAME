/**
 * levels.js — the map you play through.
 *
 * A level is a short routine with a fixed camera setup. Every move inside one
 * level shares the same `view`, because the camera is positioned once when the
 * level starts and you should never be asked to move the phone mid-level.
 *
 * Worlds are just groupings for the map; progress is per level.
 */

import { EXERCISE_BY_ID } from './exercises.js';

export const WORLDS = [
  { id: 'first-light', name: 'First Light', blurb: 'Barely moving. Start here.', color: '#FFC9D9' },
  { id: 'strong-legs', name: 'Strong Legs', blurb: 'Everything with your feet in the air.', color: '#B8E6D9' },
  { id: 'peach', name: 'Peach', blurb: 'Roll over. Glutes only.', color: '#FFB8A3' },
  { id: 'full-glow', name: 'Full Glow', blurb: 'A bit of everything, faster.', color: '#C9B8FF' },
];

export const WORLD_BY_ID = Object.fromEntries(WORLDS.map((w) => [w.id, w]));

/** `moves` are [exerciseId, reps]. Keep every move in a level on one view. */
export const LEVELS = [
  // ---- First Light: hand-held, tiny effort, teaches the orbs
  { id: 'l1', world: 'first-light', name: 'Little Kicks', blurb: 'Small flutters. Pop the orbs with your feet.',
    moves: [['flutter-kicks', 14], ['flutter-kicks', 14]] },
  { id: 'l2', world: 'first-light', name: 'Toes First', blurb: 'Point and flex. Smaller orbs, right on your toes.',
    moves: [['ankle-pumps', 12], ['flutter-kicks', 16], ['ankle-pumps', 12]] },
  { id: 'l3', world: 'first-light', name: 'Knees In', blurb: 'Pull your knees to your chest and back.',
    moves: [['knee-tucks', 10], ['flutter-kicks', 20], ['knee-tucks', 10]] },
  { id: 'l4', world: 'first-light', name: 'Slow Wheels', blurb: 'Cycle your knees, one at a time.',
    moves: [['bicycles', 16], ['knee-tucks', 12], ['bicycles', 16]] },

  // ---- Strong Legs: hand-held, legs doing the work
  { id: 'l5', world: 'strong-legs', name: 'Air March', blurb: 'Feet up, march slowly.',
    moves: [['wall-marches', 20], ['leg-extends', 14], ['wall-marches', 20]] },
  { id: 'l6', world: 'strong-legs', name: 'Ceiling Press', blurb: 'Knees in, then press both feet up.',
    moves: [['ceiling-press', 12], ['leg-extends', 16], ['ceiling-press', 12]] },
  { id: 'l7', world: 'strong-legs', name: 'Dead Bug', blurb: 'Slow and controlled. Low back stays down.',
    moves: [['dead-bug', 16], ['knee-tucks', 12], ['dead-bug', 16]] },
  { id: 'l8', world: 'strong-legs', name: 'Long Legs', blurb: 'Lower both legs as far as you can.',
    moves: [['leg-lowers', 8], ['ceiling-press', 12], ['leg-lowers', 8]] },

  // ---- Peach: face down, phone in front of you
  { id: 'l9', world: 'peach', name: 'Roll Over', blurb: 'On your front. Lift one straight leg, then the other.',
    moves: [['prone-lifts', 16], ['prone-scissors', 20], ['prone-lifts', 16]] },
  { id: 'l10', world: 'peach', name: 'Donkey Kicks', blurb: 'Knee bent, heel to the ceiling.',
    moves: [['donkey-kicks', 14], ['prone-lifts', 16], ['donkey-kicks', 14]] },
  { id: 'l11', world: 'peach', name: 'Heels Up', blurb: 'Curl your heels toward your glutes.',
    moves: [['heel-curls', 16], ['donkey-kicks', 14], ['prone-scissors', 24]] },
  { id: 'l12', world: 'peach', name: 'Peach Boss', blurb: 'Everything face-down, back to back.', xpMultiplier: 2,
    moves: [['donkey-kicks', 16], ['prone-lifts', 18], ['heel-curls', 18], ['prone-scissors', 26], ['donkey-kicks', 16]] },

  // ---- Full Glow: hand-held, quicker
  { id: 'l13', world: 'full-glow', name: 'Star Feet', blurb: 'Slide your legs wide and back together.',
    moves: [['lying-jacks', 16], ['knee-tucks', 12], ['lying-jacks', 16]] },
  { id: 'l14', world: 'full-glow', name: 'Running Down', blurb: 'Running, but lying on your back.',
    moves: [['knee-drives', 24], ['fast-flutters', 24], ['knee-drives', 24]] },
  { id: 'l15', world: 'full-glow', name: 'Fast Wheels', blurb: 'Bicycles, quicker than you want.',
    moves: [['fast-bicycles', 30], ['lying-jacks', 20], ['fast-bicycles', 30]] },
  { id: 'l16', world: 'full-glow', name: 'Glow Boss', blurb: 'The lot. Double points.', xpMultiplier: 2,
    moves: [['knee-drives', 26], ['ceiling-press', 14], ['fast-bicycles', 30], ['lying-jacks', 20], ['knee-tucks', 14]] },
];

export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
export const levelsOfWorld = (worldId) => LEVELS.filter((l) => l.world === worldId);
export const levelIndex = (id) => LEVELS.findIndex((l) => l.id === id);

/** The camera setup a level needs — taken from its moves, which must agree. */
export function levelView(level) {
  return EXERCISE_BY_ID[level.moves[0][0]]?.view || 'handheld';
}

export const levelReps = (level) => level.moves.reduce((n, [, r]) => n + r, 0);

/**
 * A level is playable once the one before it has at least one star. The first
 * level is always open.
 */
export function isUnlocked(levelId, starsByLevel = {}) {
  const i = levelIndex(levelId);
  if (i <= 0) return true;
  const prev = LEVELS[i - 1];
  return (starsByLevel[prev.id] || 0) > 0;
}

/** The level to nudge you toward: first unlocked one you have not 3-starred. */
export function nextLevel(starsByLevel = {}) {
  for (const level of LEVELS) {
    if (!isUnlocked(level.id, starsByLevel)) break;
    if ((starsByLevel[level.id] || 0) < 3) return level;
  }
  return LEVELS[LEVELS.length - 1];
}

export const totalStars = (starsByLevel = {}) =>
  LEVELS.reduce((n, l) => n + (starsByLevel[l.id] || 0), 0);
