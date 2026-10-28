// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen.
//
// "MTA <station> (<line> → <direction>)": one per followed station. Read-only
// features:
//   - `next`        text: the next departure, "A → Far Rockaway-Mott Av · 3 min";
//   - `wait`        duration (minutes): the wait of the next departure;
//   - `following`   duration (minutes): the wait of the one after.
//
// "MTA A train", "MTA 42 St Shuttle": one per followed line. Read-only
// features:
//   - `status`      text: "Delays: Downtown F/M trains are running with delays…";
//   - `messages`    counter: the alerts under way.
//
// External ids: the complex id of the station (the official one of the
// MTA, `611` for Times Sq-42 St), then the route id and the direction
// (`ext:mta-new-york:station:611_a_uptown`); the route id
// (`ext:mta-new-york:line:a`).
// `should_poll` stays false: the integration reads on its own timer.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { t, passageText, lineStateText, lineDeviceName } from './i18n.js';
import { slug } from './text.js';
import { minutesLeft, upcomingPassages } from './departures.js';

const DEVICE_TYPES = { STATION: 'station', LINE: 'line' };
const FEATURE_KEYS = {
  NEXT: 'next',
  WAIT: 'wait',
  FOLLOWING: 'following',
  STATUS: 'status',
  MESSAGES: 'messages',
};
const MAX_WAIT = 180;
const MAX_COUNT = 20;
const TEXT_MAX = 250;

/**
 * @description A code as a part of an external id.
 * @param {string} code - "611", "A", "GS".
 * @returns {string} "611", "a", "gs".
 */
const codeKey = (code) =>
  String(code)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * @description The identifier of a followed station.
 * @param {{ id: string }} station - The resolved station (complex id).
 * @param {{ id: string }|null} line - The resolved line, when set.
 * @param {string} direction - The direction typed, '' when none.
 * @returns {string} "611_a_uptown".
 * @example
 * stationKey({ id: '611' }, { id: 'A' }, ''); // '611_a'
 */
function stationKey(station, line, direction) {
  const parts = [codeKey(station.id)];
  if (line) {
    parts.push(codeKey(line.id));
  }
  const words = slug(direction, 24);
  if (words) {
    parts.push(words);
  }
  return parts.join('_');
}

/**
 * @description The name of a followed station: "Times Sq-42 St (A → Uptown)".
 * @param {object} followed - `{ station, line, direction }`.
 * @returns {string} The name.
 */
function followedName({ station, line, direction }) {
  const detail = [line?.name, direction && `→ ${direction}`].filter(Boolean).join(' ');
  return detail ? `${station.label} (${detail})` : station.label;
}

/**
 * @description The external ids of a followed station or line.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - DEVICE_TYPES.
 * @param {string} key - The station key, or the route id ("A").
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, type, key) =>
  gladys.externalIds(type, type === DEVICE_TYPES.LINE ? codeKey(key) : String(key).toLowerCase());

/**
 * @description What a device external id stands for.
 * @param {unknown} externalId - A device (or feature) external id.
 * @returns {{ type: string, key: string }|null} The type and key.
 * @example
 * parseExternalId('ext:mta-new-york:line:a'); // -> { type: 'line', key: 'a' }
 */
function parseExternalId(externalId) {
  // A feature id ends with ":<feature key>": the device key stops before it.
  const match = /:(station|line):([a-z0-9_-]+)(?::[a-z_]+)?$/.exec(String(externalId ?? ''));
  return match ? { type: match[1], key: match[2] } : null;
}

/**
 * @description A read-only feature.
 * @param {object} feature - Its fields.
 * @returns {object} The feature.
 */
const sensor = (feature) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...feature,
});

const textShape = {
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  keep_history: false,
  min: 0,
  max: 0,
};
const minutesShape = {
  category: DEVICE_FEATURE_CATEGORIES.DURATION,
  type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
  unit: DEVICE_FEATURE_UNITS.MINUTES,
  keep_history: false,
  min: 0,
  max: MAX_WAIT,
};
const counterShape = {
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
  min: 0,
  max: MAX_COUNT,
};

