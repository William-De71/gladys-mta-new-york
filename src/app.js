// -----------------------------------------------------------------------------
// The MTA integration: every handler, registered on a Gladys client.
//
// Brings the New York City subway (and the Staten Island Railway) into
// Gladys, through the official open data of the MTA (GTFS-RT, no key):
//   - devices (device.js): one per followed station — the three of the form
//     and the ones added with the "Add a station" button, filtered by line
//     and direction — with the next train and the waits; one per followed
//     line — up to six — with its service status;
//   - scene triggers (events.js): departure soon, line disrupted, back to
//     good service, new service alert;
//   - scene actions: read the next trains of a station, read the service
//     status of a line;
//   - dashboard widgets (widgets.js): departures, service status.
//
// The open data have no push: the trip updates are read per group of lines
// (one feed for every followed station of these lines), on the
// integration's own timer (every 30 s to 5 min, 1 min by default; every 10
// min while no station announces a train in the next half hour), the alerts
// every 5 min, never on a Gladys poll. The stations come from the official
// list of the MTA (stations.js). Transport: cloud only.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  readLanguage,
  parseLines,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
  MAX_ADDED_STATIONS,
} from './config.js';
import { createMtaClient } from './mta-api.js';
import { createStations, findStation, searchStations } from './stations.js';
import { lineById, findLine, byLine, feedsOf } from './lines.js';
import { fold } from './text.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { buildPassages, upcomingPassages, routeOf } from './departures.js';
import { parseTraffic, lineTraffic } from './traffic.js';
import {
  DEVICE_TYPES,
  codeKey,
  stationKey,
  followedName,
  idsOf,
  parseExternalId,
  buildStationDevice,
  buildStationStates,
  buildLineDevice,
  buildLineStates,
} from './device.js';
import {
  detectReminders,
  detectLineChanges,
  reminderData,
  lineEvent,
  nextDeparturesOutputs,
  lineStatusOutputs,
  pick,
  TRIGGERS,
  NEXT_DEPARTURES_OUTPUTS,
  LINE_STATUS_OUTPUTS,
} from './events.js';
import {
  WIDGETS,
  BOARD_COUNT,
  messageContent,
  readCount,
  buildDeparturesWidget,
  buildTrafficWidget,
} from './widgets.js';
import { MINUTE_MS } from './time.js';
import { t, all, lineStateText, lineLabel, passageWhen, LANGUAGES } from './i18n.js';

const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  SEARCH_STATION: 'search_station',
  ADD_STATION: 'add_station',
  REMOVE_STATION: 'remove_station',
  LIST_STATIONS: 'list_stations',
  DIAGNOSTIC: 'diagnostic',
};
const SCENE_ACTIONS = {
  GET_NEXT_DEPARTURES: 'get_next_departures',
  GET_LINE_STATUS: 'get_line_status',
};
// While no station announces a train in QUIET_HORIZON_MS, the stations are
// read this often.
const IDLE_INTERVAL_MS = 10 * MINUTE_MS;
const QUIET_HORIZON_MS = 30 * MINUTE_MS;
const TRAFFIC_INTERVAL_MS = 5 * MINUTE_MS;
const REMINDER_TICK_MS = 30 * 1000;
// A widget or a scene action reuses a reading this fresh.
const SNAPSHOT_MAX_AGE_MS = 90 * 1000;
const BOARD_MAX_AGE_MS = 60 * 1000;
const TRAFFIC_MAX_AGE_MS = 3 * MINUTE_MS;
// A feed that fails is replaced by its last reading while it is this fresh.
const FEED_SPARE_MS = 3 * MINUTE_MS;
// Names that could not be resolved for a network reason are tried again.
const RESOLVE_RETRY_MS = 5 * MINUTE_MS;
const DIAGNOSTIC_CHUNK = 3000;
const ACTION_TEXT_MAX = 1500;
// The service status widget, without a followed line nor a followed station.
const DEFAULT_STATUS_LINES = ['1', '2', '3', '4', '5', '6', '7', 'A', 'C', 'E'];
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/**
 * @description Cut a text of several lines at a line break, under a bound.
 * @param {string} text - The text.
 * @param {number} max - The bound.
 * @returns {string} The whole lines that fit, then "…".
 */
function clipLines(text, max) {
  if (text.length <= max) {
    return text;
  }
  const cut = text.lastIndexOf('\n', max - 2);
  return `${text.slice(0, cut > 0 ? cut : max - 2)}\n…`;
}

/**
 * @description The route ids a followed station needs the feeds of.
 * @param {object} followed - `{ station, line }`.
 * @returns {string[]} Route ids.
 */
