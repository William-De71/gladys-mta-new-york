// -----------------------------------------------------------------------------
// The stations of the subway, from the official list of the MTA: "MTA Subway
// Stations" on the open data portal of the State of New York
// (https://data.ny.gov/d/39hk-dx4f, no key, 70 KB):
//
//   - a row per station of a line: its GTFS stop id ("127"; the platforms of
//     the real time add "N" or "S": "127N"), its complex id, its name, its
//     borough, the lines stopping there in the daytime and the words the
//     MTA writes on each side ("Uptown & The Bronx", "Downtown & Brooklyn");
//   - the stations of one complex (the same id) are one station here: Times
//     Sq-42 St gathers the 1 2 3, the 7, the N Q R W, the shuttle and the A C
//     E of 42 St-Port Authority. The complex id is the key of a station;
//   - a name serves several stations ("86 St" on six lines): such a station
//     is labelled with its lines, "86 St (Q)", and typed so, with a line,
//     or by a GTFS stop id ("R44").
//
// A copy of the list ships in the image (src/data/stations.csv); a fresher
// one is asked once a week and kept in /data. Names are compared folded.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fold } from './text.js';
import { lineById, byLine } from './lines.js';

const BUNDLED_PATH = new URL('./data/stations.csv', import.meta.url);
const REFRESH_MS = 7 * 24 * 3600 * 1000;
// The list holds 445 complexes: far fewer means a broken answer.
const MIN_STATIONS = 300;
const BOROUGHS = {
  M: 'Manhattan',
  Bk: 'Brooklyn',
  Bx: 'Bronx',
  Q: 'Queens',
  SI: 'Staten Island',
};

/**
 * @description Read a CSV text (quoted fields may hold commas, quotes and
 * line breaks).
 * @param {string} text - The CSV.
 * @returns {object[]} One object per row, by header.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const [header = [], ...body] = rows.filter((cells) => cells.some((cell) => cell.trim()));
  return body.map((cells) =>
    Object.fromEntries(header.map((name, index) => [name.trim(), (cells[index] ?? '').trim()])),
  );
}

/**
 * @description The route ids of a row: "S" is one of three shuttles, told
 * apart by the name of the line of the row; "SIR" is the railway.
 * @param {object} row - A row of the list.
 * @returns {string[]} Route ids.
 */
function routesOfRow(row) {
  return String(row['Daytime Routes'] ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((route) => {
      if (route === 'SIR') {
        return 'SI';
      }
      if (route === 'S') {
        const line = String(row.Line ?? '');
        if (/franklin/i.test(line)) {
          return 'FS';
        }
        return /rockaway/i.test(line) ? 'H' : 'GS';
      }
      return route;
    })
    .filter((id) => lineById(id));
}

/**
 * @description The stations: the rows of one complex.
 * @param {object[]} rows - parseCsv() of the list.
 * @returns {object[]} `[{ id, name, label, names, ids, lines, borough,
 * platforms }]`, by name; `ids` the GTFS stop ids, `platforms` per GTFS
 * stop id `{ name, lines, north, south }` (the words of each side).
 */
function buildStations(rows) {
  const complexes = new Map();
  for (const row of rows) {
    const stopId = row['GTFS Stop ID'];
    const complexId = row['Complex ID'] || row['Station ID'];
    if (!stopId || !complexId || !row['Stop Name']) {
      continue;
    }
    const list = complexes.get(complexId) ?? [];
    list.push(row);
    complexes.set(complexId, list);
  }
  const stations = [...complexes.entries()].map(([id, list]) => {
    const counts = new Map();
    for (const row of list) {
      const name = row['Stop Name'];
      counts.set(name, (counts.get(name) ?? 0) + 1 + routesOfRow(row).length / 100);
    }
    const name = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const lines = [...new Set(list.flatMap(routesOfRow))]
      .map((lineId) => lineById(lineId))
      .sort(byLine)
      .map((line) => line.id);
    const platforms = Object.fromEntries(
      list.map((row) => [
        row['GTFS Stop ID'],
        {
          name: row['Stop Name'],
          lines: routesOfRow(row),
          north: row['North Direction Label'] || '',
          south: row['South Direction Label'] || '',
        },
      ]),
    );
    return {
      id: String(id),
      name,
      label: name,
      names: [...counts.keys()],
      ids: list.map((row) => row['GTFS Stop ID']),
      lines,
      borough: BOROUGHS[list[0].Borough] ?? list[0].Borough ?? '',
      platforms,
    };
  });
  // A name of several stations: its lines, then its borough, tell them apart.
  const byName = new Map();
  for (const station of stations) {
    const key = fold(station.name);
    byName.set(key, [...(byName.get(key) ?? []), station]);
  }
  for (const same of byName.values()) {
    if (same.length < 2) {
      continue;
    }
    const linesText = (station) =>
      station.lines.map((lineId) => lineById(lineId).name).join(' ') || station.borough;
    for (const station of same) {
      station.label = `${station.name} (${linesText(station)})`;
    }
    for (const station of same) {
      if (same.filter((other) => other.label === station.label).length > 1) {
        station.label = `${station.name} (${linesText(station)}, ${station.borough})`;
      }
    }
  }
  return stations.sort(
    (a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }) || a.id.localeCompare(b.id),
  );
}

