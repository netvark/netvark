/**
 * The temporal wire forms (SPEC 5.1, 5.2): RFC 3339 dates and date-times
 * that PostgreSQL stores as sent. Each restriction was captured on
 * PostgreSQL 14 and 18:
 *
 * - years 0001 to 9999 and real calendar days: `date` also takes BC dates,
 *   years beyond 9999, and `infinity`, which RFC 3339 cannot spell, and
 *   rejects `0000-01-01` and `2100-02-29`;
 * - seconds 00 to 59 and hours 00 to 23: `23:59:60` and `24:00:00` roll
 *   over to the next minute or day;
 * - at most six fraction digits, and only zeros past p for `timestamp(p)`
 *   and `timestamptz(p)`: PostgreSQL rounds a value to p digits, six
 *   without one, possibly into the next day (`9999-12-31 23:59:59.999999`
 *   stored in a `timestamp(3)` column is `10000-01-01 00:00:00`), while
 *   zeros keep the instant (`12:00:00.000` is `12:00:00` in `timestamp(0)`);
 * - `timestamp` takes no offset, which it would silently drop;
 *   `timestamptz` needs one, within ±15:59, beyond which PostgreSQL fails
 *   with 22009, and its instant must stay within the years above in UTC,
 *   the read form (`0001-01-01T00:00:00+01:00` is 1 BC in UTC).
 *
 * `T` and `Z` may be lower case, as RFC 3339 allows and PostgreSQL reads.
 * @ref https://www.rfc-editor.org/rfc/rfc3339#section-5.6
 * @ref https://www.postgresql.org/docs/18/datatype-datetime.html
 * @packageDocumentation
 */
import { SECOND_FRACTION_DIGITS } from './bounds';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([Zz])|([+-])(\d{2}):(\d{2}))?$/u;

const FIRST_YEAR = 1;
const LAST_YEAR = 9999;
const MONTHS = 12;
const LAST_HOUR = 23;
const LAST_MINUTE = 59;
const LAST_SECOND = 59;
const LAST_OFFSET_HOUR = 15;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const FEBRUARY = 2;
const DAYS_IN_MONTH: ReadonlyArray<number> = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
];
const LEAP_CYCLE = 4;
const CENTURY = 100;
const GREGORIAN_CYCLE = 400;

/** The proleptic Gregorian leap rule PostgreSQL uses. */
function isLeapYear(year: number): boolean {
  return (
    year % LEAP_CYCLE === 0 &&
    (year % CENTURY !== 0 || year % GREGORIAN_CYCLE === 0)
  );
}

function isCalendarDay(year: number, month: number, day: number): boolean {
  if (year < FIRST_YEAR || month < 1 || month > MONTHS || day < 1) {
    return false;
  }
  const leapDay = month === FEBRUARY && isLeapYear(year) ? 1 : 0;
  return day <= (DAYS_IN_MONTH[month - 1] ?? 0) + leapDay;
}

function isClockTime(hour: number, minute: number, second: number): boolean {
  return hour <= LAST_HOUR && minute <= LAST_MINUTE && second <= LAST_SECOND;
}

/** The parts of a date-time; `offset` is in minutes east of UTC, `undefined` without one. */
interface DateTimeParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly minuteOfDay: number;
  readonly offset: number | undefined;
}

function offsetOf(match: RegExpExecArray): number | undefined {
  const [, , , , , , , , zulu, sign, hours, minutes] = match;
  if (zulu !== undefined) {
    return 0;
  }
  if (sign === undefined) {
    return undefined;
  }
  const hour = Number(hours);
  const minute = Number(minutes);
  if (hour > LAST_OFFSET_HOUR || minute > LAST_MINUTE) {
    return Number.NaN;
  }
  const magnitude = hour * MINUTES_PER_HOUR + minute;
  return sign === '-' ? -magnitude : magnitude;
}

const NONZERO_DIGIT = /[1-9]/u;

/** Whether PostgreSQL keeps a fraction of a second as written at `digits` digits. */
function keepsFraction(fraction: string | undefined, digits: number): boolean {
  return (
    fraction === undefined ||
    (fraction.length <= SECOND_FRACTION_DIGITS &&
      !NONZERO_DIGIT.test(fraction.slice(digits)))
  );
}

/**
 * The parts of a well-formed date-time whose fraction PostgreSQL keeps at
 * `digits` fraction digits, or `undefined` when a field is out of range.
 */
function dateTimeParts(
  text: string,
  digits: number,
): DateTimeParts | undefined {
  const match = DATE_TIME.exec(text);
  if (match === null) {
    return undefined;
  }
  const [, year, month, day, hour, minute, second, fraction] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const [y = 0, mo = 0, d = 0, h = 0, mi = 0, s = 0] = parts;
  const offset = offsetOf(match);
  if (
    !isCalendarDay(y, mo, d) ||
    !isClockTime(h, mi, s) ||
    !keepsFraction(fraction, digits) ||
    Number.isNaN(offset)
  ) {
    return undefined;
  }
  return {
    year: y,
    month: mo,
    day: d,
    minuteOfDay: h * MINUTES_PER_HOUR + mi,
    offset,
  };
}

