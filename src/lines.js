// -----------------------------------------------------------------------------
// The lines of the New York City subway and of the Staten Island Railway, as
// the GTFS of the MTA names them (route ids, routes.txt of
// https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip), with the GTFS-RT
// feed that carries their trains. The list changes once in years (the last
// new route, the W, came back in 2016): it is written here rather than read
// from a 5.6 MB zip.
//
// Feeds of https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds (no key):
//   nyct/gtfs        1 2 3 4 5 6 6X 7 7X and the 42 St Shuttle (GS)
//   nyct/gtfs-ace    A C E and the Rockaway Park Shuttle (H)
//   nyct/gtfs-bdfm   B D F FX M and the Franklin Av Shuttle (FS)
//   nyct/gtfs-g      G          nyct/gtfs-jz   J Z
//   nyct/gtfs-l      L          nyct/gtfs-nqrw N Q R W
//   nyct/gtfs-si     the Staten Island Railway (SI)
// The three shuttles are all "S" on the trains: their route ids tell them
// apart.
// -----------------------------------------------------------------------------

import { fold } from './text.js';

const FEEDS = {
  NUMBERED: 'nyct/gtfs',
  ACE: 'nyct/gtfs-ace',
  BDFM: 'nyct/gtfs-bdfm',
  G: 'nyct/gtfs-g',
  JZ: 'nyct/gtfs-jz',
  L: 'nyct/gtfs-l',
  NQRW: 'nyct/gtfs-nqrw',
  SI: 'nyct/gtfs-si',
};

const KINDS = { SUBWAY: 'subway', SHUTTLE: 'shuttle', RAILWAY: 'railway' };

// [route id, public name, long name, feed, kind]
const ROUTES = [
  ['1', '1', 'Broadway - 7 Avenue Local', FEEDS.NUMBERED],
  ['2', '2', '7 Avenue Express', FEEDS.NUMBERED],
  ['3', '3', '7 Avenue Express', FEEDS.NUMBERED],
  ['4', '4', 'Lexington Avenue Express', FEEDS.NUMBERED],
  ['5', '5', 'Lexington Avenue Express', FEEDS.NUMBERED],
  ['6', '6', 'Lexington Avenue Local', FEEDS.NUMBERED],
  ['6X', '6X', 'Pelham Bay Park Express', FEEDS.NUMBERED],
  ['7', '7', 'Flushing Local', FEEDS.NUMBERED],
  ['7X', '7X', 'Flushing Express', FEEDS.NUMBERED],
  ['A', 'A', '8 Avenue Express', FEEDS.ACE],
  ['C', 'C', '8 Avenue Local', FEEDS.ACE],
  ['E', 'E', '8 Avenue Local', FEEDS.ACE],
  ['B', 'B', '6 Avenue Express', FEEDS.BDFM],
  ['D', 'D', '6 Avenue Express', FEEDS.BDFM],
  ['F', 'F', 'Queens Blvd Express/6 Av Local', FEEDS.BDFM],
  ['FX', 'FX', 'Brooklyn F Express', FEEDS.BDFM],
  ['M', 'M', 'Queens Blvd Local/6 Av Local', FEEDS.BDFM],
  ['G', 'G', 'Brooklyn-Queens Crosstown', FEEDS.G],
  ['J', 'J', 'Nassau St Local', FEEDS.JZ],
  ['Z', 'Z', 'Nassau St Express', FEEDS.JZ],
  ['L', 'L', '14 St-Canarsie Local', FEEDS.L],
  ['N', 'N', 'Broadway Local', FEEDS.NQRW],
  ['Q', 'Q', 'Broadway Express', FEEDS.NQRW],
  ['R', 'R', 'Broadway Local', FEEDS.NQRW],
  ['W', 'W', 'Broadway Local', FEEDS.NQRW],
  ['GS', 'S', '42 St Shuttle', FEEDS.NUMBERED, KINDS.SHUTTLE],
  ['FS', 'S', 'Franklin Avenue Shuttle', FEEDS.BDFM, KINDS.SHUTTLE],
  ['H', 'S', 'Rockaway Park Shuttle', FEEDS.ACE, KINDS.SHUTTLE],
  ['SI', 'SIR', 'Staten Island Railway', FEEDS.SI, KINDS.RAILWAY],
];

const LINES = ROUTES.map(([id, name, longName, feed, kind = KINDS.SUBWAY], index) => ({
  id,
  name,
  longName,
  feed,
  kind,
  order: index,
}));
const BY_ID = new Map(LINES.map((line) => [line.id, line]));

// Words a user may type around a line: "the A train", "line 7", "ligne Q".
const AROUND =
  /\b(the|line|lines|ligne|lignes|linie|linien|l[ií]nea|l[ií]neas|train|trains|subway|metro|m[ée]tro|u-bahn|zug)\b/g;
// Other ways to say the shuttles and the railway.
const ALIASES = [
  [/\b(42|times|grand central)\b/, 'GS'],
  [/\bfranklin\b/, 'FS'],
  [/\brockaway\b/, 'H'],
  [/\b(sir|staten)\b/, 'SI'],
];

/**
 * @description A line by route id.
 * @param {string} id - "A", "GS".
 * @returns {object|null} The line.
 */
const lineById = (id) => BY_ID.get(String(id ?? '').toUpperCase()) ?? null;

/**
 * @description Find a line as typed by a user.
 * @param {string} typed - "A", "a train", "7 express", "S 42 St", "SIR".
 * @returns {object|null} The line, null when unknown or ambiguous (a bare "S").
 * @example
 * findLine('the Q train'); // -> { id: 'Q', … }
 */
function findLine(typed) {
  const raw = String(typed ?? '').trim();
  if (!raw) {
    return null;
  }
  const direct = lineById(raw);
  if (direct) {
    return direct;
  }
  let words = fold(raw).replace(AROUND, ' ').replace(/\s+/g, ' ').trim();
  words = words.replace(/\bexpress\b/, 'x').replace(/^(\w+) x$/, '$1x');
  const compact = words.replace(/ /g, '').toUpperCase();
  if (lineById(compact)) {
    return lineById(compact);
  }
  for (const [pattern, id] of ALIASES) {
    if (pattern.test(words)) {
      return lineById(id);
    }
  }
  return null;
}

/**
 * @description The order of lines: as the MTA lists them.
 * @param {object} a - A line.
 * @param {object} b - Another one.
 * @returns {number} The order.
 */
const byLine = (a, b) => a.order - b.order;

/**
 * @description The feeds carrying some lines.
 * @param {Iterable<string>} ids - Route ids.
 * @returns {string[]} The feed paths, without duplicates, in a stable order.
 */
function feedsOf(ids) {
  const wanted = new Set();
  for (const id of ids) {
    const line = lineById(id);
    if (line) {
      wanted.add(line.feed);
    }
  }
  return Object.values(FEEDS).filter((feed) => wanted.has(feed));
}

export { FEEDS, KINDS, LINES, lineById, findLine, byLine, feedsOf };
