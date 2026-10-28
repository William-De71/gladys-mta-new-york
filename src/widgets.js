// -----------------------------------------------------------------------------
// Dashboard widgets of the MTA integration.
//
//   - `departures`  the next trains of a station, like the countdown clocks,
//                   compact: one row per line and destination, its next
//                   trains on one line — 1 · 9 · 17 min —, the row in grey
//                   when the next train is only scheduled (no train put on
//                   it yet). A followed station (chosen among the devices),
//                   several (the devices of one station merged, a row per
//                   station otherwise), or any station typed in the widget
//                   settings (with an optional line);
//   - `traffic`     the service status of lines — good service, notice,
//                   planned work, delays, suspended — then their alerts
//                   under way and coming; a tap opens the full text. The
//                   followed lines, the ones typed in the settings, or the
//                   lines of the followed stations by default.
// Every content credits the MTA and the time of the reading.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, lineStateText, passageShort, lineLabel } from './i18n.js';
import { minutesLeft, routeOf, upcomingPassages } from './departures.js';
import { rank } from './traffic.js';
import { formatTime, localClock, NETWORK_TIME_ZONE } from './time.js';

const WIDGETS = {
  DEPARTURES: 'departures',
  TRAFFIC: 'traffic',
};

const TTL_SECONDS = {
  departures: 60,
  idle: 300,
  traffic: 180,
  message: 300,
};