/**
 * @description Build the device of a followed station.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} followed - The followed station (`key`, `name`, `station`, `line`).
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildStationDevice(gladys, followed, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.STATION, followed.key);
  const params = [{ name: 'MTA_STATION', value: followed.station.label }];
  if (followed.line) {
    params.push({ name: 'MTA_LINE', value: followed.line.name });
  }
  if (followed.direction) {
    params.push({ name: 'MTA_DIRECTION', value: followed.direction });
  }
  return {
    name: t('stationDeviceName', language, { station: followed.name }),
    external_id: ids.device,
    model: 'MTA',
    should_poll: false,
    params,
    features: [
      sensor({
        name: t('featureNext', language),
        external_id: ids.feature(FEATURE_KEYS.NEXT),
        ...textShape,
      }),
      sensor({
        name: t('featureWait', language),
        external_id: ids.feature(FEATURE_KEYS.WAIT),
        ...minutesShape,
      }),
      sensor({
        name: t('featureFollowing', language),
        external_id: ids.feature(FEATURE_KEYS.FOLLOWING),
        ...minutesShape,
      }),
    ],
  };
}

/**
 * @description The states of a followed station. Without a departure (a
 * line closed at night, a feed silent), the waits are left untouched: a 0
 * would announce a train now.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} followed - The followed station.
 * @param {object[]} passages - Its departures (buildPassages).
 * @param {object} options - `{ language, now }`.
 * @returns {object[]} The states.
 */
function buildStationStates(gladys, followed, passages, { language, now }) {
  const ids = idsOf(gladys, DEVICE_TYPES.STATION, followed.key);
  const upcoming = upcomingPassages(passages, now);
  const states = [
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.NEXT),
      text: (upcoming[0]
        ? passageText(upcoming[0], { language, now })
        : t('noPassage', language)
      ).slice(0, TEXT_MAX),
    },
  ];
  [FEATURE_KEYS.WAIT, FEATURE_KEYS.FOLLOWING].forEach((key, index) => {
    if (upcoming[index]) {
      states.push({
        device_feature_external_id: ids.feature(key),
        state: Math.min(MAX_WAIT, minutesLeft(upcoming[index], now)),
      });
    }
  });
  return states;
}

/**
 * @description Build the device of a followed line.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} line - The line (lines.js).
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildLineDevice(gladys, line, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.LINE, line.id);
  return {
    name: lineDeviceName(line, language),
    external_id: ids.device,
    model: 'MTA',
    should_poll: false,
    params: [{ name: 'MTA_LINE', value: line.id }],
    features: [
      sensor({
        name: t('featureStatus', language),
        external_id: ids.feature(FEATURE_KEYS.STATUS),
        ...textShape,
      }),
      sensor({
        name: t('featureMessages', language),
        external_id: ids.feature(FEATURE_KEYS.MESSAGES),
        ...counterShape,
      }),
    ],
  };
}

/**
 * @description The one-line status of a line: "Delays: Downtown F/M trains…".
 * @param {{ state: string, messages: object[] }} traffic - lineTraffic().
 * @param {string} language - The language.
 * @returns {string} The status.
 */
function lineStatusText(traffic, language) {
  const state = lineStateText(traffic.state, language);
  const [latest] = traffic.messages;
  return latest?.title ? t('stateWithTitle', language, { state, title: latest.title }) : state;
}

/**
 * @description The states of a followed line.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ id: string }} line - The line.
 * @param {object} traffic - Its status (lineTraffic).
 * @param {string} language - Language of the text.
 * @returns {object[]} The states.
 */
function buildLineStates(gladys, line, traffic, language) {
  const ids = idsOf(gladys, DEVICE_TYPES.LINE, line.id);
  return [
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.STATUS),
      text: lineStatusText(traffic, language).slice(0, TEXT_MAX),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.MESSAGES),
      state: Math.min(MAX_COUNT, traffic.messages.length),
    },
  ];
}

export {
  DEVICE_TYPES,
  FEATURE_KEYS,
  MAX_WAIT,
  MAX_COUNT,
  codeKey,
  stationKey,
  followedName,
  idsOf,
  parseExternalId,
  buildStationDevice,
  buildStationStates,
  buildLineDevice,
  lineStatusText,
  buildLineStates,
};
