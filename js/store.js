/**
 * store.js — all persistent state, in localStorage. No account, no server.
 *
 * Everything is per profile: you and anyone else who plays keep separate stars,
 * skins and streaks. Device-wide settings (sound, camera preference) are shared,
 * because they describe the phone rather than the player.
 *
 * A profile can be marked `kid`, which is not decoration: kid profiles never get
 * offered the body journal or anything about appearance.
 */

import { LEVELS, totalStars } from './levels.js';
import { SKIN_IDS, SKINS } from './ghost.js';

const KEY = 'aura.v1';
const LEGACY_KEY = 'slothmode.v1';

export const PLAYER_COLORS = [
  '#FF8FB1', '#7BD8C8', '#9BB8FF', '#FFC46B', '#C79BFF', '#7FD1FF',
];

export const LEVEL_TITLES = [
  { stars: 0, title: 'Just Started', emoji: '🌱' },
  { stars: 6, title: 'Getting Glowy', emoji: '✨' },
  { stars: 14, title: 'Regular', emoji: '🌸' },
  { stars: 24, title: 'Strong', emoji: '💫' },
  { stars: 34, title: 'Very Strong', emoji: '🌟' },
  { stars: 44, title: 'Unstoppable', emoji: '👑' },
];

export const BADGES = [
  { id: 'first', name: 'First Glow', emoji: '🌱', desc: 'Finish your first level' },
  { id: 'streak3', name: 'Three Days', emoji: '🔥', desc: '3 day streak' },
  { id: 'streak7', name: 'A Whole Week', emoji: '📅', desc: '7 day streak' },
  { id: 'combo10', name: 'On A Roll', emoji: '⚡', desc: 'A combo of 10' },
  { id: 'combo25', name: 'Untouchable', emoji: '💎', desc: 'A combo of 25' },
  { id: 'perfect', name: 'Every Orb', emoji: '🎯', desc: 'Three stars on any level' },
  { id: 'world1', name: 'First Light', emoji: '🌤️', desc: 'Clear the first world' },
  { id: 'boss', name: 'Boss Down', emoji: '🏆', desc: 'Beat a boss level' },
  { id: 'reps500', name: 'Five Hundred', emoji: '🎖️', desc: '500 lifetime reps' },
];

const emptyProgress = () => ({
  xp: 0,
  totalReps: 0,
  totalSeconds: 0,
  sessions: [],            // { ts, levelId, reps, score, stars, seconds }
  levels: {},              // levelId -> { stars, bestScore }
  badges: [],
  skin: 'glow',
  unlockedSkins: ['glow'],
});

const emptyState = () => ({
  profiles: [],
  activeId: null,
  progress: {},
  settings: { sound: true, voice: true, showCamera: false, mirror: true },
});

let state = emptyState();
const listeners = new Set();