/**
 * @description Find a station as typed.
 * @param {object[]} stations - buildStations().
 * @param {string} typed - A name ("Times Sq-42 St", "bedford av"), a label
 * ("86 St (Q)"), a GTFS stop id ("R16", "127N") or, as the integration
 * keeps it, a complex id ("complex:611").
 * @param {string} [lineId] - The line the user follows there: it picks one
 * station of a shared name.
 * @returns {object|null} The station, null when unknown or ambiguous.
 * @example
 * findStation(stations, 'times sq'); // -> { id: '611', name: 'Times Sq-42 St', … }
 */
function findStation(stations, typed, lineId = '') {
  const raw = String(typed ?? '').trim();
  if (!raw) {
    return null;
  }
  // A station kept by the integration: its complex id (a complex id may also
  // be the GTFS stop id of another station: "611").
  const complex = /^complex:(\w+)$/i.exec(raw);
  if (complex) {
    return stations.find((station) => station.id === complex[1]) ?? null;
  }
  // A platform of the real time ("127N") stands for its station.
  const upper = raw.toUpperCase();
  const codes = /^[0-9A-Z]{3}[NS]$/.test(upper) ? [upper, upper.slice(0, -1)] : [upper];
  const byCode = stations.find((station) => codes.some((code) => station.ids.includes(code)));
  if (byCode) {
    return byCode;
  }
  const wanted = fold(raw);
  if (!wanted) {
    return null;
  }
  const serving = (list) =>
    lineId ? list.filter((station) => station.lines.includes(lineId)) : list;
  const pick = (list) => {
    if (list.length === 1) {
      return list[0];
    }
    const served = serving(list);
    return served.length === 1 ? served[0] : null;
  };
  const exact = stations.filter(
    (station) =>
      fold(station.label) === wanted || station.names.some((name) => fold(name) === wanted),
  );
  if (exact.length > 0) {
    return pick(exact);
  }
  // A unique station holding every typed word ("bedford" -> "Bedford Av").
  const words = wanted.split(' ');
  const holding = stations.filter((station) =>
    station.names.some((name) => words.every((word) => ` ${fold(name)} `.includes(` ${word}`))),
  );
  return pick(holding);
}

/**
 * @description Search stations by name, for the "Find a station" button.
 * @param {object[]} stations - buildStations().
 * @param {string} query - Words of the name.
 * @param {number} [max] - The most stations returned.
 * @returns {object[]} The stations, exact names first, then names starting so.
 */
function searchStations(stations, query, max = 8) {
  const words = fold(query).split(' ').filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const wanted = words.join(' ');
  const rank = (station) => {
    const names = station.names.map(fold);
    if (names.includes(wanted)) {
      return 0;
    }
    return names.some((name) => name.startsWith(wanted)) ? 1 : 2;
  };
  return stations
    .filter((station) =>
      station.names.some((name) => words.every((word) => ` ${fold(name)} `.includes(` ${word}`))),
    )
    .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, 'en', { numeric: true }))
    .slice(0, max);
}

/**
 * @description The words of the side of a platform: "Uptown & The Bronx".
 * @param {object} station - The station.
 * @param {string} stopId - A platform of the real time ("127N").
 * @returns {string} The words, '' when the list has none.
 */
