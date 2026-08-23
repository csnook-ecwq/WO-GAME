/**
 * store.js — profiles and everything saved about them.
 *
 * Built account-shaped on purpose: a profile has an id, a name, a picture and
 * its own everything, and the sign-in screen is a real sign-in screen. There is
 * simply no server underneath it yet. When there is, this file is the only place
 * that has to learn about it.
 *
 * Nothing here ever leaves the device.
 */

const KEY = 'app.v1';
const BACKUP = 'app.v1.backup';
const UNLOCK_MS = 5 * 60 * 1000;   // how long a PIN stays satisfied

/** Words for recovery codes: short, unambiguous, easy to write down. */
const WORDS = [
  'apple', 'anchor', 'amber', 'bloom', 'bridge', 'butter', 'cactus', 'candle',
  'cherry', 'cloud', 'copper', 'daisy', 'dolphin', 'ember', 'feather', 'forest',
  'garden', 'ginger', 'harbour', 'honey', 'island', 'jelly', 'kettle', 'ladder',
  'lantern', 'lemon', 'lilac', 'maple', 'meadow', 'mitten', 'nectar', 'ocean',
  'orbit', 'pebble', 'pepper', 'pillow', 'planet', 'pocket', 'poppy', 'puddle',
  'ribbon', 'river', 'saddle', 'silver', 'sparrow', 'summer', 'sunset', 'teapot',
  'thimble', 'tulip', 'velvet', 'walnut', 'willow', 'window', 'yellow', 'zephyr',
];

export const SCHEMES = [
  { id: 'coral', name: 'Coral' },
  { id: 'teal', name: 'Teal' },
  { id: 'apricot', name: 'Apricot' },
  { id: 'mint', name: 'Mint' },
  { id: 'butter', name: 'Butter' },
];

export const BUDDY_KINDS = [
  { id: 'bubble', name: 'Bubble', hint: 'A little creature made of bubbles' },
  { id: 'avatar', name: 'You', hint: 'A bubbly version of your own face' },
  { id: 'pet', name: 'Pet', hint: 'Something to keep you company' },
];

/* ------------------------------------------------------------ buddy naming
 *
 * The creature has no name until its owner gives it one. The roller combines two
 * syllable lists rather than picking from a fixed list, so it never runs dry and
 * everything it produces is short, soft and sayable by a four-year-old — with no
 * real meaning to get wrong.
 */

const NAME_HEAD = [
  'Pip', 'Nub', 'Mo', 'Ol', 'Sud', 'Bo', 'Lu', 'Ti', 'Bub', 'Wob',
  'Fiz', 'Pud', 'Gli', 'Dot', 'Plu', 'Squi', 'Tof', 'Bim', 'Nim', 'Poo',
];
const NAME_TAIL = [
  '', 'bin', 'mo', 'lo', 'sy', 'po', 'na', 'ly', 'ble', 'ket',
  'zy', 'dle', 'mp', 'go', 'ffle', 'nk', 'ee', 'bo', 'wa', 'sh',
];

/** @returns {string} never empty, always capitalised */
export function rollBuddyName() {
  const head = NAME_HEAD[Math.floor(Math.random() * NAME_HEAD.length)];
  const tail = NAME_TAIL[Math.floor(Math.random() * NAME_TAIL.length)];
  const name = `${head}${tail}`;
  // A bare head syllable is a perfectly good name (Pip, Mo, Dot), but it must
  // never come back as an empty string.
  return name.length ? name[0].toUpperCase() + name.slice(1) : 'Pip';
}

/** Avatars are always "mini <owner>" — derived, never stored. */
export function avatarName(profileName) {
  return `mini ${String(profileName || 'you').trim()}`;
}

/* ------------------------------------------------------------------- suds
 *
 * Points are suds. They are earned by popping and spent on skins, accessories
 * and venues. Kid profiles earn them too — it is the reward that works for a
 * four-year-old, who deliberately gets no streak.
 */

/** Combo multiplier: generous, and capped so a long streak can't run away. */
export function sudsFor(pops, combo = 0) {
  const mult = 1 + Math.min(Math.floor(combo / 5) * 0.25, 1.5);
  return Math.max(0, Math.round(pops * 10 * mult));
}

const EMPTY = {
  profiles: [],
  friendships: [],
  activity: [],
  lastProfileId: null,
};

let state = load();
let unlockedUntil = 0;
let unlockedId = null;

/* ------------------------------------------------------------------ storage */

function load() {
  for (const key of [KEY, BACKUP]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.profiles)) {
        return { ...structuredClone(EMPTY), ...parsed };
      }
    } catch (err) {
      console.warn('could not read', key, err);
    }
  }
  return structuredClone(EMPTY);
}

function save() {
  // Never let an empty store overwrite a populated one. This has bitten before:
  // a failed read early in startup used to wipe real progress on the next write.
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && !state.profiles.length) {
      const prev = JSON.parse(existing);
      if (prev?.profiles?.length) {
        console.warn('refusing to overwrite a populated store with an empty one');
        return;
      }
    }
  } catch { /* unreadable existing value is not a reason to refuse */ }

  const json = JSON.stringify(state);
  try {
    localStorage.setItem(KEY, json);
    localStorage.setItem(BACKUP, json);
  } catch (err) {
    console.warn('save failed', err);
  }
}

/** Ask iOS to keep this data rather than evicting it under pressure. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* not supported */ }
  return false;
}

export async function storageUsed() {
  try {
    const e = await navigator.storage?.estimate?.();
    if (e) return { used: e.usage || 0, quota: e.quota || 0 };
  } catch { /* not supported */ }
  return null;
}

/* ----------------------------------------------------------------- profiles */

const uid = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function getState() { return state; }
export function profiles() { return state.profiles; }
export function profile(id) { return state.profiles.find((p) => p.id === id) || null; }

