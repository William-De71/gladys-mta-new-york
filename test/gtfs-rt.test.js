import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decodeFeed, readVarint } from '../src/gtfs-rt.js';
import { FEEDS, ALERTS, NOW, encodeFeed, varint } from './helpers/fixtures.js';

test('varints, negative ones on 64 bits', () => {
  assert.deepEqual(readVarint(varint(300), 0), [300n, 2]);
  assert.equal(BigInt.asIntN(64, readVarint(varint(-44), 0)[0]), -44n);
  assert.throws(() => readVarint(Buffer.from([0x80]), 0), { kind: 'invalid' });
});

test('the real trip updates of the L: trips, platforms, the NYCT extension', () => {
  const feed = decodeFeed(FEEDS['nyct/gtfs-l']);
  // Each feed carries its own time, within a minute of the others.
  assert.ok(Math.abs(feed.timestamp * 1000 - NOW) < 60 * 1000);
  assert.equal(feed.tripUpdates.length, 27);
  const [first] = feed.tripUpdates;
  assert.equal(first.routeId, 'L');
  assert.equal(first.startDate, '20261028');
  assert.ok(first.stops.every((stop) => /^L\d\d[NS]$/.test(stop.stopId)));
  // The L feed tells the direction and whether a train is put on the trip.
  assert.ok(feed.tripUpdates.every((update) => ['N', 'S'].includes(update.direction)));
  assert.ok(feed.tripUpdates.some((update) => update.assigned === true));
  assert.ok(feed.tripUpdates.some((update) => update.assigned === false));
  assert.match(first.trainId, /^0L /);
  // Unix times; the L alone also sends a delay (seconds), not used.
  const stop = first.stops[0];
  assert.ok(Math.abs((stop.arrival ?? stop.departure).time * 1000 - NOW) < 3 * 3600 * 1000);
  assert.equal(typeof stop.arrival.delay, 'number');
  const numbered = decodeFeed(FEEDS['nyct/gtfs']).tripUpdates.flatMap((update) => update.stops);
  assert.ok(numbered.every((s) => (s.arrival ?? s.departure).delay === null));
});

test('the real alerts of the subway: lines, periods, Mercury type and hours', () => {
  const feed = decodeFeed(ALERTS);
  assert.equal(feed.alerts.length, 40);
  const delays = feed.alerts.find((alert) => alert.alertType === 'Delays');
  assert.deepEqual(delays.routeIds, ['F', 'M']);
  // The plain English text, not its HTML copy.
  assert.match(delays.header, /^Downtown \[F\]\[M\] trains/);
  assert.doesNotMatch(delays.header, /<p>/);
  const planned = feed.alerts.find((alert) => alert.alertType.startsWith('Planned'));
  assert.ok(planned.hours.length > 5);
  assert.ok(planned.periods.length > 0);
  // A route named once per direction or station is kept once.
  assert.ok(feed.alerts.every((alert) => new Set(alert.routeIds).size === alert.routeIds.length));
});

test('written feeds: assignment, direction, Mercury fields; garbage refused', () => {
  const feed = decodeFeed(
    encodeFeed({
      tripUpdates: [
        {
          tripId: '060000_A..S',
          routeId: 'A',
          assigned: false,
          direction: 3,
          stops: [{ stopId: 'A27S', time: NOW / 1000 + 60 }],
        },
      ],
      alerts: [{ id: 'a', routeIds: ['A', 'A'], header: 'x', alertType: 'Delays', hours: 'Fri' }],
    }),
  );
  const [update] = feed.tripUpdates;
  assert.deepEqual([update.assigned, update.direction], [false, 'S']);
  assert.deepEqual(update.stops[0].departure, { delay: null, time: NOW / 1000 + 60 });
  assert.deepEqual(
    [
      feed.alerts[0].routeIds,
      feed.alerts[0].alertType,
      feed.alerts[0].hours,
      feed.alerts[0].header,
    ],
    [['A'], 'Delays', 'Fri', 'x'],
  );
  assert.throws(() => decodeFeed(Buffer.from('<html>Bad Gateway</html>')), { kind: 'invalid' });
  assert.throws(() => decodeFeed(Buffer.alloc(0)), { kind: 'invalid' });
});