const routesOfFollowed = ({ station, line }) => (line ? [line.id] : station.lines);

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - HTTP transport of the open data (tests).
 * @param {string} [options.feedsUrl] - The feeds root (tests).
 * @param {string} [options.stationsUrl] - The list of the stations (tests).
 * @param {string} [options.storePath] - The file kept in /data (the list of
 * the stations is kept next to it).
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {boolean} [options.timers] - Arm the reading timers (false in tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    feedsUrl,
    stationsUrl,
    storePath = DEFAULT_PATH,
    now = () => Date.now(),
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // The raw values last read, internal keys included: the base of setConfig.
  let rawConfig = {};
  // The stations added with the buttons, one change at a time.
  let writingStations = Promise.resolve();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`. English
  // until a widget is shown: the network serves New York.
  let language = 'en';
  let createdDevices = new Set();
  // The followed stations and lines, resolved, and what the MTA does not know.
  let followedStations = [];
  // config.stations[i] -> its followed station (null when unknown), for
  // "List the stations".
  let entries = [];
  let lines = [];
  let notFound = [];
  // station key -> { passages, readAt } of its last reading.
  const snapshots = new Map();
  // feed path -> { feed, readAt } of its last good reading.
  const feeds = new Map();
  let stationsError = null;
  let stationsReadAt = 0;
  // The last reading of the alerts.
  let traffic = { data: null, readAt: 0, error: null };
  let trafficPending = null;
  // Whether the service status widget was shown: the alerts are then read on
  // the timer even without a followed line.
  let trafficWanted = false;
  // typed station -> { passages, readAt }, for the widgets of other stations.
  const boards = new Map();
  let resolveError = null;
  let lastStatus = null;
  let lastDiscovery = null;
  let stationTimer = null;
  let trafficTimer = null;
  let reminderTimer = null;
  let resolveTimer = null;
  let readingStations = null;
  let stopped = false;

  const api = createMtaClient({
    now,
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(feedsUrl ? { feedsUrl } : {}),
    ...(stationsUrl ? { stationsUrl } : {}),
  });
  const store = createStore({ path: storePath, logger });
  const stations = createStations({
    api,
    store,
    path: join(dirname(storePath), 'mta-stations.csv'),
    now,
    logger,
  });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description The message of an error, for a user.
   * @param {Error} err - The error.
   * @param {string} lang - The language.
   * @returns {string} The message.
   */
  function errorText(err, lang) {
    return t(err?.kind === 'busy' ? 'errorBusy' : 'errorUnreachable', lang);
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Work out the connection status from the last readings.
   * @returns {Promise<void>}
   */
  async function refreshStatus() {
    const failing = (followedStations.length && stationsError ? 1 : 0) + (traffic.error ? 1 : 0);
    if (resolveError || failing >= (followedStations.length ? 2 : 1)) {
      const err = resolveError ?? traffic.error ?? stationsError;
      await reportStatus(
        false,
        all('statusUnreachable', {
          detail: String(err?.message ?? '').slice(0, 80),
          minutes: Math.round(Math.max(config.interval * 1000, MINUTE_MS) / MINUTE_MS),
        }),
      );
      return;
    }
    const unknown = notFound.length
      ? (l) => ` ${t('statusNotFound', l, { names: notFound.join(', ') })}`
      : () => '';
    if (followedStations.length + lines.length === 0) {
      await reportStatus(
        true,
        Object.fromEntries(LANGUAGES.map((l) => [l, `${t('statusNothing', l)}${unknown(l)}`])),
      );
      return;
    }
    const { interval } = config;
    await reportStatus(
      true,
      Object.fromEntries(
        LANGUAGES.map((l) => [
          l,
          `${t('statusConnected', l, { stations: followedStations.length, lines: lines.length, interval })}${unknown(l)}`,
        ]),
      ),
    );
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Ask the open widgets to pull their content again.
   * @param {string[]} keys - The widget keys.
   */
  function refreshWidgets(keys) {
    for (const key of keys) {
      Promise.resolve(gladys.requestWidgetRefresh(key)).catch(() => {});
    }
  }

  /**
   * @description Publish scene events, one by one.
   * @param {Array<{ key: string, data: object }>} events - The events.
   * @returns {Promise<void>}
   */
  async function publishEvents(events) {
    for (const { key, data } of events) {
      logger.info(`${data.station_name ?? data.line_name}: ${key}`);
      try {
        await gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.warn(`Unable to fire ${key}: ${err.message}`);
      }
    }
  }

  // --- Stations and lines ------------------------------------------------------------

  /**
   * @description Resolve one station of the configuration.
   * @param {object} entry - `{ slot, added, station, line, direction }`.
   * @returns {Promise<object>} The followed station, or `{ unknown }`: the
   * typed station or line the MTA does not know (or a name of several
   * stations).
   */
  async function resolveEntry(entry) {
    const line = entry.line ? findLine(entry.line) : null;
    if (entry.line && !line) {
      return { unknown: entry.line };
    }
    const station = findStation(await stations.stations(), entry.station, line?.id ?? '');
    if (!station) {
      return { unknown: entry.station };
    }
    const key = stationKey(station, line, entry.direction);
    const followed = {
      slot: entry.slot,
      added: entry.added ?? null,
      station,
      line,
      direction: entry.direction,
      key,
    };
    return {
      ...followed,
      name: followedName(followed),
      deviceId: idsOf(gladys, DEVICE_TYPES.STATION, key).device,
    };
  }

  /**
   * @description Resolve the configured stations and lines.
   * @returns {Promise<void>}
   */
  async function resolveConfig() {
    clearTimeout(resolveTimer);
    const resolvedStations = [];
    const resolvedEntries = [];
    const resolvedLines = [];
    const unknown = [];
    try {
      for (const entry of config.stations) {
        const followed = await resolveEntry(entry);
        if (followed.unknown) {
          unknown.push(followed.unknown);
          resolvedEntries.push(null);
          continue;
        }
        const known = resolvedStations.find((other) => other.key === followed.key);
        if (!known) {
          resolvedStations.push(followed);
        }
        resolvedEntries.push(known ?? followed);
      }
      resolveError = null;
    } catch (err) {
      // Keep what was resolved before; try again later.
      logger.warn(`Unable to read the stations (${err.kind ?? 'error'}): ${err.message}`);
      resolveError = err;
      if (timers && !stopped) {
        resolveTimer = setTimeout(() => {
          applyConfig().catch(() => {});
        }, RESOLVE_RETRY_MS);
        resolveTimer.unref?.();
      }
      return;
    }
    for (const typed of config.lines) {
      const line = findLine(typed);
      if (!line) {
        unknown.push(typed);
      } else if (!resolvedLines.some((known) => known.id === line.id)) {
        resolvedLines.push({
          ...line,
          deviceId: idsOf(gladys, DEVICE_TYPES.LINE, line.id).device,
        });
      }
    }
    followedStations = resolvedStations;
    entries = resolvedEntries;
    lines = resolvedLines;
    notFound = unknown;
    for (const key of [...snapshots.keys()]) {
      if (!followedStations.some((followed) => followed.key === key)) {
        snapshots.delete(key);
      }
    }
  }

  /**
   * @description Offer a device per station and per line on the Discovery
   * screen, when they changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const lang = textLanguage();
    const devices = [
      ...followedStations.map((followed) => buildStationDevice(gladys, followed, lang)),
      ...lines.map((line) => buildLineDevice(gladys, line, lang)),
    ];
    const signature = JSON.stringify(devices);
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    }
    return devices.length;
  }

  // --- Reading the stations ----------------------------------------------------------

  /**
   * @description Publish the states of a station, when its device exists.
   * @param {object} followed - The followed station.
   * @returns {Promise<void>}
   */
  async function publishStationStates(followed) {
    const snapshot = snapshots.get(followed.key);
    if (!snapshot || !createdDevices.has(followed.deviceId)) {
      return;
    }
    await gladys
      .publishChangedStates(
        buildStationStates(gladys, followed, snapshot.passages, {
          language: textLanguage(),
          now: now(),
        }),
      )
      .catch((err) =>
        logger.warn(`Unable to publish the states of ${followed.name}: ${err.message}`),
      );
  }

  /**
   * @description The reminders due on the last reading of a station.
   * @param {object} followed - The followed station.
   * @returns {object[]} The events.
   */
  function reminderEvents(followed) {
    const snapshot = snapshots.get(followed.key);
    if (!snapshot) {
      return [];
    }
    const { due, fired } = detectReminders({
      passages: snapshot.passages,
      fired: store.data.seen.reminders[followed.key],
      now: now(),
    });
    store.data.seen.reminders[followed.key] = fired;
    return due.map(({ passage, mark }) => ({
      key: TRIGGERS.DEPARTURE_SOON,
      data: reminderData(followed, passage, mark, { language: textLanguage() }),
    }));
  }

  /**
   * @description The departures of a followed (or typed) station.
   * @param {object} followed - `{ station, line, direction }`.
   * @param {object[]} read - The feeds read.
   * @returns {object[]} Its departures.
   */
  function passagesOf({ station, line, direction = '' }, read) {
    return buildPassages({
      feeds: read,
      station,
      now: now(),
      lineId: line?.id ?? '',
      direction,
      stationOf: stations.byStopId,
    });
  }

  /**
   * @description Read the feeds of some lines, each once. A feed that fails
   * gives its last reading while it is fresh enough.
   * @param {string[]} routeIds - The lines.
   * @param {number} [maxAgeMs] - A reading this fresh is not read again.
   * @returns {Promise<{ read: object[], failure: Error|null }>} The feeds
   * and the first error; throws when no feed could be had.
   */
  async function readFeeds(routeIds, maxAgeMs = 0) {
    const paths = feedsOf(routeIds);
    let failure = null;
    const read = [];
    for (const path of paths) {
      const kept = feeds.get(path);
      if (kept && maxAgeMs > 0 && now() - kept.readAt <= maxAgeMs) {
        read.push(kept.feed);
        continue;
      }
      try {
        const feed = await api.tripUpdates(path);
        feeds.set(path, { feed, readAt: now() });
        read.push(feed);
      } catch (err) {
        failure ??= err;
        if (kept && now() - kept.readAt <= FEED_SPARE_MS) {
          read.push(kept.feed);
        }
      }
    }
    if (paths.length > 0 && read.length === 0) {
      throw failure ?? new Error('no feed');
    }
    return { read, failure };
  }

  /**
   * @description What follows a reading of a station: events, states.
   * @param {object} followed - The followed station.
   * @returns {Promise<void>}
   */
  async function digestStation(followed) {
    const events = gladys.connected !== false ? reminderEvents(followed) : [];
    await store.save();
    await publishEvents(events);
    await publishStationStates(followed);
  }

  /**
   * @description Read some followed stations now: the feeds of their lines,
   * each once. The error of a feed is thrown once the stations are set.
   * @param {object[]} list - The followed stations.
   * @returns {Promise<void>}
   */
  async function readFollowed(list) {
    let result;
    try {
      result = await readFeeds([...new Set(list.flatMap(routesOfFollowed))]);
    } catch (err) {
      stationsError = err;
      throw err;
    }
    stationsError = result.failure;
    const readAt = now();
    for (const followed of list) {
      snapshots.set(followed.key, { passages: passagesOf(followed, result.read), readAt });
    }
    stationsReadAt = readAt;
    for (const followed of list) {
      await digestStation(followed);
    }
    if (result.failure) {
      throw result.failure;
    }
  }

  /**
   * @description Whether the stations are due for a reading.
   * @returns {boolean} True when due.
   */
  function stationsDue() {
    if (stationsError || followedStations.some((followed) => !snapshots.has(followed.key))) {
      return true;
    }
    const age = now() - stationsReadAt;
    // A line that does not run (the Z on weekends): read less often.
    const quiet = followedStations.every((followed) =>
      upcomingPassages(snapshots.get(followed.key).passages, now()).every(
        (passage) => passage.at - now() > QUIET_HORIZON_MS,
      ),
    );
    return age >= (quiet ? IDLE_INTERVAL_MS : config.interval * 1000) - 1000;
  }

  /**
   * @description Read every followed station when due (one reading at a time).
   * @param {object} [options] - `{ force }`: read even when not due.
   * @returns {Promise<void>}
   */
  function readStations({ force = false } = {}) {
    if (!readingStations) {
      readingStations = (async () => {
        if (followedStations.length > 0 && (force || stationsDue())) {
          try {
            await readFollowed(followedStations);
            refreshWidgets([WIDGETS.DEPARTURES]);
          } catch (err) {
            logger.warn(`MTA stations (${err.kind ?? 'error'}): ${err.message}`);
          }
        }
        await refreshStatus();
      })().finally(() => {
        readingStations = null;
      });
    }
    return readingStations;
  }

  /**
   * @description The snapshots of followed stations, read again (together)
   * when older than `maxAgeMs`.
   * @param {object[]} list - The followed stations.
   * @param {number} maxAgeMs - The freshness wanted.
   * @returns {Promise<object[]>} Their snapshots, in the same order.
   */
  async function snapshotsOf(list, maxAgeMs) {
    const stale = list.filter((followed) => {
      const snapshot = snapshots.get(followed.key);
      return !snapshot || now() - snapshot.readAt > maxAgeMs;
    });
    if (stale.length > 0) {
      await readFollowed(stale).catch((err) => {
        // A spare feed may have given a reading: only a station left without
        // one fails.
        if (stale.some((followed) => !snapshots.has(followed.key))) {
          throw err;
        }
      });
    }
    return list.map((followed) => snapshots.get(followed.key));
  }

  /**
   * @description Check the reminders on the last readings (between readings).
   * @returns {Promise<void>}
   */
  async function checkReminders() {
    // Disconnected, the event would be lost while marked as fired.
    if (gladys.connected === false) {
      return;
    }
    const events = followedStations.flatMap((followed) => reminderEvents(followed));
    if (events.length) {
      await store.save();
      await publishEvents(events);
    }
  }

  // --- Reading the alerts ------------------------------------------------------------

  /**
   * @description Publish what a reading of the alerts changed: events of the
   * followed lines, states of the line devices.
   * @returns {Promise<void>}
   */
  async function digestTraffic() {
    const current = now();
    if (gladys.connected !== false) {
      const lineChanges = detectLineChanges({
        lines,
        traffic: traffic.data,
        seen: store.data.seen.lines,
        now: current,
      });
      store.data.seen.lines = lineChanges.seen;
      await store.save();
      await publishEvents(
        lineChanges.changes.map((change) => lineEvent(change, { language: textLanguage() })),
      );
    }
    const states = lines
      .filter((line) => createdDevices.has(line.deviceId))
      .flatMap((line) =>
        buildLineStates(gladys, line, lineTraffic(traffic.data, line.id, current), textLanguage()),
      );
    if (states.length > 0) {
      await gladys
        .publishChangedStates(states)
        .catch((err) => logger.warn(`Unable to publish the line states: ${err.message}`));
    }
    refreshWidgets([WIDGETS.TRAFFIC]);
  }

  /**
   * @description Read the alerts now (one reading at a time).
   * @returns {Promise<object>} `{ data, readAt }`.
   */
  function readTrafficNow() {
    if (!trafficPending) {
      trafficPending = (async () => {
        try {
          const feed = await api.alerts();
          traffic = { data: parseTraffic(feed), readAt: now(), error: null };
          await digestTraffic();
          return traffic;
        } catch (err) {
          traffic = { ...traffic, error: err };
          throw err;
        } finally {
          trafficPending = null;
        }
      })();
    }
    return trafficPending;
  }

  /**
   * @description The alerts, read again when older than `maxAgeMs`.
   * @param {number} maxAgeMs - The freshness wanted.
   * @returns {Promise<object>} `{ data, readAt }`.
   */
  async function trafficOf(maxAgeMs) {
    if (traffic.data && now() - traffic.readAt <= maxAgeMs) {
      return traffic;
    }
    return readTrafficNow();
  }

  /**
   * @description The regular reading of the alerts: only when a line is
   * followed or the service status widget was shown (430 KB a reading).
   * @param {boolean} [force] - Read anyway.
   * @returns {Promise<void>}
   */
  async function trafficTick(force = false) {
    if (force || lines.length > 0 || trafficWanted) {
      await readTrafficNow().catch((err) =>
        logger.warn(`MTA alerts (${err.kind ?? 'error'}): ${err.message}`),
      );
    }
    await refreshStatus();
  }

  // --- Timers ------------------------------------------------------------------------

  /**
   * @description (Re)arm the timers.
   */
  function schedule() {
    clearInterval(stationTimer);
    clearInterval(trafficTimer);
    clearInterval(reminderTimer);
    if (!timers || stopped) {
      return;
    }
    // A short tick: stationsDue() decides whether the stations are due.
    stationTimer = setInterval(
      () => {
        readStations().catch((err) => logger.error('Stations', err));
      },
      Math.min(config.interval * 1000, 30000),
    );
    trafficTimer = setInterval(() => {
      trafficTick().catch((err) => logger.error('Alerts', err));
    }, TRAFFIC_INTERVAL_MS);
    reminderTimer = setInterval(() => {
      checkReminders().catch((err) => logger.warn(`Reminders: ${err.message}`));
    }, REMINDER_TICK_MS);
    [stationTimer, trafficTimer, reminderTimer].forEach((timer) => timer.unref?.());
  }

  /**
   * @description Resolve the configuration, offer the devices, read everything.
   * @returns {Promise<void>}
   */
  async function applyConfig() {
    await resolveConfig();
    logger.info(
      `${followedStations.length} station(s): ${followedStations.map((followed) => followed.name).join(', ') || 'none'}; ` +
        `${lines.length} line(s): ${lines.map((line) => line.id).join(', ') || 'none'}` +
        (notFound.length ? `; unknown: ${notFound.join(', ')}` : ''),
    );
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the devices: ${err.message}`),
    );
    await readStations({ force: true });
    await trafficTick();
    schedule();
  }

  // --- Dashboard widgets -------------------------------------------------------------

  /**
   * @description What a widget or a scene action targets, by device external id.
   * @param {unknown} externalId - The `source: "devices"` value.
   * @param {string} type - DEVICE_TYPES.
   * @returns {object|null} The followed station or line, the first one by default.
   */
  function target(externalId, type) {
    const parsed = parseExternalId(externalId);
    const list = type === DEVICE_TYPES.STATION ? followedStations : lines;
    const keyOf = (item) => (type === DEVICE_TYPES.STATION ? item.key : codeKey(item.id));
    const found = parsed?.type === type ? list.find((item) => keyOf(item) === parsed.key) : null;
    return found ?? list[0] ?? null;
  }

  /**
   * @description The departures of a station typed in a widget.
   * @param {string} typed - The station.
   * @param {string} typedLine - Its optional line.
   * @param {string} lang - The language.
   * @returns {Promise<object>} `{ title, passages, readAt }` or `{ message }`.
   */
  async function typedBoard(typed, typedLine, lang) {
    const line = typedLine ? findLine(typedLine) : null;
    if (typedLine && !line) {
      return { message: t('statusNotFound', lang, { names: typedLine.slice(0, 60) }) };
    }
    const station = findStation(await stations.stations(), typed, line?.id ?? '');
    if (!station) {
      return { message: t('statusNotFound', lang, { names: typed.slice(0, 60) }) };
    }
    const key = stationKey(station, line, '');
    let board = boards.get(key);
    if (!board || now() - board.readAt > BOARD_MAX_AGE_MS) {
      const followed = { station, line };
      const { read } = await readFeeds(routesOfFollowed(followed), BOARD_MAX_AGE_MS);
      board = { readAt: now(), passages: passagesOf(followed, read) };
      boards.set(key, board);
    }
    return { title: followedName({ station, line, direction: '' }), ...board };
  }

  /**
   * @description The followed stations chosen in the `stations` setting of a
   * widget, grouped by station: devices of one station (one per line and
   * direction) make one board, their routes merged.
   * @param {unknown} raw - The `multi_select` value: device external ids.
   * @returns {Promise<object[]>} `[{ title, label, passages, readAt }]`,
   * in the order chosen; empty when no chosen device is followed any more.
   */
  async function followedBoards(raw) {
    const ids = Array.isArray(raw) ? raw : [];
    const groups = new Map();
    for (const id of ids) {
      const parsed = parseExternalId(id);
      const followed =
        parsed?.type === DEVICE_TYPES.STATION
          ? followedStations.find((item) => item.key === parsed.key)
          : null;
      if (!followed) {
        continue;
      }
      const group = followed.station.id;
      const members = groups.get(group) ?? [];
      if (!members.includes(followed)) {
        groups.set(group, [...members, followed]);
      }
    }
    // Every chosen device in one reading when they need a new one.
    await snapshotsOf([...groups.values()].flat(), SNAPSHOT_MAX_AGE_MS);
    const result = [];
    for (const members of groups.values()) {
      const read = members.map((followed) => snapshots.get(followed.key));
      // A train of two chosen devices (every line and one of them) once.
      const passages = new Map();
      for (const passage of read.flatMap((snapshot) => snapshot.passages)) {
        passages.set(`${routeOf(passage)}|${passage.trip}`, passage);
      }
      const [first] = members;
      result.push({
        title: members.length > 1 ? followedName({ station: first.station }) : first.name,
        label: first.station.label,
        passages: [...passages.values()].sort((a, b) => a.at - b.at),
        readAt: Math.min(...read.map((snapshot) => snapshot.readAt)),
      });
    }
    return result;
  }

  gladys.onWidgetGet(WIDGETS.DEPARTURES, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const count = readCount(settings.count, BOARD_COUNT);
    const typed = typeof settings.station_name === 'string' ? settings.station_name.trim() : '';
    const typedLine = typeof settings.line === 'string' ? settings.line.trim() : '';
    try {
      let board;
      if (typed) {
        board = await typedBoard(typed, typedLine, lang);
        if (board.message) {
          return messageContent(board.message);
        }
      } else {
        const several = await followedBoards(settings.stations);
        if (several.length > 1) {
          board = { boards: several };
        } else if (several.length === 1) {
          board = several[0];
        } else {
          const followed = target(settings.station, DEVICE_TYPES.STATION);
          if (!followed) {
            return messageContent(t('widgetNoStation', lang));
          }
          const [snapshot] = await snapshotsOf([followed], SNAPSHOT_MAX_AGE_MS);
          board = { title: followed.name, ...snapshot };
        }
      }
      return buildDeparturesWidget({ ...board, count, language: lang, now: now() });
    } catch (err) {
      logger.warn(`Widget: unable to read the departures: ${err.message}`);
      return messageContent(errorText(err, lang), 60);
    }
  });

  gladys.onWidgetGet(WIDGETS.TRAFFIC, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    trafficWanted = true;
    try {
      let wanted = lines;
      const typed = parseLines(settings.lines);
      if (typed.length > 0) {
        wanted = [];
        for (const entry of typed) {
          const line = findLine(entry);
          if (!line) {
            return messageContent(t('statusNotFound', lang, { names: entry.slice(0, 60) }));
          }
          wanted.push(line);
        }
      }
      if (wanted.length === 0) {
        // Nothing followed nor typed: the lines of the followed stations.
        const ids = [...new Set(followedStations.flatMap(routesOfFollowed))];
        wanted = (ids.length ? ids : DEFAULT_STATUS_LINES)
          .map((id) => lineById(id))
          .filter(Boolean)
          .sort(byLine);
      }
      const current = await trafficOf(TRAFFIC_MAX_AGE_MS);
      return buildTrafficWidget({
        lines: wanted.map((line) => ({
          line,
          traffic: lineTraffic(current.data, line.id, now()),
        })),
        readAt: current.readAt,
        language: lang,
        now: now(),
      });
    } catch (err) {
      logger.warn(`Widget: unable to read the alerts: ${err.message}`);
      return messageContent(errorText(err, lang), 60);
    }
  });

  // --- Scene actions -----------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_NEXT_DEPARTURES, async (fields = {}) => {
    const followed = target(fields.station, DEVICE_TYPES.STATION);
    if (!followed) {
      throw new Error('No MTA station is followed');
    }
    const [snapshot] = await snapshotsOf([followed], SNAPSHOT_MAX_AGE_MS);
    return pick(
      nextDeparturesOutputs({
        followed,
        passages: snapshot.passages,
        now: now(),
        language: textLanguage(),
      }),
      NEXT_DEPARTURES_OUTPUTS,
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_LINE_STATUS, async (fields = {}) => {
    const line = target(fields.line, DEVICE_TYPES.LINE);
    if (!line) {
      throw new Error('No MTA line is followed');
    }
    const current = await trafficOf(SNAPSHOT_MAX_AGE_MS);
    return pick(
      lineStatusOutputs({
        line,
        traffic: lineTraffic(current.data, line.id, now()),
        language: textLanguage(),
      }),
      LINE_STATUS_OUTPUTS,
    );
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    const messages = [];
    try {
      const known = await stations.load(true);
      messages.push(all('testNetworkOk', { stations: known.length }));
    } catch (err) {
      resolveError = err;
      await refreshStatus();
      return all('testStationError', (l) => ({ station: 'MTA', error: errorText(err, l) }));
    }
    await resolveConfig();
    await publishDiscoveredDevices().catch(() => {});
    let failure = null;
    if (followedStations.length > 0) {
      try {
        await readFollowed(followedStations);
      } catch (err) {
        failure = err;
      }
    }
    for (const followed of followedStations) {
      const snapshot = snapshots.get(followed.key);
      if (!snapshot || (failure && now() - snapshot.readAt > SNAPSHOT_MAX_AGE_MS)) {
        messages.push(
          all('testStationError', (l) => ({
            station: followed.name,
            error: errorText(failure, l),
          })),
        );
        continue;
      }
      const [first] = upcomingPassages(snapshot.passages, now());
      messages.push(
        all('testStation', (l) => ({
          station: followed.name,
          count: snapshot.passages.length,
          next: first ? `${first.line} ${passageWhen(first, { language: l, now: now() })}` : '–',
        })),
      );
    }
    try {
      const current = await readTrafficNow();
      lines.forEach((line) => {
        const { state } = lineTraffic(current.data, line.id, now());
        messages.push(
          all('testLine', (l) => ({ line: lineLabel(line, l), state: lineStateText(state, l) })),
        );
      });
    } catch (err) {
      messages.push(all('testTrafficError', (l) => ({ error: errorText(err, l) })));
    }
    notFound.forEach((name) => messages.push(all('unknownEntry', { name })));
    refreshWidgets(Object.values(WIDGETS));
    await refreshStatus();
    return Object.fromEntries(
      LANGUAGES.map((l) => [
        l,
        messages
          .map((entry) => entry[l])
          .join(' · ')
          .slice(0, 1000),
      ]),
    );
  });

  gladys.onAction(ACTIONS.SEARCH_STATION, async (fields = {}) => {
    const query = typeof fields.query === 'string' ? fields.query.trim() : '';
    if (query.length < 2) {
      return all('searchTooShort');
    }
    const found = searchStations(await stations.stations(), query);
    if (found.length === 0) {
      return all('searchNone', { query: query.slice(0, 60) });
    }
    const blocks = found.map((station) => {
      const names = station.lines.map((id) => lineById(id).name);
      return `• ${station.label} · ${station.borough} [${station.ids.join(', ')}] → ${names.join(' ') || '–'}`;
    });
    return all('searchFound', { list: clipLines(blocks.join('\n'), ACTION_TEXT_MAX - 300) });
  });

  // --- Stations added with the buttons ------------------------------------------------

  const field = (value) => (typeof value === 'string' ? value.trim() : '');

  /**
   * @description Change the added stations, one change after the other: two
   * quick buttons never lose a station. Applied in memory once Gladys saved it.
   * @param {Function} change - `(added) => Promise<{ next?, message }>`: the new
   * list (none: nothing to save) and the answer, or a function of nothing
   * giving it once the stations are read.
   * @returns {Promise<object>} The answer.
   */
  function changeAddedStations(change) {
    const run = writingStations.then(async () => {
      const { next, message } = await change(config.addedStations);
      if (next) {
        await gladys.setConfig({ [INTERNAL_KEYS.addedStations]: next });
        rawConfig = { ...rawConfig, [INTERNAL_KEYS.addedStations]: next };
        config = normalizeConfig(rawConfig);
        await resolveConfig();
        await publishDiscoveredDevices().catch((err) =>
          logger.warn(`Unable to offer the devices: ${err.message}`),
        );
        // Only the new station is due: it has no reading yet.
        await readStations();
      }
      return typeof message === 'function' ? message() : message;
    });
    writingStations = run.catch(() => {});
    return run;
  }

  /**
   * @description How a station of the configuration reads in "List the stations".
   * @param {object} entry - A station of `config.stations`.
   * @param {number} index - Its position.
   * @param {string} lang - The language.
   * @returns {string} "2. Bedford Av (L) (form, station 2)".
   */
  function entryText(entry, index, lang) {
    const followed = entries[index];
    const typed = [entry.station, entry.line, entry.direction && `→ ${entry.direction}`]
      .filter(Boolean)
      .join(' ');
    const notes = [
      entry.slot ? t('stationFromForm', lang, { slot: entry.slot }) : '',
      entries.length && !followed ? t('stationUnknownMark', lang) : '',
    ].filter(Boolean);
    const name = followed?.name ?? typed;
    return `${index + 1}. ${name}${notes.length ? ` (${notes.join(', ')})` : ''}`;
  }

  gladys.onAction(ACTIONS.ADD_STATION, async (fields = {}) => {
    const entry = {
      station: field(fields.station),
      line: field(fields.line),
      direction: field(fields.direction),
    };
    if (entry.station.length < 2) {
      return all('searchTooShort');
    }
    return changeAddedStations(async (added) => {
      if (added.length >= MAX_ADDED_STATIONS) {
        return { message: all('stationsFull', { max: MAX_ADDED_STATIONS }) };
      }
      let followed;
      try {
        followed = await resolveEntry(entry);
      } catch (err) {
        return {
          message: all('testStationError', (l) => ({ station: 'MTA', error: errorText(err, l) })),
        };
      }
      if (followed.unknown) {
        return { message: all('statusNotFound', { names: followed.unknown.slice(0, 60) }) };
      }
      if (followedStations.some((other) => other.key === followed.key)) {
        return { message: all('stationAlreadyFollowed', { name: followed.name }) };
      }
      // Stored as resolved: the complex id of the station and the route id.
      const stored = {
        station: `complex:${followed.station.id}`,
        line: followed.line?.id ?? '',
        direction: entry.direction,
      };
      logger.info(`Station added: ${followed.name}`);
      return {
        next: [...added, stored],
        message: () => all('stationAdded', { name: followed.name, count: followedStations.length }),
      };
    });
  });

  gladys.onAction(ACTIONS.REMOVE_STATION, async (fields = {}) => {
    const query = field(fields.station);
    if (!query) {
      return all('stationRemoveUnknown', { query });
    }
    return changeAddedStations(async (added) => {
      const number =
        /^#?\d+$/.test(query) && query.length <= 3 ? Number(query.replace('#', '')) : null;
      let found;
      if (number !== null) {
        found = config.stations[number - 1] ? [number - 1] : [];
      } else {
        const wanted = fold(query);
        found = config.stations
          .map((entry, index) => ({ entry, index, followed: entries[index] }))
          .filter(
            ({ entry, followed }) =>
              fold(entry.station) === wanted ||
              (followed &&
                (fold(followed.name) === wanted ||
                  fold(followed.station.label) === wanted ||
                  followed.station.names.some((name) => fold(name) === wanted))),
          )
          .map(({ index }) => index);
        // The same name in the form and in the added stations: the added one.
        const fromButtons = found.filter((index) => !config.stations[index].slot);
        found = fromButtons.length > 0 ? fromButtons : found;
      }
      if (found.length === 0) {
        return { message: all('stationRemoveUnknown', { query: query.slice(0, 60) }) };
      }
      if (found.length > 1) {
        return { message: all('stationRemoveAmbiguous', { query: query.slice(0, 60) }) };
      }
      const entry = config.stations[found[0]];
      const name = entries[found[0]]?.name ?? entry.station;
      if (entry.slot) {
        return { message: all('stationInForm', { name, slot: entry.slot }) };
      }
      logger.info(`Station removed: ${name}`);
      return {
        next: added.filter((_, index) => index !== entry.added - 1),
        message: all('stationRemoved', { name }),
      };
    });
  });

  gladys.onAction(ACTIONS.LIST_STATIONS, async () => {
    if (config.stations.length === 0) {
      return all('stationsNone');
    }
    return all('stationsList', (l) => ({
      count: config.stations.length,
      list: clipLines(
        config.stations.map((entry, index) => entryText(entry, index, l)).join('\n'),
        ACTION_TEXT_MAX - 100,
      ),
    }));
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    const report = {
      version: VERSION,
      interval: config.interval,
      language: config.language,
      stations: followedStations.map((followed) => {
        const snapshot = snapshots.get(followed.key);
        return {
          slot: followed.slot,
          added: followed.added,
          key: followed.key,
          station: {
            id: followed.station.id,
            label: followed.station.label,
            ids: followed.station.ids,
            lines: followed.station.lines,
          },
          line: followed.line?.id ?? null,
          direction: followed.direction,
          created: createdDevices.has(followed.deviceId),
          readAt: snapshot ? new Date(snapshot.readAt).toISOString() : null,
          departures: snapshot?.passages
            .slice(0, 6)
            .map(
              (p) =>
                `${p.lineId}>${p.destination} ${p.platform} ${new Date(p.at).toISOString().slice(11, 16)}Z` +
                `${p.assigned ? '' : ' sched'}`,
            ),
        };
      }),
      stationsError: stationsError?.message ?? null,
      feeds: Object.fromEntries(
        [...feeds.entries()].map(([path, kept]) => [
          path,
          {
            readAt: new Date(kept.readAt).toISOString(),
            trips: kept.feed.tripUpdates.length,
            timestamp: kept.feed.timestamp,
          },
        ]),
      ),
      lines: lines.map((line) => {
        const current = traffic.data ? lineTraffic(traffic.data, line.id, now()) : null;
        return {
          id: line.id,
          created: createdDevices.has(line.deviceId),
          state: current?.state ?? null,
          alerts: current?.messages.length ?? null,
        };
      }),
      notFound,
      alerts: {
        readAt: traffic.readAt ? new Date(traffic.readAt).toISOString() : null,
        messages: traffic.data?.messages.length ?? null,
        error: traffic.error?.message ?? null,
      },
      stationList: stations.describe(),
      resolveError: resolveError?.message ?? null,
      requests: api.requests,
    };
    const json = JSON.stringify(report);
    const count = Math.max(1, Math.ceil(json.length / DIAGNOSTIC_CHUNK));
    for (let chunk = 0; chunk < count; chunk += 1) {
      logger.info(
        `MTA diagnostic ${chunk + 1}/${count}: ${json.slice(chunk * DIAGNOSTIC_CHUNK, (chunk + 1) * DIAGNOSTIC_CHUNK)}`,
      );
    }
    return all('diagnosticDone', { count });
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await resolveConfig();
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    for (const followed of followedStations) {
      await publishStationStates(followed);
    }
    if (traffic.data) {
      await digestTraffic();
    } else if (lines.length > 0) {
      await trafficTick();
    }
    refreshWidgets(Object.values(WIDGETS));
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      rawConfig = raw ?? {};
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        // The form values may lack the internal keys: never forget the added
        // stations, the next button would save the list without them.
        rawConfig = {
          [INTERNAL_KEYS.addedStations]: rawConfig[INTERNAL_KEYS.addedStations],
          ...fallback,
        };
        config = normalizeConfig(rawConfig);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (raw) => {
    await loadConfig(raw);
    lastDiscovery = null;
    boards.clear();
    snapshots.clear();
    stationsError = null;
    logger.info('Configuration updated');
    await applyConfig();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await loadConfig();
      await store.load();
      await refreshCreatedDevices();
      lastStatus = null;
      lastDiscovery = null;
      await applyConfig();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearInterval(stationTimer);
    clearInterval(trafficTimer);
    clearInterval(reminderTimer);
    clearTimeout(resolveTimer);
    await store.save();
  });

  return {
    store,
    api,
    readStations,
    trafficTick,
    checkReminders,
    applyConfig,
    getConfig: () => config,
    getStations: () => followedStations,
    getLines: () => lines,
    getSnapshot: (key) => snapshots.get(key),
    getTraffic: () => traffic,
    whenReady: () => startup,
  };
}

export {
  createApp,
  ACTIONS,
  SCENE_ACTIONS,
  IDLE_INTERVAL_MS,
  TRAFFIC_INTERVAL_MS,
  SNAPSHOT_MAX_AGE_MS,
};
