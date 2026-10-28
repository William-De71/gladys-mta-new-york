// -----------------------------------------------------------------------------
// Scene triggers (pure logic) and scene action outputs.
//
// Triggers (one event per transition, never a periodic snapshot):
//   - `departure_soon`   a train of a followed station leaves in N minutes (2,
//                        3, 5, 10, 15 or 20): checked on each reading and
//                        every 30 seconds on the last one, fired close to the
//                        mark, once per train. A train is matched by its trip,
//                        or by line, side, destination and time (± 2 min);
//   - `line_disrupted`   a followed line gets delays, a reroute or a
//                        suspension that was not planned;
//   - `line_restored`    it is back to good service (or planned work only);
//   - `service_alert`    the MTA publishes a new alert about a followed line
//                        (delays, planned work, notices), under way or coming.
// The feeds of the MTA mark no train as cancelled: there is no trigger for it.
//
// What was seen is kept in /data (`seen`): a restart never fires the same
// event twice, and the first reading of a station or a line is a baseline
// (no event replays what was already there). A scene action or a widget
// never fires an event.
// -----------------------------------------------------------------------------

import { t, lineStateText, passageWhen, lineLabel } from './i18n.js';
import { routeOf, minutesLeft, upcomingPassages } from './departures.js';
import { lineTraffic, seriousMessages, SERIOUS } from './traffic.js';
import { formatTime, localClock } from './time.js';

const TRIGGERS = {
  DEPARTURE_SOON: 'departure_soon',
  LINE_DISRUPTED: 'line_disrupted',
  LINE_RESTORED: 'line_restored',
  SERVICE_ALERT: 'service_alert',
};
const REMINDER_MINUTES = [2, 3, 5, 10, 15, 20];
const REMINDER_MATCH_MS = 2 * 60 * 1000;
const REMINDER_KEEP_MS = 10 * 60 * 1000;
// An alert seen is remembered this long after it disappeared: an alert the
// feed drops for a moment must not fire again.
const MESSAGE_KEEP_MS = 7 * 24 * 3600 * 1000;
// At most this many new alerts fire per line and reading.
const MAX_MESSAGES_PER_LINE = 5;
const SUMMARY_MAX = 1000;
const MESSAGE_MAX = 1000;
const OUTPUT_MAX = 10000;
const NEXT_DEPARTURES_OUTPUTS = [
  'station_name',
  'found',
  'line',
  'destination',
  'minutes',
  'time',
  'scheduled',
  'following_minutes',
  'summary',
];
const LINE_STATUS_OUTPUTS = [
  'line_name',
  'state',
  'state_label',
  'disrupted',
  'alert_count',
  'title',
  'message',
  'summary',
];

/**
 * @description Truncate a text, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description How close to a mark a reminder may fire (minutes before it).
 * @param {number} mark - The mark (minutes).
 * @returns {number} The tolerance: the marks never overlap.
 */
function tolerance(mark) {
  if (mark <= 3) {
    return 1;
  }
  return mark <= 5 ? 1.5 : 3;
}

/**
 * @description The reminders due on the departures of a station.
 * @param {object} options - Options.
 * @param {object[]} options.passages - The departures of the station.
 * @param {object[]} [options.fired] - The reminders already fired `[{ route, mark, at }]`,
 * undefined before the first reading of the station: a baseline, the
 * reminders already due are remembered without firing (a busy station would
 * fire dozens).
 * @param {number} options.now - Now (ms).
 * @returns {{ due: Array<{ passage: object, mark: number }>, fired: object[] }}
 * The reminders to fire and the memory to keep.
 */
function detectReminders({ passages, fired, now }) {
  const baseline = !Array.isArray(fired);
  const memory = (fired ?? []).filter((entry) => entry.at > now - REMINDER_KEEP_MS);
  const due = [];
  for (const passage of upcomingPassages(passages, now)) {
    const left = (passage.at - now) / 60000;
    const route = routeOf(passage);
    for (const mark of REMINDER_MINUTES) {
      if (left > mark || left <= mark - tolerance(mark)) {
        continue;
      }
      const known = memory.some(
        (entry) =>
          entry.mark === mark &&
          ((passage.trip && entry.trip === passage.trip) ||
            (entry.route === route && Math.abs(entry.at - passage.at) <= REMINDER_MATCH_MS)),
      );
      if (!known) {
        memory.push({ route, mark, at: passage.at, trip: passage.trip });
        if (!baseline) {
          due.push({ passage, mark });
        }
      }
    }
  }
  return { due, fired: memory };
}