const uid = () => `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/* ------------------------------------------------------------------ load */

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = {
        ...emptyState(),
        ...parsed,
        settings: { ...emptyState().settings, ...(parsed.settings || {}) },
      };
    } else {
      migrateLegacy();
    }
  } catch (err) {
    console.warn('Could not read saved progress, starting fresh.', err);
    state = emptyState();
  }
  return state;
}

/** Carries over progress from the previous version of the app, if any. */
function migrateLegacy() {
  let old = null;
  try { old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); } catch { /* ignore */ }
  if (!old) return;
  const id = uid();
  state = emptyState();
  state.profiles = [{ id, name: 'Me', color: PLAYER_COLORS[0], kid: false, createdAt: Date.now() }];
  state.activeId = id;
  state.progress[id] = {
    ...emptyProgress(),
    xp: old.xp || 0,
    totalReps: old.totalReps || 0,
    totalSeconds: old.totalSeconds || 0,
    sessions: (old.sessions || []).map((s) => ({
      ts: s.ts, levelId: null, reps: s.reps || 0, score: (s.xp || 0) * 10, stars: 0, seconds: s.seconds || 0,
    })),
  };
  state.settings = { ...state.settings, ...(old.settings || {}) };
  save();
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

/* -------------------------------------------------------------- profiles */

export function profiles() { return state.profiles; }

export function activeProfile() {
  return state.profiles.find((p) => p.id === state.activeId) || null;
}

export function setActive(id) {
  if (state.profiles.some((p) => p.id === id)) {
    state.activeId = id;
    save();
  }
}

export function addProfile({ name, color, kid = false }) {
  const used = new Set(state.profiles.map((p) => p.color));
  const profile = {
    id: uid(),
    name: String(name || 'Player').slice(0, 14),
    color: color || PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[0],
    kid: !!kid,
    createdAt: Date.now(),
  };
  state.profiles.push(profile);
  state.progress[profile.id] = emptyProgress();
  state.activeId = profile.id;
  save();
  return profile;
}

export function updateProfile(id, patch) {
  const p = state.profiles.find((x) => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  save();
}

export function removeProfile(id) {
  state.profiles = state.profiles.filter((p) => p.id !== id);
  delete state.progress[id];
  if (state.activeId === id) state.activeId = state.profiles[0]?.id || null;
  save();
}

/** Progress for a profile, creating it on first use. */
export function progressOf(id = state.activeId) {
  if (!id) return emptyProgress();
  if (!state.progress[id]) state.progress[id] = emptyProgress();
  return state.progress[id];
}

/* ------------------------------------------------------------- progress */

export const starsByLevel = (id = state.activeId) => {
  const out = {};
  const levels = progressOf(id).levels || {};
  for (const [levelId, v] of Object.entries(levels)) out[levelId] = v.stars || 0;
  return out;
};

export const stars = (id = state.activeId) => totalStars(starsByLevel(id));

/** Title and progress toward the next one, driven by stars rather than XP. */
export function rankFor(starCount) {
  let index = 0;
  for (let i = 0; i < LEVEL_TITLES.length; i++) if (starCount >= LEVEL_TITLES[i].stars) index = i;
  const current = LEVEL_TITLES[index];
  const next = LEVEL_TITLES[index + 1] || null;
  const span = next ? next.stars - current.stars : 1;
  return {
    index,
    title: current.title,
    emoji: current.emoji,
    next,
    progress: next ? Math.min(1, (starCount - current.stars) / span) : 1,
    toNext: next ? next.stars - starCount : 0,
  };
}

export const dayKey = (ts = Date.now()) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Consecutive-day streak ending today or yesterday. */
export function streak(sessions) {
  const list = sessions || progressOf().sessions || [];
  if (!list.length) return 0;
  const days = new Set(list.map((s) => dayKey(s.ts)));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function todayStats(id = state.activeId) {
  const key = dayKey();
  const todays = (progressOf(id).sessions || []).filter((s) => dayKey(s.ts) === key);
  return {
    levels: todays.length,
    reps: todays.reduce((n, s) => n + s.reps, 0),
    score: todays.reduce((n, s) => n + (s.score || 0), 0),
    seconds: todays.reduce((n, s) => n + s.seconds, 0),
  };
}

/** Reps per day for the last `days` days, oldest first. */
export function repsByDay(days = 14, id = state.activeId) {
  const sessions = progressOf(id).sessions || [];
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const key = dayKey(d.getTime());
    out.push({
      key,
      label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      reps: sessions.filter((s) => dayKey(s.ts) === key).reduce((n, s) => n + s.reps, 0),
    });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * Records a finished level and returns what changed, so the results screen can
 * celebrate the right things.
 */
export function recordLevel(result) {
  const id = state.activeId;
  const p = progressOf(id);
  const beforeStars = stars(id);
  const beforeSkins = new Set(p.unlockedSkins);

  const entry = {
    ts: Date.now(),
    levelId: result.levelId,
    reps: result.reps,
    score: result.score,
    stars: result.stars,
    seconds: result.seconds,
  };
  p.sessions.push(entry);
  if (p.sessions.length > 400) p.sessions = p.sessions.slice(-400);
  p.xp += result.xp || 0;
  p.totalReps += result.reps || 0;
  p.totalSeconds += result.seconds || 0;

  const prev = p.levels[result.levelId] || { stars: 0, bestScore: 0 };
  p.levels[result.levelId] = {
    stars: Math.max(prev.stars, result.stars || 0),
    bestScore: Math.max(prev.bestScore, result.score || 0),
  };

  const afterStars = stars(id);
  // Skins unlock on total stars, so finishing a level can hand you a new look.
  const nowUnlocked = SKIN_IDS.filter((s) => afterStars >= (SKINS[s].unlockAt || 0));
  p.unlockedSkins = nowUnlocked;
  const newSkins = nowUnlocked.filter((s) => !beforeSkins.has(s));

  const earned = checkBadges(p, result, afterStars);
  save();

  return {
    entry,
    earned,
    newSkins,
    stars: afterStars,
    starsGained: afterStars - beforeStars,
    rank: rankFor(afterStars),
    rankUp: rankFor(afterStars).index > rankFor(beforeStars).index,
    streak: streak(p.sessions),
  };
}

function award(p, id, into) {
  if (!p.badges.includes(id)) {
    p.badges.push(id);
    const badge = BADGES.find((b) => b.id === id);
    if (badge) into.push(badge);
  }
}

function checkBadges(p, result, starCount) {
  const earned = [];
  award(p, 'first', earned);
  const s = streak(p.sessions);
  if (s >= 3) award(p, 'streak3', earned);
  if (s >= 7) award(p, 'streak7', earned);
  if ((result.bestCombo || 0) >= 10) award(p, 'combo10', earned);
  if ((result.bestCombo || 0) >= 25) award(p, 'combo25', earned);
  if (result.stars >= 3) award(p, 'perfect', earned);
  if (p.totalReps >= 500) award(p, 'reps500', earned);
  if (/boss/i.test(result.levelId || '')) award(p, 'boss', earned);
  const firstWorld = LEVELS.filter((l) => l.world === 'first-light');
  if (firstWorld.every((l) => (p.levels[l.id]?.stars || 0) > 0)) award(p, 'world1', earned);
  return earned;
}

export function setSkin(skinId) {
  const p = progressOf();
  if (p.unlockedSkins.includes(skinId)) {
    p.skin = skinId;
    save();
  }
}

/** Colour + skin for the ghost of the active profile. */
export function activeStyle() {
  const profile = activeProfile();
  const p = progressOf();
  return {
    color: profile?.color || PLAYER_COLORS[0],
    skin: p.skin || 'glow',
    label: null,
  };
}

export function resetProfile(id = state.activeId) {
  state.progress[id] = emptyProgress();
  save();
}
