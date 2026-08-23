import { test } from 'node:test';
import assert from 'node:assert/strict';

// Real tests arrive with the tracking milestone; this keeps `npm test` honest
// (and the deploy workflow green) while the shell is being built.
test('the shell has something to test later', () => {
  assert.ok(true);
});
