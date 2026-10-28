// -----------------------------------------------------------------------------
// Configuration of the MTA integration.
//
// Fields of the config_schema (the open data of the MTA need no key):
//   - `station_<n>`           a followed station (`<n>` from 1 to 3): its
//                             name ("Times Sq-42 St", "86 St (Q)") or a GTFS
//                             stop id ("R16");
//   - `station_<n>_line`      only this line ("A", "7", "Q"), empty for every
//                             line;
//   - `station_<n>_direction` only this side ("Uptown", "Downtown",
//                             "Manhattan") or the destinations holding these
//                             words ("Far Rockaway | Lefferts"), empty for
//                             both sides;
//   - `lines`                 the lines whose service status is followed
//                             ("A, F, L"), six at most;
//   - `interval`              seconds between two readings of the stations;
//   - `language`              language of the texts Gladys does not ask for in
//                             a language (device names, scene summaries):
//                             `auto` follows the last widget request.
//
// Internal keys, outside the config_schema (never shown in the UI, stored by
// setConfig):
//   - `added_stations`        the stations added with the "Add a station"
//                             button, `[{ station, line, direction }]`: up to
//                             MAX_ADDED_STATIONS, next to the three of the
//                             form. Kept in the Gladys database, so they
//                             follow its backups;
//   - `last_language`         language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

const MAX_STATIONS = 3;
// A home, a workplace, a school and a few more: each station may add a feed
// to read.
const MAX_ADDED_STATIONS = 10;
const MAX_LINES = 6;
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { addedStations: 'added_stations', language: 'last_language' };
const INTERVALS = [30, 60, 120, 300];
const DEFAULT_INTERVAL = 60;

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * @description Read the reading interval.
 * @param {unknown} raw - The raw value ("60", 60).
 * @returns {number} Seconds, one of INTERVALS.
 */
function readInterval(raw) {
  const value = Number(raw);
  return INTERVALS.includes(value) ? value : DEFAULT_INTERVAL;
}

/**
 * @description Split a list of lines typed by hand.
 * @param {unknown} raw - "A, F ; L".
 * @returns {string[]} The lines, without duplicates, six at most.
 * @example
 * parseLines('A, F ; L'); // -> ['A', 'F', 'L']
 */
function parseLines(raw) {
  const seen = new Set();
  return readString(raw)
    .split(/[,;\n]+/)
    .map((entry) => entry.trim())
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (!entry || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, MAX_LINES);
}

/**
 * @description Read the stations added with the configuration buttons.
 * @param {unknown} raw - The stored value: an array (or its JSON text).
 * @returns {Array<{ station: string, line: string, direction: string }>}
 * The valid entries, MAX_ADDED_STATIONS at most.
 * @example
 * parseAddedStations([{ station: 'complex:611', line: 'A', direction: '' }]);
 */
function parseAddedStations(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return (Array.isArray(list) ? list : [])
    .filter((entry) => entry && typeof entry === 'object' && readString(entry.station))
    .map((entry) => ({
      station: readString(entry.station),
      line: readString(entry.line),
      direction: readString(entry.direction),
    }))
    .slice(0, MAX_ADDED_STATIONS);
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ stations: [{ slot, station, line, direction }],
 * addedStations, lines, interval, language }`; a slot without a station is
 * left out. `stations` holds the three slots of the form, then the added
 * stations (`slot` null, `added` their position from 1).
 * @example
 * normalizeConfig({ station_1: 'Times Sq-42 St', station_1_line: 'A' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const stations = [];
  for (let slot = 1; slot <= MAX_STATIONS; slot += 1) {
    const station = readString(config[`station_${slot}`]);
    if (station) {
      stations.push({
        slot,
        station,
        line: readString(config[`station_${slot}_line`]),
        direction: readString(config[`station_${slot}_direction`]),
      });
    }
  }
  const addedStations = parseAddedStations(config[INTERNAL_KEYS.addedStations]);
  addedStations.forEach((entry, index) =>
    stations.push({ slot: null, added: index + 1, ...entry }),
  );
  return {
    stations,
    addedStations,
    lines: parseLines(config.lines),
    interval: readInterval(config.interval),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  MAX_STATIONS,
  MAX_ADDED_STATIONS,
  MAX_LINES,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  INTERVALS,
  DEFAULT_INTERVAL,
  readInterval,
  parseLines,
  parseAddedStations,
  normalizeConfig,
  readLanguage,
};
