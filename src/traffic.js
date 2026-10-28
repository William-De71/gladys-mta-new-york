// -----------------------------------------------------------------------------
// The service status of the lines, read every 5 minutes from the GTFS-RT
// service alerts of the subway (camsys/subway-alerts):
//   - each alert names its lines (`informed_entity.route_id`), its periods
//     (Unix times), its texts in English (the header is the message, the
//     description the details and the ways around) and, in the "Mercury"
//     extension of the MTA, its type ("Delays", "Planned - Part Suspended",
//     "Station Notice"…) and its hours in words ("Nov 6 - 8, Fri 9:45 PM to
//     Sun 10:00 PM");
//   - its weight comes from its type: planned work ("Planned - …") ->
//     `planned`; a suspension -> `suspended`; delays, reduced service,
//     skipped stops, reroutes -> `disrupted`; notices, extra service,
//     boarding changes -> `info`. Without a type, from its words.
// States of a line, from the mildest: `unknown` (nothing read yet), `normal`,
// `info`, `planned`, `disrupted`, `suspended`: the heaviest alert under way.
// `disrupted` and `suspended` are the unplanned troubles (the scene trigger
// "line disrupted"). The texts stay in English: the MTA writes no other.
// -----------------------------------------------------------------------------

import { MINUTE_MS } from './time.js';
import { lineById } from './lines.js';

const STATES = ['unknown', 'normal', 'info', 'planned', 'disrupted', 'suspended'];
const SERIOUS = ['disrupted', 'suspended'];
// An alert starting this soon is shown as coming.
const UPCOMING_MS = 3 * 24 * 60 * MINUTE_MS;
const TEXT_MAX = 2000;
const TITLE_MAX = 140;
const SUSPENDED_WORDS = /\b(suspend(ed)?|suspension|not running|no trains?)\b/i;
const DISRUPTED_WORDS =
  /\b(delays?|delayed|reduced service|slow speeds?|skips?|skipped|reroute[ds]?|rerouting|express to local|local to express|running local|detour(ed)?|service change)\b/i;
const INFO_TYPES = /^(no scheduled service|station notice|extra service|boarding change|special)/i;

/**
 * @description A plain text: no tags, the line symbols of the MTA spelled
 * out ("[F][M]" -> "F/M"), its pictograms dropped ("[accessibility icon]",
 * "[airplane icon]": the words around say the same), blank lines dropped.
 * @param {unknown} value - The text.
 * @param {number} [max] - Its longest length.
 * @returns {string} The text.
 * @example
 * plainText('Downtown [F][M] trains are delayed.'); // -> 'Downtown F/M trains are delayed.'
 */
function plainText(value, max = TEXT_MAX) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\[[^\]]*\bicon\]\s*/gi, '')
    .replace(/\]\s*\[/g, '/')
    .replace(/\[([^\]]+)\]/g, '$1')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, max);
}

/**
 * @description A short title: the first sentence of the header.
 * @param {string} header - The header (plain).
 * @returns {string} At most TITLE_MAX characters.
 */
function titleOf(header) {
  const [firstLine = ''] = header.split('\n');
  const sentence = /^(.+?[.!?])(\s|$)/.exec(firstLine)?.[1] ?? firstLine;
  return sentence.length > TITLE_MAX ? `${sentence.slice(0, TITLE_MAX - 1)}…` : sentence;
}

/**
 * @description The weight of an alert.
 * @param {string} alertType - Its Mercury type, '' when none.
 * @param {string} text - Its header and description.
 * @returns {string} `info`, `planned`, `disrupted` or `suspended`.
 */
function alertState(alertType, text) {
  const type = String(alertType ?? '').trim();
  if (/^planned\b/i.test(type)) {
    return 'planned';
  }
  if (type && INFO_TYPES.test(type)) {
    return 'info';
  }
  const words = type || text;
  if (SUSPENDED_WORDS.test(words)) {
    return 'suspended';
  }
  return DISRUPTED_WORDS.test(words) ? 'disrupted' : 'info';
}

/**
 * @description The document of a message, when on https.
 * @param {unknown} value - The URL.
 * @returns {string} The URL, '' when none.
 */