const BOARD_COUNT = { min: 1, max: 8, default: 6 };
// Characters a status row holds on one line in a dashboard column: beyond,
// the core cuts the value. A route then drops its last passages.
const ROW_CHARACTERS = 46;
const MAX_LIST_ITEMS = 8;
const MAX_STATUS_ITEMS = 10;
const STATE_COLORS = {
  unknown: WIDGET_COLORS.NEUTRAL,
  normal: WIDGET_COLORS.SUCCESS,
  info: WIDGET_COLORS.INFO,
  planned: WIDGET_COLORS.PRIMARY,
  disrupted: WIDGET_COLORS.WARNING,
  suspended: WIDGET_COLORS.DANGER,
};
const DATE_LOCALES = { en: 'en-US', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('Far Rockaway-Mott Av', 12); // -> 'Far Rockaw…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description Read a bounded integer setting.
 * @param {unknown} raw - The raw setting.
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 */
function readCount(raw, bounds) {
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL_SECONDS.message) {
  return { ttl_seconds: ttl, components: [{ type: 'text', variant: 'body', text: message }] };
}

/**
 * @description The rows of the "departures" widget: one per line and
 * destination, its next passages on one line, soonest route first.
 * @param {object[]} passages - The passages to come, soonest first.
 * @returns {object[][]} The passages of each route.
 */
function routesOf(passages) {
  const byRoute = new Map();
  for (const passage of passages) {
    const route = routeOf(passage);
    byRoute.set(route, [...(byRoute.get(route) ?? []), passage]);
  }
  return [...byRoute.values()];
}

/**
 * @description The times of one route, as on the countdown clocks, on one
 * line: "1 · 9 · 17 min", "Arriving · 12 min".
 * @param {object[]} passages - The departures of the route.
 * @param {object} options - `{ language, now }`.
 * @returns {string} The value of the row.
 */
function routeValue(passages, options) {
  // A run of waits shares its unit: "10 · 33 min · 11:29".
  const parts = [];
  let run = [];
  const flush = () => {
    if (run.length) {
      parts.push(`${run.join(' · ')} ${t('minutesShort', options.language)}`);
      run = [];
    }
  };
  for (const passage of passages) {
    const minutes = minutesLeft(passage, options.now);
    if (minutes > 0 && minutes < 60) {
      run.push(String(minutes));
      continue;
    }
    flush();
    parts.push(passageShort(passage, options));
  }
  flush();
  return clip(parts.join(' · '), 40);
}

/**
 * @description The rows of one station: one compact row per line and
 * destination, soonest first, each row cut to one line.
 * @param {object[]} upcoming - The departures to come (soonest first).
 * @param {number} count - How many routes (rows).
 * @param {object} options - `{ language, now }`.
 * @returns {object[]} The rows.
 */
function boardRows(upcoming, count, options) {
  return routesOf(upcoming)
    .slice(0, count)
    .map((route) => {
      const [next] = route;
      const label = clip(next.destination ? `${next.line} → ${next.destination}` : next.line, 40);
      let shown = route;
      let value = routeValue(shown, options);
      while (shown.length > 1 && label.length + value.length > ROW_CHARACTERS) {
        shown = shown.slice(0, -1);
        value = routeValue(shown, options);
      }
      return {
        label,
        value,
        color: next.assigned ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
      };
    });
}

/**
 * @description The "departures" widget: the station, then one compact row
 * per line and destination, like the countdown clocks. With several stations
 * (`boards`), still one heading and one list (the content budget of the core
 * allows one status list and two texts): each station opens with a row of
 * its own — its name and the time of its reading —, then its routes.
 * @param {object} options - Options.
 * @param {string} [options.title] - The name of the station.
 * @param {object[]} [options.passages] - Its departures.
 * @param {number} [options.readAt] - When they were read (ms).
 * @param {object[]} [options.boards] - Several stations instead:
 * `[{ title, label, passages, readAt }]`, `label` the short name of the station.
 * @param {number} options.count - How many routes (rows) to show per station.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @returns {object} The content.
 */
function buildDeparturesWidget({
  title,
  passages,
  readAt,
  boards = [{ title, passages, readAt }],
  count,
  language,
  now,
}) {
  const options = { language, now };
  // A station takes a row of its own and at least one route.
  const shown = boards.slice(0, Math.floor(MAX_STATUS_ITEMS / 2));
  const several = shown.length > 1;
  const nameOf = (board) => board.label ?? board.title;
  const headingText = several ? [...new Set(shown.map(nameOf))].join(' · ') : shown[0].title;
  const heading = { type: 'text', variant: 'heading', text: clip(headingText, 40) };
  // The oldest reading: the widget never claims fresher data than it shows.
  const oldest = Math.min(...shown.map((board) => board.readAt));
  const updated = t('updatedAt', language, { time: formatTime(oldest) });
  const upcomingOf = (board) => upcomingPassages(board.passages, now);
  const silent = () => t('noPassage', language);
  if (shown.every((board) => upcomingOf(board).length === 0)) {
    const reason = t('noPassage', language);
    return {
      ttl_seconds: TTL_SECONDS.idle,
      components: [heading, { type: 'text', variant: 'body', text: `${reason}. ${updated}.` }],
    };
  }
  // The routes of each station share what the station rows leave of the list.
  const perStop = several
    ? Math.max(1, Math.min(count, Math.floor((MAX_STATUS_ITEMS - shown.length) / shown.length)))
    : Math.min(count, MAX_STATUS_ITEMS);
  const items = [];
  for (const board of shown) {
    const upcoming = upcomingOf(board);
    if (several) {
      items.push({
        icon: 'map-pin',
        label: clip(nameOf(board), 40),
        value: clip(
          upcoming.length ? t('readAt', language, { time: formatTime(board.readAt) }) : silent(),
          40,
        ),
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
    items.push(...boardRows(upcoming, perStop, options));
  }
  // With several stations, each station row carries its own reading time.
  return {
    ttl_seconds: TTL_SECONDS.departures,
    components: [
      heading,
      { type: 'text', variant: 'caption', text: clip(several ? 'MTA' : updated, 80) },
      { type: 'status', items },
    ],
  };
}

/**
 * @description "10/31" in English, "31/10" in the other languages: the day
 * of an instant in New York.
 * @param {number|null} instant - The instant (ms).
 * @param {string} language - The language.
 * @returns {string} The day and month, '' when none.
 */
function shortDate(instant, language) {
  if (!Number.isFinite(instant)) {
    return '';
  }
  return new Intl.DateTimeFormat(DATE_LOCALES[language] ?? 'en-US', {
    timeZone: NETWORK_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(instant));
}

/**
 * @description A date of an alert: "21:30" today, "11/02 04:30" another day.
 * @param {number|null} instant - The instant (ms).
 * @param {number} now - Now (ms).
 * @param {string} language - The language.
 * @returns {string} The date, '' when none.
 */
function dateText(instant, now, language) {
  if (!Number.isFinite(instant)) {
    return '';
  }
  const time = formatTime(instant);
  return localClock(instant).date === localClock(now).date
    ? time
    : `${shortDate(instant, language)} ${time}`;
}

/**
 * @description The period of an alert: the hours the MTA writes ("Nov 6 - 8,
 * Fri 9:45 PM to Sun 10:00 PM"), else "11/02 04:30 → 11/03 02:00", "from
 * 07/15 04:00" when its end is far.
 * @param {object} message - The alert.
 * @param {number} now - Now (ms).
 * @param {string} language - The language.
 * @returns {string} The period.
 */
function periodText(message, now, language) {
  if (message.hours) {
    return message.hours;
  }
  const start = dateText(message.start, now, language);
  const end = dateText(message.end, now, language);
  // An end months away ("until further notice") says little.
  const farEnd = !Number.isFinite(message.end) || message.end - now > 60 * 24 * 3600 * 1000;
  if (start && end && !farEnd) {
    return t('periodFromTo', language, { start, end });
  }
  return start ? t('periodFrom', language, { start }) : '';
}

/**
 * @description The "traffic" widget.
 * @param {object} options - Options.
 * @param {Array<{ line: object, traffic: object }>} options.lines - The lines and their traffic.
 * @param {number|null} options.readAt - When the traffic was read.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @returns {object} The content.
 */
function buildTrafficWidget({ lines, readAt, language, now }) {
  const components = [
    { type: 'text', variant: 'heading', text: t('trafficTitle', language) },
    {
      type: 'status',
      items: lines.slice(0, MAX_STATUS_ITEMS).map(({ line, traffic }) => ({
        label: clip(lineLabel(line, language), 40),
        value: clip(lineStateText(traffic.state, language), 40),
        color: STATE_COLORS[traffic.state] ?? WIDGET_COLORS.NEUTRAL,
      })),
    },
  ];
  // One card per message, even when it covers several of the lines; the
  // messages under way, then the coming ones.
  const grouped = new Map();
  for (const { line, traffic } of lines) {
    // The badge holds a few characters: the names on the trains ("A", "S").
    const label = line.name;
    const listed = [
      ...traffic.messages.map((message) => ({ message, coming: false })),
      ...(traffic.upcoming ?? []).map((message) => ({ message, coming: true })),
    ];
    for (const { message, coming } of listed) {
      const entry = grouped.get(message.id) ?? { message, coming, names: [] };
      if (!entry.names.includes(label)) {
        entry.names.push(label);
      }
      grouped.set(message.id, entry);
    }
  }
  const items = [...grouped.values()].sort(
    (a, b) =>
      Number(a.coming) - Number(b.coming) ||
      rank(b.message.state) - rank(a.message.state) ||
      (a.coming
        ? (a.message.start ?? 0) - (b.message.start ?? 0)
        : (b.message.start ?? 0) - (a.message.start ?? 0)),
  );
  if (items.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: items.slice(0, MAX_LIST_ITEMS).map(({ message, coming, names }) => {
        const item = {
          title: clip(message.title || names.join(', '), 60),
          subtitle: clip(
            [
              coming ? t('upcomingState', language) : t(`kind_${message.state}`, language),
              periodText(message, now, language),
            ]
              .filter(Boolean)
              .join(' · '),
            60,
          ),
          badge: {
            text: clip(names.join(' · '), 16),
            color: coming
              ? WIDGET_COLORS.NEUTRAL
              : (STATE_COLORS[message.state] ?? WIDGET_COLORS.NEUTRAL),
          },
        };
        // The hours the MTA writes do not fit the subtitle: they open the text.
        const description = [message.hours, message.text].filter(Boolean).join('\n');
        if (description) {
          item.description = clip(description, 2000);
        }
        if (/^https:\/\//.test(message.url) && message.url.length <= 2048) {
          item.links = [{ url: message.url, label: clip(t('moreInfo', language), 24) }];
        }
        return item;
      }),
    });
  }
  // Two texts at most: without a message, the body carries the update time.
  const updated = readAt ? t('updatedAt', language, { time: formatTime(readAt) }) : '';
  if (items.length === 0) {
    components.push({
      type: 'text',
      variant: 'body',
      text: [t('noMessage', language), updated && `${updated}.`].filter(Boolean).join(' '),
    });
  } else if (updated) {
    components.push({ type: 'text', variant: 'caption', text: updated });
  }
  return { ttl_seconds: TTL_SECONDS.traffic, components };
}

export {
  WIDGETS,
  TTL_SECONDS,
  BOARD_COUNT,
  STATE_COLORS,
  clip,
  messageContent,
  readCount,
  routeValue,
  shortDate,
  dateText,
  periodText,
  buildDeparturesWidget,
  buildTrafficWidget,
};
