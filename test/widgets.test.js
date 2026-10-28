// The widget contents pass the validator of the SDK (what the core would
// drop or truncate), in every language.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildDeparturesWidget,
  buildTrafficWidget,
  messageContent,
  readCount,
  routeValue,
  shortDate,
  dateText,
  BOARD_COUNT,
} from '../src/widgets.js';
import { parseTraffic, lineTraffic } from '../src/traffic.js';
import { decodeFeed } from '../src/gtfs-rt.js';
import { lineById } from '../src/lines.js';
import { LANGUAGES } from '../src/i18n.js';
import { NOW, ALERTS, passage, rawAlert, fixturePassages } from './helpers/fixtures.js';

const TIMES = fixturePassages('Times Sq-42 St');
const BEDFORD = fixturePassages('Bedford Av');
const MINUTE = 60 * 1000;

/**
 * @description Assert that the core would keep the content whole.
 * @param {object} content - The content.
 * @param {string} label - For the message.
 */
function assertValid(content, label) {
  assert.deepEqual(validateWidgetContent(content), [], label);
}

test('departures widget: one compact row per route, soonest first, in every language', () => {
  for (const language of LANGUAGES) {
    const content = buildDeparturesWidget({
      title: 'Times Sq-42 St',
      passages: TIMES,
      readAt: NOW,
      count: 6,
      language,
      now: NOW,
    });
    assertValid(content, language);
    const [heading, caption, status] = content.components;
    assert.equal(heading.text, 'Times Sq-42 St');
    assert.match(caption.text, /^MTA · .*10:38/);
    assert.equal(status.items.length, 6);
  }
  const en = buildDeparturesWidget({
    title: 'Bedford Av',
    passages: BEDFORD,
    readAt: NOW,
    count: 4,
    language: 'en',
    now: NOW,
  });
  assert.deepEqual(
    en.components[2].items.map((item) => [item.label, item.value, item.color]),
    [
      ['L → 8 Av', 'Arriving · 2 · 8 · 13 · 16 · 19 min', 'success'],
      ['L → Canarsie-Rockaway Pkwy', '1 · 8 · 10 · 16 min', 'success'],
      // The next train of this route is only scheduled: grey.
      ['L → Myrtle-Wyckoff Avs', '13 min', 'neutral'],
    ],
  );
});

test('departures widget: times beyond an hour, nothing announced', () => {
  const options = { language: 'en', now: NOW };
  const late = [passage({ minutes: 5 }), passage({ minutes: 92 })];
  assert.equal(routeValue(late, options), '5 min · 12:10');
  const empty = buildDeparturesWidget({
    title: 'Broad Channel',
    passages: [],
    readAt: NOW,
    count: 6,
    language: 'de',
    now: NOW,
  });
  assertValid(empty, 'empty');
  assert.equal(empty.components[1].text, 'Kein Zug angekündigt. MTA · aktualisiert um 10:38.');
  assert.equal(empty.ttl_seconds, 300);
});

test('departures widget: several stations in one list, a row per station then its routes', () => {
  const content = buildDeparturesWidget({
    boards: [
      { title: 'Times Sq-42 St', label: 'Times Sq-42 St', passages: TIMES, readAt: NOW },
      { title: 'Broad Channel', label: 'Broad Channel', passages: [], readAt: NOW - MINUTE },
    ],
    count: 6,
    language: 'fr',
    now: NOW,
  });
  assertValid(content, 'several');
  const [heading, caption, status] = content.components;
  assert.equal(heading.text, 'Times Sq-42 St · Broad Channel');
  assert.equal(caption.text, 'MTA');
  assert.equal(status.items[0].icon, 'map-pin');
  assert.equal(status.items[0].value, 'lu à 10:38');
  assert.equal(status.items.at(-1).value, 'Aucun train annoncé');
  assert.ok(status.items.length <= 10);
});

