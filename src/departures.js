// -----------------------------------------------------------------------------
// The departures of a station, from the GTFS-RT trip updates of the subway
// alone (no timetable: the feeds of the MTA list every train of the coming
// hour or so, each with all its stops to come):
//
//   - a trip update calling at a platform of the station ("127N", "127S":
//     the GTFS stop id of the station and its side, N uptown / S downtown)
//     gives a departure: its time (`departure`, else `arrival`, Unix
//     seconds), its line, its side;
//   - its destination is its last stop (the feeds always run to the
//     terminus); a train whose last stop is the station ends there and is
//     not a departure;
//   - a trip the MTA has not put a train on yet ("is_assigned" false, the
//     NYCT extension) is still listed, as on the countdown clocks, but
//     marked as scheduled: it may not run;
//   - no delay: the L alone sends one, against a timetable the integration
//     does not read (the countdown clocks show none either).
// A direction typed by the user keeps one side ("uptown", "N", "Queens":
// the words the MTA writes on the side) or the destinations holding words
// ("Far Rockaway | Lefferts").
// -----------------------------------------------------------------------------

import { fold } from './text.js';
import { lineById } from './lines.js';
import { sideLabel } from './stations.js';

// A departure gone this long is dropped.
const GONE_MS = 30 * 1000;
const MAX_PER_ROUTE = 8;
const NORTH_WORDS = new Set(['n', 'north', 'northbound', 'uptown', 'nord', 'norden']);
const SOUTH_WORDS = new Set(['s', 'south', 'southbound', 'downtown', 'sud', 'suden', 'sur']);

/**
 * @description Read a typed direction.
 * @param {string} direction - "Uptown", "S", "Far Rockaway | Lefferts".
 * @returns {Array<{ side: string }|{ words: string }>} The alternatives: a
 * side ("N" / "S") or folded words.
 * @example
 * directionTerms('uptown'); // -> [{ side: 'N' }]
 */
function directionTerms(direction) {
  return String(direction ?? '')
    .split('|')
    .map(fold)
    .filter(Boolean)
    .map((words) => {
      if (NORTH_WORDS.has(words)) {
        return { side: 'N' };
      }
      return SOUTH_WORDS.has(words) ? { side: 'S' } : { words };
    });
}

/**
 * @description Whether a departure goes the way typed.
 * @param {object} passage - The departure (`side`, `sideLabel`, `destination`).
 * @param {object[]} terms - directionTerms().
 * @returns {boolean} True when no direction is typed, or one matches.
 */
function goesTo(passage, terms) {
  if (terms.length === 0) {
    return true;
  }
  return terms.some((term) =>
    term.side
      ? passage.side === term.side
      : fold(passage.sideLabel).includes(term.words) ||
        fold(passage.destination).includes(term.words),
  );
}

/**
 * @description The departures of a station, soonest first.
 * @param {object} options - Options.
 * @param {object[]} options.feeds - decodeFeed() of the trip updates read.
 * @param {object} options.station - The station (stations.js).
 * @param {number} options.now - Now (ms).
 * @param {string} [options.lineId] - Only this line.
 * @param {string} [options.direction] - Only this side or these destinations.
 * @param {Function} [options.stationOf] - `(stop id) => station`: the names
 * of the destinations.
 * @returns {object[]} `{ lineId, line, destination, side, sideLabel, at,
 * assigned, trip, train, platform }`.
 */
function buildPassages({
  feeds,
  station,
  now,
  lineId = '',
  direction = '',
  stationOf = () => null,
}) {
  const ids = new Set(station.ids);
  const terms = directionTerms(direction);
  const seen = new Set();
  const passages = [];
  for (const feed of feeds ?? []) {
    for (const update of feed?.tripUpdates ?? []) {
      if (!update.tripId || (lineId && update.routeId !== lineId)) {
        continue;
      }
      const last = update.stops.at(-1);
      update.stops.forEach((stop, index) => {
        if (!ids.has(stop.stopId.slice(0, -1)) || stop === last || stop.skipped) {
          return;
        }
        const time = stop.departure?.time || stop.arrival?.time;
        if (!Number.isFinite(time) || time * 1000 < now - GONE_MS) {
          return;
        }
        const trip = `${update.tripId}@${update.startDate}`;
        // A feed read twice, or a trip listed in two feeds.
        if (seen.has(`${trip}|${stop.stopId}`)) {
          return;
        }
        seen.add(`${trip}|${stop.stopId}`);
        const terminus = stationOf(last.stopId);
        const destination =
          terminus?.platforms[last.stopId.slice(0, -1)]?.name ?? terminus?.name ?? last.stopId;
        const passage = {
          lineId: update.routeId,
          line: lineById(update.routeId)?.name ?? update.routeId,
          destination,
          side: stop.stopId.slice(-1),
          sideLabel: sideLabel(station, stop.stopId),
          at: time * 1000,
          assigned: update.assigned === true,
          trip,
          train: update.trainId,
          platform: stop.stopId,
          sequence: index,
        };
        if (goesTo(passage, terms)) {
          passages.push(passage);
        }
      });
    }
  }
  passages.sort((a, b) => a.at - b.at);
  const kept = [];
  const counts = new Map();
  for (const passage of passages) {
    const route = routeOf(passage);
    const count = counts.get(route) ?? 0;
    if (count < MAX_PER_ROUTE) {
      counts.set(route, count + 1);
      kept.push(passage);
    }
  }
  return kept;
}

/**
 * @description The minutes left before a departure.
 * @param {object} passage - The departure.
 * @param {number} now - Now (ms).
 * @returns {number} Whole minutes (rounded down, like the countdown clocks).
 */
function minutesLeft(passage, now) {
  return Math.max(0, Math.floor((passage.at - now) / 60000));
}

/**
 * @description The departures not gone yet.
 * @param {object[]} passages - The departures.
 * @param {number} now - Now (ms).
 * @returns {object[]} The departures to come.
 */
const upcomingPassages = (passages, now) =>
  passages.filter((passage) => passage.at > now - GONE_MS);

/**
 * @description Who a departure is, across readings: line, side, destination.
 * @param {object} passage - The departure.
 * @returns {string} "A|S|far rockaway mott av".
 */
const routeOf = (passage) => `${passage.lineId}|${passage.side}|${fold(passage.destination)}`;

export { GONE_MS, directionTerms, goesTo, buildPassages, minutesLeft, upcomingPassages, routeOf };
