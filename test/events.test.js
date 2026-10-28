// Scene triggers fire once per transition, with flat payloads within the
// limits of the core; scene actions return their declared outputs only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  detectReminders,
  detectLineChanges,
  reminderData,
  lineEvent,
  nextDeparturesOutputs,
  lineStatusOutputs,
  pick,
  tolerance,
  TRIGGERS,
  REMINDER_MINUTES,
  NEXT_DEPARTURES_OUTPUTS,
  LINE_STATUS_OUTPUTS,
} from '../src/events.js';
import { parseTraffic, lineTraffic } from '../src/traffic.js';
import { lineById } from '../src/lines.js';
import { LANGUAGES } from '../src/i18n.js';
import { NOW, passage, rawAlert } from './helpers/fixtures.js';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const FOLLOWED = {
  name: 'Times Sq-42 St (A → Downtown)',
  deviceId: 'ext:mta-new-york:station:611_a_downtown',
  station: { id: '611', label: 'Times Sq-42 St' },
};
const L = { ...lineById('L'), deviceId: 'ext:mta-new-york:line:l' };
const GS = { ...lineById('GS'), deviceId: 'ext:mta-new-york:line:gs' };
const MINUTE = 60 * 1000;
const disrupted = (alerts = [rawAlert()]) => parseTraffic({ alerts });
const normal = parseTraffic({ alerts: [] });

/**
 * @description Assert that event data is flat and within the limits of the core.
 * @param {object} data - The data.
 * @param {string} key - The trigger key.
 */
function assertPayload(data, key) {
  const trigger = manifest.scene_triggers.find((entry) => entry.key === key);
  assert.ok(trigger, key);
  assert.ok(Object.keys(data).length <= 30);
  for (const [name, value] of Object.entries(data)) {
    assert.ok(
      value === null || ['string', 'number', 'boolean'].includes(typeof value),
      `${key}.${name}`,
    );
    if (typeof value === 'string') {
      assert.ok(value.length <= 1000, `${key}.${name}`);
    }
  }
  // Every variable is in the data, with its declared type; every field
  // filters a key of it.
  for (const variable of trigger.variables) {
    assert.ok(variable.key in data, `${key}: variable ${variable.key}`);
    assert.equal(typeof data[variable.key], variable.type, `${key}: type of ${variable.key}`);
  }
  for (const field of trigger.fields) {
    assert.ok(field.key in data, `${key}: field ${field.key}`);
  }
}

test('reminders: once per train and mark, never on the first reading', () => {
  const passages = [passage({ minutes: 4 + 40 / 60, trip: 'T1@20261028' })];
  // First reading of the station: a baseline.
  const first = detectReminders({ passages, fired: undefined, now: NOW });
  assert.deepEqual(first.due, []);
  assert.equal(first.fired.length, 1);
  // 4 min 40 s before: the 5-minute mark, once.
  const memory = detectReminders({ passages, fired: [], now: NOW });
  assert.deepEqual(
    memory.due.map((entry) => entry.mark),
    [5],
  );
  const again = detectReminders({ passages, fired: memory.fired, now: NOW + 10000 });
  assert.deepEqual(again.due, []);
  // The same trip announced a little later is the same train: no new 5.
  const later = [passage({ minutes: 4.9, trip: 'T1@20261028' })];
  assert.deepEqual(detectReminders({ passages: later, fired: memory.fired, now: NOW }).due, []);
  // Old reminders are forgotten.
  const forgotten = detectReminders({ passages: [], fired: memory.fired, now: NOW + 20 * MINUTE });
  assert.deepEqual(forgotten.fired, []);
  assert.deepEqual(REMINDER_MINUTES.map(tolerance), [1, 1, 1.5, 3, 3, 3]);
});

test('train soon: a flat payload, its summary in every language', () => {
  const train = passage({ minutes: 5 });
  for (const language of LANGUAGES) {
    const data = reminderData(FOLLOWED, train, 5, { language });
    assertPayload(data, TRIGGERS.DEPARTURE_SOON);
    assert.equal(data.minutes, '5');
    assert.equal(data.time, '10:43');
    assert.equal(data.direction, 'Downtown');
    assert.equal(data.scheduled, false);
  }
  assert.equal(
    reminderData(FOLLOWED, train, 5, { language: 'en' }).summary,
    'A train to Far Rockaway-Mott Av leaves Times Sq-42 St in 5 min (10:43).',
  );
  assert.equal(
    reminderData(FOLLOWED, passage({ assigned: false }), 5, { language: 'fr' }).scheduled,
    true,
  );
});