test('service status widget: states, alerts under way and coming, in every language', () => {
  const traffic = parseTraffic(decodeFeed(ALERTS));
  const lines = ['A', 'L', '7', 'F', 'GS'].map((id) => ({
    line: lineById(id),
    traffic: lineTraffic(traffic, id, NOW),
  }));
  for (const language of LANGUAGES) {
    assertValid(buildTrafficWidget({ lines, readAt: NOW, language, now: NOW }), language);
  }
  const en = buildTrafficWidget({ lines, readAt: NOW, language: 'en', now: NOW });
  const [heading, status, cards, caption] = en.components;
  assert.equal(heading.text, 'Subway service');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value, item.color]),
    [
      ['A train', 'Delays and changes', 'warning'],
      ['L train', 'Good service', 'success'],
      ['7 train', 'Good service', 'success'],
      ['F train', 'Delays and changes', 'warning'],
      ['42 St Shuttle', 'Good service', 'success'],
    ],
  );
  // Under way, the heaviest first, then the coming ones, with the hours the
  // MTA writes.
  assert.deepEqual(
    cards.items.map((item) => [item.badge.text, item.subtitle.split(' · ')[0]]),
    [
      ['A', 'Delays'],
      ['F', 'Delays'],
      ['A', 'Coming'],
      ['A', 'Coming'],
    ],
  );
  assert.equal(cards.items[3].subtitle, 'Coming · Oct 28 - 29, Wed 10:00 PM to Thu 6:00 AM');
  assert.match(cards.items[3].title, /^JFK AirTrain/);
  assert.match(cards.items[3].description, /^Oct 28 - 29, Wed 10:00 PM to Thu 6:00 AM\n/);
  assert.equal(caption.text, 'MTA · updated at 10:38');
  // Planned work under way, a suspension; nothing to say.
  const own = parseTraffic({
    alerts: [
      rawAlert({ id: 'p', alertType: 'Planned - Stops Skipped', hours: '' }),
      rawAlert({ id: 's', routeIds: ['7'], alertType: 'Suspended' }),
    ],
  });
  const fr = buildTrafficWidget({
    lines: ['L', '7'].map((id) => ({ line: lineById(id), traffic: lineTraffic(own, id, NOW) })),
    readAt: NOW,
    language: 'fr',
    now: NOW,
  });
  assert.deepEqual(
    fr.components[1].items.map((item) => [item.label, item.value, item.color]),
    [
      ['Ligne L', 'Travaux programmés', 'primary'],
      ['Ligne 7', 'Service suspendu', 'danger'],
    ],
  );
  assert.equal(fr.components[2].items[1].subtitle, 'Travaux · 09:38 → 13:38');
  const calm = buildTrafficWidget({
    lines: [lines[1]].map(({ line }) => ({
      line,
      traffic: lineTraffic({ messages: [] }, 'L', NOW),
    })),
    readAt: NOW,
    language: 'es',
    now: NOW,
  });
  assertValid(calm, 'calm');
  assert.equal(
    calm.components[2].text,
    'Ninguna alerta para estas líneas. MTA · actualizado a las 10:38.',
  );
});

test('messages and settings; dates month first in English', () => {
  assertValid(messageContent('Hello'), 'message');
  assert.equal(readCount(undefined, BOARD_COUNT), BOARD_COUNT.default);
  assert.equal(readCount('99', BOARD_COUNT), BOARD_COUNT.max);
  assert.equal(readCount(0, BOARD_COUNT), BOARD_COUNT.min);
  const eve = Date.parse('2027-01-01T03:59:00Z');
  assert.equal(shortDate(eve, 'en'), '12/31');
  assert.equal(shortDate(eve, 'fr'), '31/12');
  assert.equal(shortDate(null, 'en'), '');
  assert.equal(dateText(NOW + 30 * MINUTE, NOW, 'en'), '11:08');
  assert.equal(dateText(NOW - 24 * 60 * MINUTE, NOW, 'de'), '27.10. 10:38');
  assert.equal(dateText(null, NOW, 'en'), '');
});
