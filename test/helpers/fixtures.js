// A fake MTA for the tests, served through the `fetch` option of the
// integration. Its answers are real ones, read on 2026-10-28 at 10:38 in New
// York (14:38 UTC): the GTFS-RT feeds of the 1 2 3 4 5 6 7 / GS, A C E H, L
// and N Q R W, reduced to the trips calling at Times Sq-42 St, 1 Av and
// Bedford Av, and 40 alerts of the subway about the A, L, 7, F, Q, 1 and the
// 42 St Shuttle. The list of the stations is the copy shipped in the image.
// Open data of the MTA. Tests never touch the network: feeds of other moments
// are written by `encodeFeed()`.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeFeed } from '../../src/gtfs-rt.js';
import { buildStations, parseCsv, findStation, BUNDLED_PATH } from '../../src/stations.js';
import { buildPassages } from '../../src/departures.js';

const FIXTURES = new URL('../fixtures/', import.meta.url);
// The time of the feeds of the fixture: 2026-10-28 10:38:20 in New York.
const NOW = 1793198300 * 1000;

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary path for the file kept in /data.
 * @returns {string} The path (its directory exists, the file does not).
 */
const storePath = () => join(mkdtempSync(join(tmpdir(), 'mta-new-york-')), 'mta-new-york.json');

const STATIONS_CSV = readFileSync(BUNDLED_PATH, 'utf8');
const STATIONS = buildStations(parseCsv(STATIONS_CSV));
const BY_STOP = new Map(STATIONS.flatMap((station) => station.ids.map((id) => [id, station])));

/**
 * @description The station of a stop id, as createStations().byStopId.
 * @param {string} stopId - "127" or "127N".
 * @returns {object|null} The station.
 */
const stationOf = (stopId) =>
  BY_STOP.get(stopId) ?? BY_STOP.get(String(stopId).slice(0, -1)) ?? null;

// --- Protocol Buffers -----------------------------------------------------------------

/**
 * @description A varint.
 * @param {number|bigint} value - The value (negative: 64-bit two's complement).
 * @returns {Buffer} The bytes.
 */
function varint(value) {
  let rest = BigInt.asUintN(64, BigInt(value));
  const bytes = [];
  do {
    let byte = Number(rest & 0x7fn);
    rest >>= 7n;
    if (rest > 0n) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (rest > 0n);
  return Buffer.from(bytes);
}

const tag = (field, wire) => varint(field * 8 + wire);
const num = (field, value) =>
  value === undefined || value === null ? [] : [tag(field, 0), varint(value)];
const len = (field, bytes) => {
  if (bytes === undefined || bytes === null) {
    return [];
  }
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), 'utf8');
  return [tag(field, 2), varint(data.length), data];
};
const msg = (parts) => Buffer.concat(parts.flat());
// The MTA writes each text twice: plain, and in HTML.
const translated = (text) =>
  text === undefined
    ? null
    : msg([
        len(1, msg([len(1, `<p>${text}</p>`), len(2, 'en-html')])),
        len(1, msg([len(1, text), len(2, 'en')])),
      ]);

/**
 * @description A GTFS-RT feed, written like the MTA writes it.
 * @param {object} feed - `{ timestamp (s), tripUpdates: [{ tripId, routeId,
 * startDate, trainId, assigned, direction (1 N, 3 S), stops: [{ stopId,
 * time, departure }] }], alerts: [{ id, periods: [{ start, end }],
 * routeIds, header, description, alertType, hours }] }`.
 * @returns {Buffer} The FeedMessage.
 */
function encodeFeed({ timestamp = NOW / 1000, tripUpdates = [], alerts = [] } = {}) {
  const header = msg([len(1, '1.0'), num(2, 0), num(3, timestamp)]);
  const entities = [
    ...tripUpdates.map((update, index) => {
      const nyct = msg([
        len(1, update.trainId ?? `0${update.routeId} 0930 TST/TST`),
        update.assigned === false ? [] : num(2, 1),
        num(3, update.direction),
      ]);
      const trip = msg([
        len(1, update.tripId),
        len(3, update.startDate ?? '20261028'),
        len(5, update.routeId),
        len(1001, nyct),
      ]);
      const stops = (update.stops ?? []).map((stop) => {
        const event = msg([num(2, stop.time)]);
        return len(
          2,
          msg([len(2, event), stop.departure === false ? [] : len(3, event), len(4, stop.stopId)]),
        );
      });
      return len(2, msg([len(1, `tu-${index}`), len(3, msg([len(1, trip), ...stops]))]));
    }),
    ...alerts.map((alert) =>
      len(
        2,
        msg([
          len(1, alert.id),
          len(
            5,
            msg([
              ...(alert.periods ?? []).map((period) =>
                len(1, msg([num(1, period.start), num(2, period.end)])),
              ),
              ...(alert.routeIds ?? []).map((routeId) =>
                len(5, msg([len(1, 'MTASBWY'), len(2, routeId)])),
              ),
              len(10, translated(alert.header)),
              len(11, translated(alert.description)),
              len(
                1001,
                msg([
                  num(1, alert.createdAt ?? NOW / 1000 - 600),
                  num(2, alert.updatedAt ?? NOW / 1000 - 60),
                  len(3, alert.alertType),
                  num(7, 0),
                  len(8, translated(alert.hours)),
                ]),
              ),
            ]),
          ),
        ]),
      ),
    ),
  ];
  return msg([len(1, header), ...entities]);
}

