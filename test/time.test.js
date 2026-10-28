import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatTime, localClock } from '../src/time.js';

test('times of day in New York, whatever the timezone of the instance', () => {
  // Daylight saving time (UTC-4) until 1 November 2026, then UTC-5.
  assert.equal(formatTime(Date.parse('2026-10-28T14:38:20Z')), '10:38');
  assert.equal(formatTime(Date.parse('2026-11-02T14:38:20Z')), '09:38');
  assert.equal(formatTime(Date.parse('2026-10-28T14:38:20Z'), 'UTC'), '14:38');
  assert.equal(formatTime(null), '');
  assert.deepEqual(localClock(Date.parse('2026-10-29T02:30:00Z')), {
    date: '2026-10-28',
    minutes: 22 * 60 + 30,
  });
});
