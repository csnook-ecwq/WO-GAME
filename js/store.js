/**
 * store.js — all persistent state. Everything lives in localStorage; there is
 * no backend and no account, which is very much in the spirit of the app.
 */

import { EXERCISE_BY_ID, AREAS } from './exercises.js';

const KEY = 'slothmode.v1';

export const LEVELS = [
  { xp: 0,     title: 'Fully Horizontal',  emoji: '🛌' },
  { xp: 150,   title: 'Couch Larva',       emoji: '🐛' },
  { xp: 450,   title: 'Sofa Sloth',        emoji: '🦥' },
  { xp: 900,   title: 'Recliner Rookie',   emoji: '🪑' },
  { xp: 1600,  title: 'Occasional Mover',  emoji: '🚶' },
  { xp: 2600,  title: 'Suspiciously Fit',  emoji: '🕺' },
  { xp: 4000,  title: 'Low-Key Athlete',   emoji: '🏃' },
  { xp: 6000,  title: 'Sloth Deluxe',      emoji: '⚡' },
  { xp: 9000,  title: 'Cardio Gremlin',    emoji: '🔥' },
  { xp: 13000, title: 'Legend of the Rug', emoji: '👑' },
];

export const BADGES = [
  { id: 'first',      name: 'Got Off The Couch',  emoji: '🚀', desc: 'Finish your first workout' },
  { id: 'streak3',    name: 'Three In A Row',     emoji: '🔥', desc: '3 day streak' },
  { id: 'streak7',    name: 'A Whole Week',       emoji: '📅', desc: '7 day streak' },
  { id: 'reps100',    name: 'Century',            emoji: '💯', desc: '100 lifetime reps' },
  { id: 'reps1000',   name: 'Four Figures',       emoji: '🎖️', desc: '1000 lifetime reps' },
  { id: 'allareas',   name: 'Well Rounded',       emoji: '🎯', desc: 'Train every target area' },
  { id: 'boss',       name: 'Boss Slain',         emoji: '👑', desc: 'Finish the Boss Fight routine' },
  { id: 'perfect',    name: 'Full Marks',         emoji: '✨', desc: 'Complete every rep in a routine' },
  { id: 'earlybird',  name: 'Before 8am',         emoji: '🌅', desc: 'Work out before 8am' },
  { id: 'nightowl',   name: 'After 10pm',         emoji: '🌙', desc: 'Work out after 10pm' },
];

const emptyState = () => ({
  xp: 0,
  totalReps: 0,
  totalSeconds: 0,
  sessions: [],          // { ts, routineId, area, reps, targetReps, xp, seconds, perfect }
  areaReps: {},          // areaId -> lifetime reps
  badges: [],            // badge ids
  settings: { sound: true, voice: true, skeleton: true, mirror: true, facing: 'user' },
  lastSeen: null,
});

let state = emptyState();
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...emptyState(), ...parsed, settings: { ...emptyState().settings, ...(parsed.settings || {}) } };
    }
  } catch (err) {
    console.warn('Could not read saved progress, starting fresh.', err);
    state = emptyState();
  }
  return state;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save progress.', err);
  }
  listeners.forEach((fn) => fn(state));
}

export function getState() { return state; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setSetting(key, value) {
  state.settings[key] = value;
  save();
}

export const dayKey = (ts = Date.now()) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Level info for an XP total. */
export function levelFor(xp) {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].xp) index = i;
  const current = LEVELS[index];
  const next = LEVELS[index + 1] || null;
  const span = next ? next.xp - current.xp : 1;
  const into = xp - current.xp;
  return {
    index,
    level: index + 1,
    title: current.title,
    emoji: current.emoji,
    next,
    progress: next ? Math.min(1, into / span) : 1,
    toNext: next ? next.xp - xp : 0,
  };
}

/** Consecutive-day streak ending today or yesterday. */
export function streak(sessions = state.sessions) {
  if (!sessions.length) return 0;
  const days = new Set(sessions.map((s) => dayKey(s.ts)));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 0;
  // A streak survives until the end of today: start from today, and if today is
  // empty start from yesterday instead.
  let cursor = new Date(today);
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function todayStats() {
  const key = dayKey();
  const todays = state.sessions.filter((s) => dayKey(s.ts) === key);
  return {
    workouts: todays.length,
    reps: todays.reduce((n, s) => n + s.reps, 0),
    xp: todays.reduce((n, s) => n + s.xp, 0),
    seconds: todays.reduce((n, s) => n + s.seconds, 0),
  };
}

/** Reps per day for the last `days` days, oldest first. */
export function repsByDay(days = 14) {
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const key = dayKey(d.getTime());
    const reps = state.sessions
      .filter((s) => dayKey(s.ts) === key)
      .reduce((n, s) => n + s.reps, 0);
    out.push({ key, label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), reps });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function xpForReps(exerciseId, reps, multiplier = 1) {
  const per = EXERCISE_BY_ID[exerciseId]?.xp ?? 2;
  return Math.round(per * reps * multiplier);
}

/**
 * Records a finished (or bailed-on) session and returns what changed, so the
 * summary screen can brag about it.
 */
export function recordSession({ routineId, area, reps, targetReps, xp, seconds, perfect, perMove }) {
  const before = levelFor(state.xp);
  const entry = {
    ts: Date.now(), routineId, area,
    reps, targetReps, xp, seconds,
    perfect: !!perfect,
    perMove: perMove || [],
  };
  state.sessions.push(entry);
  if (state.sessions.length > 400) state.sessions = state.sessions.slice(-400);
  state.xp += xp;
  state.totalReps += reps;
  state.totalSeconds += seconds;
  state.areaReps[area] = (state.areaReps[area] || 0) + reps;

  const earned = checkBadges(entry);
  save();
  const after = levelFor(state.xp);
  return {
    entry,
    earned,
    leveledUp: after.index > before.index,
    level: after,
    streak: streak(),
  };
}

function award(id, into) {
  if (!state.badges.includes(id)) {
    state.badges.push(id);
    into.push(BADGES.find((b) => b.id === id));
  }
}

function checkBadges(entry) {
  const earned = [];
  award('first', earned);
  const s = streak();
  if (s >= 3) award('streak3', earned);
  if (s >= 7) award('streak7', earned);
  if (state.totalReps >= 100) award('reps100', earned);
  if (state.totalReps >= 1000) award('reps1000', earned);
  if (AREAS.every((a) => (state.areaReps[a.id] || 0) > 0)) award('allareas', earned);
  if (entry.routineId === 'full-boss') award('boss', earned);
  if (entry.perfect) award('perfect', earned);
  const hour = new Date(entry.ts).getHours();
  if (hour < 8) award('earlybird', earned);
  if (hour >= 22) award('nightowl', earned);
  return earned;
}

export function resetProgress() {
  const settings = state.settings;
  state = { ...emptyState(), settings };
  save();
}