function linkOf(value) {
  const url = String(value ?? '').trim();
  return /^https:\/\/\S+$/i.test(url) && url.length <= 2048 ? url : '';
}

/**
 * @description What is kept of an alert.
 * @param {object} alert - An alert of the feed.
 * @returns {object} `{ id, lineIds, state, type, title, text, url, periods,
 * hours }`, periods `[{ start, end }]` in ms (null when open).
 */
function messageOf(alert) {
  const header = plainText(alert.header, TITLE_MAX * 4);
  const description = plainText(alert.description);
  return {
    id: String(alert.id),
    lineIds: alert.routeIds.filter((id) => lineById(id)),
    state: alertState(alert.alertType, `${header} ${description}`),
    type: String(alert.alertType ?? ''),
    title: titleOf(header || description),
    text: [header, description].filter(Boolean).join('\n'),
    url: linkOf(alert.url),
    periods: alert.periods.map((period) => ({
      start: period.start ? period.start * 1000 : null,
      end: period.end ? period.end * 1000 : null,
    })),
    hours: plainText(alert.hours, 120),
  };
}

/**
 * @description Read the alerts.
 * @param {object} feed - decodeFeed() of the alerts.
 * @returns {{ messages: object[] }} The alerts about a line.
 */
function parseTraffic(feed) {
  return {
    messages: (feed?.alerts ?? [])
      .map(messageOf)
      .filter((message) => message.lineIds.length > 0 && message.title),
  };
}

/**
 * @description The rank of a state, for comparisons.
 * @param {string} state - A state.
 * @returns {number} Its position in STATES.
 */
const rank = (state) => STATES.indexOf(state);

/**
 * @description A message as it stands at an instant: under way (the period
 * holding now), coming (its next period) or over.
 * @param {object} message - The message.
 * @param {number} now - Now (ms).
 * @returns {object|null} The message with `start`, `end` and `coming`, null when over.
 */
function messageAt(message, now) {
  const periods = message.periods.length ? message.periods : [{ start: null, end: null }];
  const current = periods.find(
    (period) => (period.start ?? -Infinity) <= now && (period.end ?? Infinity) > now,
  );
  if (current) {
    return { ...message, start: current.start, end: current.end, coming: false };
  }
  const next = periods
    .filter((period) => period.start !== null && period.start > now)
    .sort((a, b) => a.start - b.start)[0];
  return next ? { ...message, start: next.start, end: next.end, coming: true } : null;
}

/**
 * @description The service status of one line.
 * @param {object|null} traffic - parseTraffic().
 * @param {string} lineId - The route id.
 * @param {number} now - Now (ms).
 * @returns {{ state: string, since: number|null, messages: object[], upcoming: object[] }}
 * Its state, the alerts under way (heaviest, then latest start first) and
 * the ones coming in the next three days (soonest first).
 */
function lineTraffic(traffic, lineId, now) {
  if (!traffic) {
    return { state: 'unknown', since: null, messages: [], upcoming: [] };
  }
  const own = traffic.messages
    .filter((message) => message.lineIds.includes(lineId))
    .map((message) => messageAt(message, now))
    .filter(Boolean);
  const messages = own
    .filter((message) => !message.coming)
    .sort((a, b) => rank(b.state) - rank(a.state) || (b.start ?? 0) - (a.start ?? 0));
  const upcoming = own
    .filter((message) => message.coming && message.start - now <= UPCOMING_MS)
    .sort((a, b) => a.start - b.start);
  const state = messages[0]?.state ?? 'normal';
  return {
    state,
    since: SERIOUS.includes(state) ? (messages[0].start ?? null) : null,
    messages,
    upcoming,
  };
}

/**
 * @description The alerts of a line about an unplanned trouble under way.
 * @param {{ messages: object[] }} line - lineTraffic().
 * @returns {object[]} The alerts.
 */
const seriousMessages = (line) => line.messages.filter((m) => SERIOUS.includes(m.state));

export {
  STATES,
  SERIOUS,
  UPCOMING_MS,
  plainText,
  titleOf,
  linkOf,
  alertState,
  messageOf,
  parseTraffic,
  rank,
  messageAt,
  lineTraffic,
  seriousMessages,
};
