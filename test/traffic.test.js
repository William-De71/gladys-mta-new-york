import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  plainText,
  titleOf,
  alertState,
  messageOf,
  parseTraffic,
  messageAt,
  lineTraffic,
  seriousMessages,
  rank,
  UPCOMING_MS,
} from '../src/traffic.js';
import { decodeFeed } from '../src/gtfs-rt.js';
import { ALERTS, NOW, rawAlert } from './helpers/fixtures.js';

const HOUR = 3600 * 1000;

test('plain texts: the line symbols of the MTA spelled out', () => {
  assert.equal(
    plainText('Downtown [F][M] trains are delayed at [accessibility icon] 23 St.'),
    'Downtown F/M trains are delayed at 23 St.',
  );
  assert.equal(plainText('Take the [shuttle bus icon] free bus.'), 'Take the free bus.');
  assert.equal(plainText('<p>A</p><br>\n\n  B  C '), 'A\nB C');
  assert.equal(titleOf('First one. Second one.\nMore'), 'First one.');
  assert.equal(titleOf('x'.repeat(200)).length, 140);
});

test('the weight of an alert: its Mercury type, else its words', () => {
  assert.equal(alertState('Delays', ''), 'disrupted');
  assert.equal(alertState('Severe Delays', ''), 'disrupted');
  assert.equal(alertState('Reduced Service', ''), 'disrupted');
  assert.equal(alertState('Part Suspended', ''), 'suspended');
  assert.equal(alertState('Suspended', ''), 'suspended');
  assert.equal(alertState('Planned - Part Suspended', ''), 'planned');
  assert.equal(alertState('Planned - Stops Skipped', ''), 'planned');
  assert.equal(alertState('Station Notice', ''), 'info');
  assert.equal(alertState('Boarding Change', ''), 'info');
  assert.equal(alertState('No Scheduled Service', 'suspended'), 'info');
  assert.equal(alertState('', 'Trains are delayed'), 'disrupted');
  assert.equal(alertState('', 'Service is suspended'), 'suspended');
  assert.equal(alertState('', 'Elevator out of service'), 'info');
  assert.ok(rank('suspended') > rank('disrupted') && rank('disrupted') > rank('planned'));
});

test('the real alerts: lines, states, titles, hours', () => {
  const traffic = parseTraffic(decodeFeed(ALERTS));
  assert.equal(traffic.messages.length, 40);
  const delays = traffic.messages.find((message) => message.type === 'Delays');
  assert.deepEqual(delays.lineIds, ['F', 'M']);
  assert.equal(delays.state, 'disrupted');
  assert.match(delays.title, /^Downtown F\/M trains/);
  const planned = traffic.messages.filter((message) => message.state === 'planned');
  assert.ok(planned.length > 20);
  assert.ok(planned.some((message) => message.hours));
  // The F at the time of the fixtures: delays under way, planned work coming.
  const f = lineTraffic(traffic, 'F', NOW);
  assert.equal(f.state, 'disrupted');
  assert.equal(seriousMessages(f)[0].type, 'Delays');
  assert.ok(f.upcoming.every((message) => message.coming && message.start - NOW <= UPCOMING_MS));
});

test('an alert under way, coming or over; the state of a line', () => {
  const traffic = {
    messages: [
      messageOf(rawAlert()),
      messageOf(
        rawAlert({
          id: 'planned',
          alertType: 'Planned - Part Suspended',
          periods: [{ start: NOW / 1000 + 3600, end: NOW / 1000 + 7200 }],
        }),
      ),
      messageOf(rawAlert({ id: 'notice', alertType: 'Station Notice', periods: [] })),
      messageOf(rawAlert({ id: 'K', routeIds: ['K'] })),
    ],
  };
  assert.deepEqual(traffic.messages[3].lineIds, []);
  const l = lineTraffic(traffic, 'L', NOW);
  assert.equal(l.state, 'disrupted');
  assert.deepEqual(
    l.messages.map((m) => m.id),
    ['test-L', 'notice'],
  );
  assert.deepEqual(
    l.upcoming.map((m) => m.id),
    ['planned'],
  );
  assert.equal(l.since, NOW - HOUR);
  assert.equal(messageAt(traffic.messages[0], NOW + 4 * HOUR), null);
  assert.equal(lineTraffic(traffic, 'A', NOW).state, 'normal');
  assert.equal(lineTraffic(null, 'A', NOW).state, 'unknown');
});