test('line changes: disrupted, a new alert, back to good service', () => {
  // First reading of the line: a baseline, even disrupted.
  const first = detectLineChanges({ lines: [L, GS], traffic: disrupted(), seen: {}, now: NOW });
  assert.deepEqual(first.changes, []);
  assert.equal(first.seen.L.state, 'disrupted');
  // From good service to delays: the disruption and its alert.
  const before = detectLineChanges({ lines: [L], traffic: normal, seen: {}, now: NOW - MINUTE });
  const now = detectLineChanges({ lines: [L], traffic: disrupted(), seen: before.seen, now: NOW });
  assert.deepEqual(
    now.changes.map((change) => [change.key, change.message?.state]),
    [
      [TRIGGERS.LINE_DISRUPTED, 'disrupted'],
      [TRIGGERS.SERVICE_ALERT, 'disrupted'],
    ],
  );
  // The same reading again: nothing.
  const same = detectLineChanges({ lines: [L], traffic: disrupted(), seen: now.seen, now: NOW });
  assert.deepEqual(same.changes, []);
  // Planned work coming is a new alert, not a disruption.
  const coming = detectLineChanges({
    lines: [L],
    traffic: disrupted([
      rawAlert(),
      rawAlert({
        id: 'SOON',
        header: 'No [L] trains between Broadway Junction and Canarsie.',
        alertType: 'Planned - Part Suspended',
        hours: 'Oct 31 - Nov 1, Sat 12:01 AM to Mon 5:00 AM',
        periods: [{ start: NOW / 1000 + 2 * 86400, end: NOW / 1000 + 2 * 86400 + 4 * 3600 }],
      }),
    ]),
    seen: same.seen,
    now: NOW,
  });
  assert.deepEqual(
    coming.changes.map((change) => [change.key, change.message.id, change.message.state]),
    [[TRIGGERS.SERVICE_ALERT, 'SOON', 'planned']],
  );
  // Back to good service.
  const over = detectLineChanges({ lines: [L], traffic: normal, seen: coming.seen, now: NOW });
  assert.deepEqual(
    over.changes.map((change) => [change.key, change.traffic.state]),
    [[TRIGGERS.LINE_RESTORED, 'normal']],
  );
  // Planned work under way is no disruption: nothing fires but its alert.
  const work = detectLineChanges({
    lines: [L],
    traffic: disrupted([rawAlert({ id: 'W', alertType: 'Planned - Stops Skipped' })]),
    seen: over.seen,
    now: NOW,
  });
  assert.deepEqual(
    work.changes.map((change) => change.key),
    [TRIGGERS.SERVICE_ALERT],
  );
});

test('line events: flat payloads, summaries in every language', () => {
  const traffic = lineTraffic(disrupted(), 'L', NOW);
  const [message] = traffic.messages;
  for (const language of LANGUAGES) {
    const event = lineEvent(
      { key: TRIGGERS.LINE_DISRUPTED, line: L, traffic, message },
      { language },
    );
    assertPayload(event.data, TRIGGERS.LINE_DISRUPTED);
    const fresh = lineEvent(
      { key: TRIGGERS.SERVICE_ALERT, line: L, traffic, message },
      { language },
    );
    assertPayload(fresh.data, TRIGGERS.SERVICE_ALERT);
    const restored = lineEvent(
      { key: TRIGGERS.LINE_RESTORED, line: GS, traffic: lineTraffic(normal, 'GS', NOW) },
      { language },
    );
    assertPayload(restored.data, TRIGGERS.LINE_RESTORED);
  }
  const fresh = lineEvent(
    { key: TRIGGERS.SERVICE_ALERT, line: L, traffic, message },
    { language: 'en' },
  );
  assert.deepEqual(
    [
      fresh.data.line,
      fresh.data.line_name,
      fresh.data.kind,
      fresh.data.alert_type,
      fresh.data.start,
      fresh.data.end,
    ],
    ['ext:mta-new-york:line:l', 'L train', 'disrupted', 'Delays', '10/28 09:38', '10/28 13:38'],
  );
  assert.equal(
    fresh.data.summary,
    'L train, delays: L trains are running with delays in both directions after we addressed a signal problem at Bedford Av.',
  );
  const event = lineEvent(
    { key: TRIGGERS.LINE_DISRUPTED, line: L, traffic, message },
    { language: 'fr' },
  );
  assert.match(event.data.summary, /^Ligne L : Service perturbé \(L trains are running/);
  const restored = lineEvent(
    { key: TRIGGERS.LINE_RESTORED, line: GS, traffic: lineTraffic(normal, 'GS', NOW) },
    { language: 'en' },
  );
  assert.equal(
    restored.data.summary,
    '42 St Shuttle: no more delays nor suspension (Good service).',
  );
});

test('scene action outputs: declared keys only, flat values', () => {
  const declared = (key) =>
    manifest.scene_actions.find((action) => action.key === key).outputs.map((output) => output.key);
  assert.deepEqual(NEXT_DEPARTURES_OUTPUTS, declared('get_next_departures'));
  assert.deepEqual(LINE_STATUS_OUTPUTS, declared('get_line_status'));
  const passages = [passage({ minutes: 7 }), passage({ minutes: 20, assigned: false })];
  const next = pick(
    nextDeparturesOutputs({ followed: FOLLOWED, passages, now: NOW, language: 'en' }),
    NEXT_DEPARTURES_OUTPUTS,
  );
  assert.deepEqual(
    [next.found, next.line, next.minutes, next.time, next.scheduled, next.following_minutes],
    [true, 'A', 7, '10:45', false, 20],
  );
  assert.equal(
    next.summary,
    'Next train at Times Sq-42 St: A to Far Rockaway-Mott Av in 7 min. The following one in 20 min.',
  );
  const none = nextDeparturesOutputs({
    followed: FOLLOWED,
    passages: [],
    now: NOW,
    language: 'en',
  });
  assert.deepEqual([none.found, none.minutes, none.time, none.scheduled], [false, -1, '', false]);
  assert.equal(none.summary, 'No train announced at Times Sq-42 St.');
  const status = lineStatusOutputs({
    line: L,
    traffic: lineTraffic(disrupted(), 'L', NOW),
    language: 'fr',
  });
  assert.deepEqual(
    [status.line_name, status.state, status.disrupted, status.alert_count, status.state_label],
    ['Ligne L', 'disrupted', true, 1, 'Service perturbé'],
  );
  const declaredTypes = (key) =>
    Object.fromEntries(
      manifest.scene_actions
        .find((action) => action.key === key)
        .outputs.map((output) => [output.key, output.type]),
    );
  for (const [outputs, key] of [
    [next, 'get_next_departures'],
    [status, 'get_line_status'],
  ]) {
    for (const [name, type] of Object.entries(declaredTypes(key))) {
      assert.equal(typeof outputs[name], type, `${key}.${name}`);
    }
  }
});
