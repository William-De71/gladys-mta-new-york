// -----------------------------------------------------------------------------
// Times of day.
//
// The feeds give Unix times. They are written in the time of New York, the
// time of the stations, of the countdown clocks and of the hours the MTA
// writes in its alerts, whatever the timezone of the Gladys instance.
// -----------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;
const NETWORK_TIME_ZONE = 'America/New_York';

/**
 * @description The local date and time of an instant in a timezone.
 * @param {number} instant - The instant, in ms.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {{ date: string, minutes: number }} `YYYY-MM-DD` and minutes since midnight.
 * @example
 * localClock(Date.parse('2026-10-28T14:00:00Z')); // 2026-10-28, 600
 */
function localClock(instant, timeZone = NETWORK_TIME_ZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * @description "07:42", in the time of New York.
 * @param {number|null} instant - The instant, in ms.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {string} The time, '' when none.
 */
function formatTime(instant, timeZone = NETWORK_TIME_ZONE) {
  if (!Number.isFinite(instant)) {
    return '';
  }
  const { minutes } = localClock(instant, timeZone);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export { MINUTE_MS, NETWORK_TIME_ZONE, localClock, formatTime };