/**
 * @description What changed on the followed lines since the last reading.
 * @param {object} options - Options.
 * @param {object[]} options.lines - The followed lines (`id`).
 * @param {object} options.traffic - parseTraffic().
 * @param {object} [options.seen] - Per line id `{ state, messages: { id: lastSeen } }`.
 * @param {number} options.now - Now (ms).
 * @returns {{ changes: object[], seen: object }} `{ key, line, traffic,
 * message? }` per event, and the memory to keep.
 */
function detectLineChanges({ lines, traffic, seen = {}, now }) {
  const changes = [];
  const next = {};
  for (const line of lines) {
    const current = lineTraffic(traffic, line.id, now);
    const before = seen[line.id];
    const messages = {};
    for (const [key, at] of Object.entries(before?.messages ?? {})) {
      if (at > now - MESSAGE_KEEP_MS) {
        messages[key] = at;
      }
    }
    const listed = [...current.messages, ...current.upcoming];
    const fresh = listed.filter((message) => !messages[message.id]);
    listed.forEach((message) => {
      messages[message.id] = now;
    });
    const { state } = current;
    next[line.id] = { state, messages };
    if (!before) {
      continue;
    }
    const wasSerious = SERIOUS.includes(before.state);
    const isSerious = SERIOUS.includes(state);
    if (isSerious && !wasSerious) {
      changes.push({
        key: TRIGGERS.LINE_DISRUPTED,
        line,
        traffic: current,
        message: seriousMessages(current)[0] ?? null,
      });
    } else if (wasSerious && !isSerious) {
      changes.push({ key: TRIGGERS.LINE_RESTORED, line, traffic: current });
    }
    // In the order of their start.
    fresh
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
      .slice(0, MAX_MESSAGES_PER_LINE)
      .forEach((message) => {
        changes.push({ key: TRIGGERS.SERVICE_ALERT, line, traffic: current, message });
      });
  }
  return { changes, seen: next };
}

// --- Payloads ------------------------------------------------------------------------

/**
 * @description The data of a `departure_soon` event.
 * @param {object} followed - The followed station (`name`, `deviceId`, `station`).
 * @param {object} passage - The departure.
 * @param {number} mark - The minutes of the reminder.
 * @param {object} options - `{ language }`.
 * @returns {object} Flat scalars.
 */
function reminderData(followed, passage, mark, { language }) {
  const time = formatTime(passage.at);
  return {
    station: followed.deviceId,
    minutes: String(mark),
    station_name: followed.name,
    line: passage.line,
    destination: passage.destination,
    direction: passage.sideLabel,
    time,
    scheduled: !passage.assigned,
    summary: clip(
      t('summarySoon', language, {
        line: passage.line,
        destination: passage.destination,
        station: followed.station.label,
        minutes: mark,
        time,
      }),
      SUMMARY_MAX,
    ),
  };
}

/**
 * @description A date of an alert: "10/28 22:30" (month first, as in New York).
 * @param {number|null} instant - The instant (ms).
 * @returns {string} The day and time, '' when none.
 */
function messageDate(instant) {
  if (!Number.isFinite(instant)) {
    return '';
  }
  const [, month, day] = localClock(instant).date.split('-');
  return `${month}/${day} ${formatTime(instant)}`;
}

/**
 * @description The data of a line event.
 * @param {object} change - From detectLineChanges, with `deviceId` on its line.
 * @param {object} options - `{ language }`.
 * @returns {{ key: string, data: object }} The event.
 */
