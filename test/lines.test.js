import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LINES, findLine, feedsOf, lineById, FEEDS } from '../src/lines.js';

test('the 29 routes of the MTA, each in one feed', () => {
  assert.equal(LINES.length, 29);
  assert.equal(new Set(LINES.map((line) => line.id)).size, 29);
  assert.ok(LINES.every((line) => Object.values(FEEDS).includes(line.feed)));
  assert.equal(lineById('fs').feed, FEEDS.BDFM);
  assert.equal(lineById('H').feed, FEEDS.ACE);
  assert.equal(lineById('nope'), null);
});

test('lines as typed by a user', () => {
  const id = (typed) => findLine(typed)?.id ?? null;
  assert.equal(id('A'), 'A');
  assert.equal(id('the q train'), 'Q');
  assert.equal(id('ligne 7'), '7');
  assert.equal(id('7 express'), '7X');
  assert.equal(id('6X'), '6X');
  assert.equal(id('S 42 St'), 'GS');
  assert.equal(id('Franklin shuttle'), 'FS');
  assert.equal(id('Rockaway Park Shuttle'), 'H');
  assert.equal(id('SIR'), 'SI');
  // A bare "S" is one of three shuttles.
  assert.equal(id('S'), null);
  assert.equal(id('K'), null);
  assert.equal(id(''), null);
});

test('the feeds of some lines, each once, in a stable order', () => {
  assert.deepEqual(feedsOf(['L', 'A', 'C', 'Q', '1', 'zz']), [
    FEEDS.NUMBERED,
    FEEDS.ACE,
    FEEDS.L,
    FEEDS.NQRW,
  ]);
  assert.deepEqual(feedsOf([]), []);
});
