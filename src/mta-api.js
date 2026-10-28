// -----------------------------------------------------------------------------
// HTTP client of the open data of the MTA (Metropolitan Transportation
// Authority, New York): https://api.mta.info/ — no key since 2023.
//   <feeds>/nyct%2Fgtfs-ace…   GTFS-RT trip updates of the subway, one feed
//                              per group of lines (src/lines.js, 5 to 190 KB):
//                              one request per feed for every followed station;
//   <feeds>/camsys%2Fsubway-alerts   GTFS-RT service alerts of the subway
//                              (all lines, about 430 KB), with the "Mercury"
//                              extension of the MTA (alert type, hours);
//   <stations>                 the list of the stations (data.ny.gov,
//                              src/stations.js), asked weekly.
// The vehicle positions and the bus feeds (they need a key) are not used.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { decodeFeed } from './gtfs-rt.js';

const FEEDS_URL =
  process.env.MTA_FEEDS_URL || 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds';
const STATIONS_URL =
  process.env.MTA_STATIONS_URL ||
  'https://data.ny.gov/api/views/39hk-dx4f/rows.csv?accessType=DOWNLOAD';
const ALERTS_FEED = 'camsys/subway-alerts';
const TIMEOUT_MS = 20000;
const FEED_MAX_BYTES = 8 * 1024 * 1024;
const STATIONS_MAX_BYTES = 2 * 1024 * 1024;
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const USER_AGENT = `gladys-mta-new-york/${version} (+https://github.com/William-De71/gladys-mta-new-york)`;

const ENDPOINTS = {
  TRIP_UPDATES: 'trip_updates',
  ALERTS: 'alerts',
  STATIONS: 'stations',
};

class MtaError extends Error {
  /**
   * @param {string} kind - `busy`, `unreachable` or `invalid`.
   * @param {string} message - The detail.
   * @param {object} [extra] - `{ status }`.
   */
  constructor(kind, message, { status = null } = {}) {
    super(message);
    this.name = 'MtaError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description A client of the open data of the MTA.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - The fetch function (tests).
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {string} [options.feedsUrl] - The feeds root (tests).
 * @param {string} [options.stationsUrl] - The list of the stations (tests).
 * @returns {object} The methods, and `requests` for the diagnostic.
 */
function createMtaClient({
  fetch: fetchFn = globalThis.fetch,
  now = () => Date.now(),
  feedsUrl = FEEDS_URL,
  stationsUrl = STATIONS_URL,
} = {}) {
  // Requests made, per endpoint, for the diagnostic.
  const requests = { total: 0, byEndpoint: {}, failed: 0, last: null };

  /**
   * @description Get a file.
   * @param {string} endpoint - ENDPOINTS, for the counters.
   * @param {string} url - The URL.
   * @param {number} max - The largest accepted size.
   * @returns {Promise<Buffer>} The bytes.
   */
  async function call(endpoint, url, max) {
    requests.total += 1;
    requests.byEndpoint[endpoint] = (requests.byEndpoint[endpoint] ?? 0) + 1;
    requests.last = now();
    let response;
    try {
      response = await fetchFn(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      requests.failed += 1;
      throw new MtaError('unreachable', err.cause?.code ?? err.message);
    }
    if (!response.ok) {
      requests.failed += 1;
      let kind = 'unreachable';
      if (response.status === 429 || response.status === 503) {
        kind = 'busy';
      } else if (response.status >= 400 && response.status < 500) {
        kind = 'invalid';
      }
      throw new MtaError(kind, `${endpoint}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    let body;
    try {
      body = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      requests.failed += 1;
      throw new MtaError('unreachable', `${endpoint}: ${err.message}`);
    }
    if (body.length > max) {
      requests.failed += 1;
      throw new MtaError('invalid', `${endpoint}: ${body.length} bytes`);
    }
    return body;
  }

  /**
   * @description A GTFS-RT feed.
   * @param {string} endpoint - ENDPOINTS.
   * @param {string} path - "nyct/gtfs-ace".
   * @returns {Promise<object>} decodeFeed().
   */
  async function feed(endpoint, path) {
    const body = await call(endpoint, `${feedsUrl}/${encodeURIComponent(path)}`, FEED_MAX_BYTES);
    try {
      return decodeFeed(body);
    } catch (err) {
      requests.failed += 1;
      throw new MtaError('invalid', `${endpoint} ${path}: ${err.message}`);
    }
  }

  return {
    requests,
    /**
     * @description The trip updates of a group of lines.
     * @param {string} path - The feed (lines.js FEEDS).
     * @returns {Promise<object>} `{ timestamp, tripUpdates }`.
     */
    tripUpdates: (path) => feed(ENDPOINTS.TRIP_UPDATES, path),
    /**
     * @description The service alerts of the subway.
     * @returns {Promise<object>} `{ timestamp, alerts }`.
     */
    alerts: () => feed(ENDPOINTS.ALERTS, ALERTS_FEED),
    /**
     * @description The list of the stations.
     * @returns {Promise<string>} The CSV.
     */
    stations: async () =>
      (await call(ENDPOINTS.STATIONS, stationsUrl, STATIONS_MAX_BYTES)).toString('utf8'),
  };
}

export { FEEDS_URL, STATIONS_URL, ALERTS_FEED, USER_AGENT, ENDPOINTS, MtaError, createMtaClient };