/**
 * @param {{name: string, scheme?: string, buddy?: string, kid?: boolean, photo?: string}} input
 */
export function createProfile(input) {
  const p = {
    id: uid(),
    name: String(input.name || '').trim().slice(0, 18) || 'You',
    scheme: input.scheme || 'coral',
    buddy: input.buddy || 'bubble',
    kid: !!input.kid,
    photo: input.photo || null,
    // Kid profiles never get a PIN. It removes the one lockout nobody can
    // recover from: a four-year-old setting a secret code and forgetting it.
    pin: null,
    recovery: null,
    createdAt: Date.now(),
    lastSeenAt: null,
    // Null until she names it or rolls one. Never named for her at setup — that
    // is a decision worth letting someone make when they care about it.
    buddyName: null,
    // Which colourway she's wearing. Everyone starts pearl; the rest arrive as
    // entries in SKINS in buddy.js and, later, as things suds can buy.
    skin: 'pearl',
    suds: 0,
    sudsLedger: [],
    streak: 0,
    week: [0, 0, 0, 0, 0, 0, 0],
    sessions: [],
    goals: { areas: [], corrections: [] },
    settings: { sound: true, haptics: true, auraOpacity: 0.55 },
  };
  state.profiles.push(p);
  save();
  return p;
}

export function updateProfile(id, patch) {
  const p = profile(id);
  if (!p) return null;
  Object.assign(p, patch);
  save();
  return p;
}

export function removeProfile(id) {
  state.profiles = state.profiles.filter((p) => p.id !== id);
  if (state.lastProfileId === id) state.lastProfileId = null;
  save();
}

export function setLastProfile(id) {
  state.lastProfileId = id;
  save();
}

/** Called when a profile is opened — drives the buddy's greeting. */
export function touchProfile(id) {
  const p = profile(id);
  if (!p) return;
  const previous = p.lastSeenAt;
  p.lastSeenAt = Date.now();
  save();
  return previous;
}

/* --------------------------------------------------------------------- PINs
 *
 * A PIN here is a lock on a phone in someone's own house, not a defence against
 * an attacker with the device and time. It is stored hashed rather than in the
 * clear so that a glance at localStorage does not reveal it, and the recovery
 * code is the deliberate way back in.
 */

async function hash(text) {
  const data = new TextEncoder().encode(`v1:${text}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function makeRecoveryCode() {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  return Array.from({ length: 6 }, pick).join(' ');
}

/**
 * @returns {Promise<string>} the recovery code, which the caller must show once
 *   and must not let the user past without confirming they have saved it.
 */
export async function setPin(id, pin) {
  const p = profile(id);
  if (!p || p.kid) return null;
  const code = makeRecoveryCode();
  p.pin = await hash(pin);
  p.recovery = await hash(code);
  save();
  return code;
}

export async function clearPin(id) {
  const p = profile(id);
  if (!p) return;
  p.pin = null;
  p.recovery = null;
  save();
}

export async function checkPin(id, pin) {
  const p = profile(id);
  if (!p?.pin) return true;
  const ok = p.pin === await hash(pin);
  if (ok) markUnlocked(id);
  return ok;
}

export async function checkRecovery(id, code) {
  const p = profile(id);
  if (!p?.recovery) return false;
  const normal = String(code).trim().toLowerCase().replace(/\s+/g, ' ');
  const ok = p.recovery === await hash(normal);
  if (ok) markUnlocked(id);
  return ok;
}

export function markUnlocked(id) {
  unlockedId = id;
  unlockedUntil = Date.now() + UNLOCK_MS;
}

/** True when this profile was unlocked recently enough not to ask again. */
export function isUnlocked(id) {
  const p = profile(id);
  if (!p || !p.pin) return true;
  return unlockedId === id && Date.now() < unlockedUntil;
}

export function lockNow() {
  unlockedId = null;
  unlockedUntil = 0;
}

/* -------------------------------------------------------------- the record */

/** Seven booleans, Monday first, for the dots under the buddy. */
export function weekDots(id) {
  const p = profile(id);
  if (!p) return [0, 0, 0, 0, 0, 0, 0];
  const start = startOfWeek();
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const s of p.sessions || []) {
    const d = Math.floor((s.at - start) / 86400000);
    if (d >= 0 && d < 7) out[d] = Math.max(out[d], s.effort || 0.4);
  }
  return out;
}

function startOfWeek(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;      // Monday = 0
  d.setDate(d.getDate() - day);
  return d.getTime();
}

/**
 * Add or spend suds. Returns the new balance.
 *
 * The balance can never go negative — a bug in the shop should refuse a purchase,
 * not leave someone owing the app money.
 */
export function addSuds(id, amount, reason = '') {
  const p = profile(id);
  if (!p) return 0;
  const next = Math.max(0, (p.suds || 0) + Math.round(amount));
  if (amount < 0 && (p.suds || 0) + amount < 0) return p.suds || 0;
  p.suds = next;
  p.sudsLedger = [{ at: Date.now(), amount: Math.round(amount), reason }, ...(p.sudsLedger || [])].slice(0, 100);
  save();
  return p.suds;
}

export function suds(id) {
  return profile(id)?.suds || 0;
}

export function addActivity(entry) {
  state.activity.unshift({ at: Date.now(), ...entry });
  state.activity = state.activity.slice(0, 200);
  save();
}

export function activity() { return state.activity; }

/* -------------------------------------------------------------- export/wipe */

export function exportAll() {
  return JSON.stringify({ version: 1, exportedAt: Date.now(), data: state }, null, 2);
}

export function wipeEverything() {
  state = structuredClone(EMPTY);
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(BACKUP);
  } catch { /* nothing to remove */ }
  lockNow();
}