function sideLabel(station, stopId) {
  const platform = station?.platforms[String(stopId).slice(0, -1)];
  if (!platform) {
    return '';
  }
  return String(stopId).endsWith('N') ? platform.north : platform.south;
}

/**
 * @description The list of the stations: the copy kept in /data when it is
 * less than a week old, else asked again (the copy of the image when every
 * reading fails).
 * @param {object} options - Options.
 * @param {object} options.api - The MTA client (`stations()`).
 * @param {object} options.store - The store (`data.network.stationsAt`).
 * @param {string} options.path - Where the list is kept in /data.
 * @param {Function} options.now - `() => number` in ms.
 * @param {object} [options.logger] - Logger.
 * @returns {object} `{ load, stations, peek, byStopId, describe }`.
 */
function createStations({ api, store, path, now, logger }) {
  let list = null;
  let byStop = new Map();
  let source = '';
  let loading = null;

  const meta = () => {
    if (!store.data.network || typeof store.data.network !== 'object') {
      store.data.network = { stationsAt: 0 };
    }
    return store.data.network;
  };

  /**
   * @description Use a list, when it holds enough stations.
   * @param {string} text - The CSV.
   * @param {string} from - `download`, `data` or `image`.
   * @returns {boolean} True when adopted.
   */
  function adopt(text, from) {
    const stations = buildStations(parseCsv(text));
    if (stations.length < MIN_STATIONS) {
      logger?.warn(`MTA stations (${from}): ${stations.length} station(s), not used`);
      return false;
    }
    list = stations;
    byStop = new Map();
    for (const station of stations) {
      for (const id of station.ids) {
        byStop.set(id, station);
      }
    }
    source = from;
    return true;
  }

  /**
   * @description A text file, '' when absent.
   * @param {string|URL} file - The file.
   * @returns {Promise<string>} Its text.
   */
  async function readText(file) {
    try {
      return await readFile(file, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger?.warn(`Unable to read ${file}: ${err.message}`);
      }
      return '';
    }
  }

  /**
   * @description Load the list (once), and ask for a fresh one weekly.
   * @param {boolean} [force] - Ask for it now.
   * @returns {Promise<object[]>} The stations.
   */
  function load(force = false) {
    const due = force || now() - (meta().stationsAt || 0) >= REFRESH_MS;
    if (list && !due) {
      return Promise.resolve(list);
    }
    loading ??= (async () => {
      try {
        if (!list) {
          // The copy kept in /data (none at the first start), else the image's.
          const kept = await readText(path);
          if (!(kept && adopt(kept, 'data'))) {
            adopt(await readText(BUNDLED_PATH), 'image');
          }
        }
        if (due) {
          try {
            const text = await api.stations();
            if (adopt(text, 'download')) {
              meta().stationsAt = now();
              await mkdir(dirname(path), { recursive: true });
              await writeFile(`${path}.tmp`, text);
              await rename(`${path}.tmp`, path);
              await store.save();
              logger?.info(`MTA stations read: ${list.length} stations`);
            }
          } catch (err) {
            // The copy kept, or the one of the image, serves meanwhile.
            logger?.warn(`MTA stations not read (${err.kind ?? 'error'}): ${err.message}`);
            if (!list) {
              throw err;
            }
          }
        }
        return list;
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  return {
    load,
    /**
     * @description The stations (loaded when needed).
     * @returns {Promise<object[]>} The stations.
     */
    stations: () => load(),
    /**
     * @description The station of a GTFS stop id, known without reading.
     * @param {string} stopId - "127" or a platform "127N".
     * @returns {object|null} The station.
     */
    byStopId: (stopId) => {
      const id = String(stopId ?? '');
      return byStop.get(id) ?? byStop.get(id.slice(0, -1)) ?? null;
    },
    /**
     * @description What the diagnostic tells of the list.
     * @returns {object} Its size, source and age.
     */
    describe: () => ({
      stations: list?.length ?? null,
      source,
      readAt: meta().stationsAt ? new Date(meta().stationsAt).toISOString() : null,
    }),
  };
}

export {
  BUNDLED_PATH,
  REFRESH_MS,
  BOROUGHS,
  parseCsv,
  routesOfRow,
  buildStations,
  findStation,
  searchStations,
  sideLabel,
  createStations,
};