/** Whether a date's UTC instant stays within the years 0001 to 9999. */
function staysInRangeInUtc(parts: DateTimeParts, offset: number): boolean {
  const utcMinute = parts.minuteOfDay - offset;
  const isFirstDay =
    parts.year === FIRST_YEAR && parts.month === 1 && parts.day === 1;
  const isLastDay =
    parts.year === LAST_YEAR && parts.month === MONTHS && parts.day === 31;
  return !(
    (isFirstDay && utcMinute < 0) ||
    (isLastDay && utcMinute >= MINUTES_PER_DAY)
  );
}

/** `YYYY-MM-DD`, a real day in the years 0001 to 9999. */
export function isWireDate(text: string): boolean {
  const match = DATE.exec(text);
  if (match === null) {
    return false;
  }
  const [, year, month, day] = match;
  return isCalendarDay(Number(year), Number(month), Number(day));
}

/**
 * An RFC 3339 date-time without an offset, the `timestamp(p)` form, where
 * `fractionDigits` is p, or six for a column without one.
 */
export function isWireTimestamp(text: string, fractionDigits: number): boolean {
  const parts = dateTimeParts(text, fractionDigits);
  return parts !== undefined && parts.offset === undefined;
}

/**
 * An RFC 3339 date-time with `Z` or an offset within ±15:59, the
 * `timestamptz(p)` form, where `fractionDigits` is p, or six without one.
 */
export function isWireTimestamptz(
  text: string,
  fractionDigits: number,
): boolean {
  const parts = dateTimeParts(text, fractionDigits);
  return parts?.offset !== undefined && staysInRangeInUtc(parts, parts.offset);
}

const TRAILING_ZEROS = /0+$/u;
const YEAR_WIDTH = 4;
const FIELD_WIDTH = 2;

function padded(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** A fraction of a second as PostgreSQL prints it: without trailing zeros, and nothing when none is left. */
function fractionText(fraction: string | undefined): string {
  const kept = (fraction ?? '').replace(TRAILING_ZEROS, '');
  return kept === '' ? '' : `.${kept}`;
}

function daysIn(year: number, month: number): number {
  const leapDay = month === FEBRUARY && isLeapYear(year) ? 1 : 0;
  return (DAYS_IN_MONTH[month - 1] ?? 0) + leapDay;
}

/** The date `shift` days (-1, 0, or 1) from a calendar day, as `YYYY-MM-DD`. */
function shiftedDate(
  year: number,
  month: number,
  day: number,
  shift: number,
): string {
  let [y, m, d] = [year, month, day + shift];
  if (d < 1) {
    [y, m] = m === 1 ? [y - 1, MONTHS] : [y, m - 1];
    d = daysIn(y, m);
  } else if (d > daysIn(y, m)) {
    [y, m, d] = m === MONTHS ? [y + 1, 1, 1] : [y, m + 1, 1];
  }
  return `${padded(y, YEAR_WIDTH)}-${padded(m, FIELD_WIDTH)}-${padded(d, FIELD_WIDTH)}`;
}

/**
 * The read form of a value in the `timestamp(p)` form (SPEC 3.4, 5.1):
 * `T` in upper case and the fraction without trailing zeros, as PostgreSQL
 * prints it in an ISO session (`2024-01-31t10:20:30.500` is
 * `2024-01-31T10:20:30.5`). Other text comes back unchanged.
 */
export function timestampReadForm(text: string): string {
  const match = DATE_TIME.exec(text);
  if (match === null) {
    return text;
  }
  const [, year, month, day, hour, minute, second, fraction] = match;
  return `${year ?? ''}-${month ?? ''}-${day ?? ''}T${hour ?? ''}:${minute ?? ''}:${second ?? ''}${fractionText(fraction)}`;
}

/**
 * The read form of a value in the `timestamptz(p)` form (SPEC 3.4, 5.1):
 * the instant in UTC with `Z`, the fraction without trailing zeros
 * (`2024-01-31T00:20:30.50+02:00` is `2024-01-30T22:20:30.5Z`). An offset
 * is whole minutes within ±15:59, so the date moves a day at most. Other
 * text comes back unchanged.
 */
export function timestamptzReadForm(text: string): string {
  const match = DATE_TIME.exec(text);
  const offset = match === null ? undefined : offsetOf(match);
  if (match === null || offset === undefined || Number.isNaN(offset)) {
    return text;
  }
  const [, year, month, day, hour, minute, second, fraction] = match;
  const minutes = Number(hour) * MINUTES_PER_HOUR + Number(minute) - offset;
  const shift = Math.floor(minutes / MINUTES_PER_DAY);
  const minuteOfDay = minutes - shift * MINUTES_PER_DAY;
  const date = shiftedDate(Number(year), Number(month), Number(day), shift);
  const clock = `${padded(Math.floor(minuteOfDay / MINUTES_PER_HOUR), FIELD_WIDTH)}:${padded(minuteOfDay % MINUTES_PER_HOUR, FIELD_WIDTH)}`;
  return `${date}T${clock}:${second ?? ''}${fractionText(fraction)}Z`;
}
