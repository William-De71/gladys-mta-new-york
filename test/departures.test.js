import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  directionTerms,
  goesTo,
  buildPassages,
  minutesLeft,
  upcomingPassages,
  routeOf,
} from '../src/departures.js';
import { decodeFeed } from '../src/gtfs-rt.js';
import { findStation } from '../src/stations.js';
import {
  NOW,
  STATIONS,
  encodeFeed,
  passage,
  fixturePassages,
  stationOf,
} from './helpers/fixtures.js';

const MINUTE = 60 * 1000;
const at = (minutes) => (NOW + minutes * MINUTE) / 1000;

test('directions: a side, or words of the side or of the destination', () => {
  assert.deepEqual(directionTerms('Uptown'), [{ side: 'N' }]);
  assert.deepEqual(directionTerms('downtown | S'), [{ side: 'S' }, { side: 'S' }]);
  assert.deepEqual(directionTerms('Far Rockaway'), [{ words: 'far rockaway' }]);
  assert.deepEqual(directionTerms(''), []);
  const train = passage({ side: 'N' });
  assert.equal(goesTo(train, directionTerms('uptown')), true);
  assert.equal(goesTo(train, directionTerms('south')), false);
  assert.equal(goesTo(passage(), directionTerms('rockaway')), true);
  assert.equal(goesTo(passage(), []), true);
});

test('the real departures of Times Sq-42 St, every line', () => {
  const passages = fixturePassages('Times Sq-42 St');
  assert.ok(passages.length > 40);
  const times = findStation(STATIONS, 'Times Sq-42 St');
  assert.ok(passages.every((p) => times.ids.includes(p.platform.slice(0, -1))));
  assert.deepEqual(
    passages.map((p) => p.at),
    [...passages.map((p) => p.at)].sort((a, b) => a - b),
  );
  // The shuttle goes to Grand Central; its trains ending here are no departures.
  const shuttle = passages.filter((p) => p.lineId === 'GS');
  assert.ok(shuttle.length > 0);
  assert.ok(shuttle.every((p) => p.destination === 'Grand Central-42 St'));
  assert.ok(passages.every((p) => !times.names.includes(p.destination)));
  // A destination is a station name, a side has its words.
  assert.ok(passages.some((p) => p.destination === 'Inwood-207 St'));
  assert.ok(passages.every((p) => ['N', 'S'].includes(p.side) && p.sideLabel));
  // At most eight per route.
  const counts = new Map();
  passages.forEach((p) => counts.set(routeOf(p), (counts.get(routeOf(p)) ?? 0) + 1));
  assert.ok([...counts.values()].every((count) => count <= 8));
});

test('a line and a side: the A uptown at Times Sq, the L to Manhattan at Bedford Av', () => {
  const uptown = fixturePassages('Times Sq-42 St', { lineId: 'A', direction: 'Uptown' });
  assert.ok(uptown.length > 0);
  assert.ok(uptown.every((p) => p.lineId === 'A' && p.side === 'N' && p.sideLabel === 'Uptown'));
  const bedford = fixturePassages('Bedford Av', { direction: 'Manhattan' });
  assert.ok(bedford.length > 0);
  assert.ok(bedford.every((p) => p.lineId === 'L' && p.side === 'N' && p.destination === '8 Av'));
  // The L feed marks the trips no train is put on yet.
  assert.ok(fixturePassages('Bedford Av').some((p) => !p.assigned));
});

test('written trips: end of the trip, gone, skipped, one trip in two feeds', () => {
  const station = findStation(STATIONS, 'Bedford Av');
  const feed = decodeFeed(
    encodeFeed({
      tripUpdates: [
        {
          tripId: 'T1',
          routeId: 'L',
          stops: [
            { stopId: 'L08N', time: at(4) },
            { stopId: 'L06N', time: at(8) },
            { stopId: 'L01N', time: at(15), departure: false },
          ],
        },
        // Ends at Bedford Av: no departure.
        { tripId: 'T2', routeId: 'L', stops: [{ stopId: 'L08S', time: at(2) }] },
        // Gone.
        {
          tripId: 'T3',
          routeId: 'L',
          stops: [
            { stopId: 'L08S', time: at(-2) },
            { stopId: 'L10S', time: at(3) },
          ],
        },
        // Not put on a train yet.
        {
          tripId: 'T4',
          routeId: 'L',
          assigned: false,
          stops: [
            { stopId: 'L08S', time: at(12) },
            { stopId: 'L29S', time: at(40) },
          ],
        },
      ],
    }),
  );
  const passages = buildPassages({ feeds: [feed, feed], station, now: NOW, stationOf });
  assert.deepEqual(
    passages.map((p) => [p.trip, p.destination, minutesLeft(p, NOW), p.assigned]),
    [
      ['T1@20261028', '8 Av', 4, true],
      ['T4@20261028', 'Canarsie-Rockaway Pkwy', 12, false],
    ],
  );
  // Another line: nothing.
  assert.deepEqual(buildPassages({ feeds: [feed], station, now: NOW, lineId: 'A', stationOf }), []);
  assert.deepEqual(buildPassages({ feeds: [], station, now: NOW, stationOf }), []);
});

test('waits rounded down, departures to come, who a route is', () => {
  assert.equal(minutesLeft(passage({ minutes: 4.9 }), NOW), 4);
  assert.equal(minutesLeft(passage({ minutes: -0.2 }), NOW), 0);
  const list = [passage({ minutes: -1 }), passage({ minutes: -0.2 }), passage({ minutes: 3 })];
  assert.equal(upcomingPassages(list, NOW).length, 2);
  assert.equal(routeOf(passage()), 'A|S|far rockaway mott av');
});