function lineEvent(change, { language }) {
  const { line, traffic, message } = change;
  const label = lineLabel(line, language);
  const base = { line: line.deviceId, line_name: label };
  const stateLabel = lineStateText(traffic.state, language);
  if (change.key === TRIGGERS.LINE_RESTORED) {
    return {
      key: change.key,
      data: {
        ...base,
        state: traffic.state,
        summary: clip(
          t('summaryRestored', language, { line: label, state: stateLabel }),
          SUMMARY_MAX,
        ),
      },
    };
  }
  const title = message?.title ?? '';
  const details = {
    title,
    message: clip(message?.text ?? '', MESSAGE_MAX),
    alert_type: message?.type ?? '',
    hours: message?.hours ?? '',
    start: message ? messageDate(message.start) : '',
    end: message ? messageDate(message.end) : '',
  };
  if (change.key === TRIGGERS.LINE_DISRUPTED) {
    return {
      key: change.key,
      data: {
        ...base,
        state: traffic.state,
        ...details,
        summary: clip(
          t(title ? 'summaryDisruptedTitle' : 'summaryDisrupted', language, {
            line: label,
            state: stateLabel,
            title,
          }),
          SUMMARY_MAX,
        ),
      },
    };
  }
  return {
    key: TRIGGERS.SERVICE_ALERT,
    data: {
      ...base,
      kind: message.state,
      ...details,
      summary: clip(
        t('summaryMessage', language, {
          line: label,
          kind: t(`kind_${message.state}`, language).toLowerCase(),
          title,
        }),
        SUMMARY_MAX,
      ),
    },
  };
}

// --- Scene action outputs ------------------------------------------------------------

/**
 * @description The outputs of `get_next_departures`.
 * @param {object} options - Options.
 * @param {object} options.followed - The followed station.
 * @param {object[]} options.passages - Its departures.
 * @param {number} options.now - Now (ms).
 * @param {string} options.language - Language of the summary.
 * @returns {object} The outputs.
 */
function nextDeparturesOutputs({ followed, passages, now, language }) {
  const [first, second] = upcomingPassages(passages, now);
  const outputs = {
    station_name: followed.name,
    found: Boolean(first),
    line: first?.line ?? '',
    destination: first?.destination ?? '',
    minutes: first ? minutesLeft(first, now) : -1,
    time: first ? formatTime(first.at) : '',
    scheduled: first ? !first.assigned : false,
    following_minutes: second ? minutesLeft(second, now) : -1,
  };
  let summary;
  if (first) {
    summary = t('outputNext', language, {
      station: followed.station.label,
      line: first.line,
      destination: first.destination,
      when: passageWhen(first, { language, now }),
    });
    if (second) {
      summary += ` ${t('outputFollowing', language, { when: passageWhen(second, { language, now }) })}`;
    }
  } else {
    summary = t('outputNone', language, { station: followed.station.label });
  }
  return { ...outputs, summary: clip(summary, OUTPUT_MAX) };
}

/**
 * @description The outputs of `get_line_status`.
 * @param {object} options - `{ line, traffic, language }`.
 * @returns {object} The outputs.
 */
function lineStatusOutputs({ line, traffic, language }) {
  const [first] = traffic.messages;
  const label = lineLabel(line, language);
  const stateLabel = lineStateText(traffic.state, language);
  const summary = first?.title
    ? t('summaryLineState', language, { line: label, state: stateLabel, title: first.title })
    : t('summaryLineStateOnly', language, { line: label, state: stateLabel });
  return {
    line_name: label,
    state: traffic.state,
    state_label: stateLabel,
    disrupted: SERIOUS.includes(traffic.state),
    alert_count: traffic.messages.length,
    title: first?.title ?? '',
    message: clip(first?.text ?? '', OUTPUT_MAX),
    summary: clip(summary, OUTPUT_MAX),
  };
}

/**
 * @description Keep only the declared outputs.
 * @param {object} outputs - The outputs.
 * @param {string[]} keys - The declared keys.
 * @returns {object} The outputs.
 */
const pick = (outputs, keys) => Object.fromEntries(keys.map((key) => [key, outputs[key]]));

export {
  TRIGGERS,
  REMINDER_MINUTES,
  NEXT_DEPARTURES_OUTPUTS,
  LINE_STATUS_OUTPUTS,
  tolerance,
  detectReminders,
  detectLineChanges,
  reminderData,
  messageDate,
  lineEvent,
  nextDeparturesOutputs,
  lineStatusOutputs,
  pick,
};
