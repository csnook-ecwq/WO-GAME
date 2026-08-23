import { test } from 'node:test';
import assert from 'node:assert/strict';

// store.js reaches for localStorage at import time, so give it one.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { sudsFor, rollBuddyName, avatarName } = await import('../js/store.js');

test('suds scale with pops and reward a combo', () => {
  assert.equal(sudsFor(0), 0);
  assert.equal(sudsFor(1), 10);
  // A combo of five is worth a quarter more; the multiplier is capped so a long
  // streak cannot run away with the economy.
  assert.equal(sudsFor(4, 5), 50);
  assert.equal(sudsFor(10, 500), sudsFor(10, 30));
});

test('suds are never negative', () => {
  assert.equal(sudsFor(-5), 0);
});

test('the name roller always returns something sayable', () => {
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    const n = rollBuddyName();
    assert.ok(n.length > 0, 'rolled an empty name');
    assert.ok(n.length <= 12, `rolled something too long: ${n}`);
    assert.equal(n[0], n[0].toUpperCase(), `not capitalised: ${n}`);
    seen.add(n);
  }
  // Combinatorial rather than a fixed list, so it should not run dry.
  assert.ok(seen.size > 250, `only ${seen.size} distinct names`);
});

test('avatars are always mini someone', () => {
  assert.equal(avatarName('Chris'), 'mini Chris');
  assert.equal(avatarName('  Renni '), 'mini Renni');
  assert.equal(avatarName(''), 'mini you');
  assert.equal(avatarName(null), 'mini you');
});