const FEED_FILES = {
  'nyct/gtfs': 'nyct-gtfs.pb',
  'nyct/gtfs-ace': 'nyct-gtfs-ace.pb',
  'nyct/gtfs-l': 'nyct-gtfs-l.pb',
  'nyct/gtfs-nqrw': 'nyct-gtfs-nqrw.pb',
};
const FEEDS = Object.fromEntries(
  Object.entries(FEED_FILES).map(([path, file]) => [path, readFileSync(new URL(file, FIXTURES))]),
);
const ALERTS = readFileSync(new URL('alerts.pb', FIXTURES));

/**
 * @description An alert about the L under way at the time of the fixtures.
 * @param {object} [fields] - What differs.
 * @returns {object} The alert, for encodeFeed().
 */
const alertL = (fields = {}) => ({
  id: 'test-L',
  periods: [{ start: NOW / 1000 - 3600, end: NOW / 1000 + 3 * 3600 }],
  routeIds: ['L'],
  header:
    '[L] trains are running with delays in both directions after we addressed a signal problem at [accessibility icon] Bedford Av.',
  description: 'Expect longer waits.',
  alertType: 'Delays',
  ...fields,
});

/**
 * @description An alert as decodeFeed() reads it.
 * @param {object} [fields] - What differs from alertL().
 * @returns {object} The alert.
 */
const rawAlert = (fields = {}) => ({
  cause: null,
  effect: null,
  severity: null,
  url: '',
  stopIds: [],
  hours: '',
  createdAt: null,
  updatedAt: null,
  displayBefore: 0,
  ...alertL(),
  ...fields,
});

/**
 * @description A departure, as buildPassages() writes it.
 * @param {object} [fields] - What differs from an A train to Far Rockaway in
 * 5 minutes from NOW, on a train put on the trip. `minutes` from NOW.
 * @returns {object} The departure.
 */
function passage({
  minutes = 5,
  line = 'A',
  destination = 'Far Rockaway-Mott Av',
  side = 'S',
  assigned = true,
  trip,
} = {}) {
  return {
    lineId: line,
    line,
    destination,
    side,
    sideLabel: side === 'N' ? 'Uptown' : 'Downtown',
    at: NOW + minutes * 60000,
    assigned,
    trip: trip ?? `${line}-${minutes}@20261028`,
    train: `1${line} 0930 TST/TST`,
    platform: `A27${side}`,
    sequence: 10,
  };
}

/**
 * @description The departures of a station of the fixtures, at the time of
 * the fixtures.
 * @param {string} name - The station as typed ("Times Sq-42 St").
 * @param {object} [filter] - `{ lineId, direction }`.
 * @returns {object[]} The departures.
 */
function fixturePassages(name, { lineId = '', direction = '' } = {}) {
  const station = findStation(STATIONS, name, lineId);
  return buildPassages({
    feeds: Object.values(FEEDS).map((bytes) => decodeFeed(bytes)),
    station,
    now: NOW,
    lineId,
    direction,
    stationOf,
  });
}

/**
 * @description The fake MTA.
 * @returns {Function} A fetch function, with `.calls` and `.state`.
 */
function fakeMta() {
  const state = {
    feeds: { ...FEEDS },
    alerts: ALERTS,
    stations: STATIONS_CSV,
    // 'network', or an HTTP status, for every request; `failFeeds` for the
    // trip updates alone.
    fail: null,
    failFeeds: null,
  };
  const calls = [];

  /**
   * @description The fetch function.
   * @param {string} url - The URL.
   * @returns {Promise<Response>} The answer.
   */
  async function fetchFn(url) {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname.replace(/^\/feeds\//, ''));
    calls.push(path);
    if (state.fail === 'network') {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }
    if (typeof state.fail === 'number') {
      return new Response('Service Unavailable', { status: state.fail });
    }
    const binary = (body) =>
      new Response(body, { status: 200, headers: { 'content-type': 'application/x-protobuf' } });
    if (path === '/stations.csv') {
      return new Response(state.stations, { status: 200, headers: { 'content-type': 'text/csv' } });
    }
    if (path === 'camsys/subway-alerts') {
      return binary(state.alerts);
    }
    if (path.startsWith('nyct/')) {
      if (state.failFeeds) {
        return new Response('Bad Gateway', { status: state.failFeeds });
      }
      // A feed of the fixture, else an empty feed (the B D F M…).
      return binary(state.feeds[path] ?? encodeFeed());
    }
    return new Response('Not Found', { status: 404 });
  }
  fetchFn.calls = calls;
  fetchFn.state = state;
  return fetchFn;
}

// The URLs the integration is given in the tests.
const FEEDS_URL = 'https://mta.test/feeds';
const STATIONS_URL = 'https://mta.test/stations.csv';

/**
 * @description A minimal Gladys client for the pure builders.
 */
const fakeGladys = {
  externalIds: (type, id) => ({
    device: `ext:mta-new-york:${type}:${id}`,
    feature: (key) => `ext:mta-new-york:${type}:${id}:${key}`,
  }),
};

export {
  NOW,
  FEEDS,
  ALERTS,
  STATIONS,
  STATIONS_CSV,
  FEEDS_URL,
  STATIONS_URL,
  silent,
  storePath,
  stationOf,
  varint,
  encodeFeed,
  alertL,
  rawAlert,
  passage,
  fixturePassages,
  fakeMta,
  fakeGladys,
};
