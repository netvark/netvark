import type { ColumnType } from './column-type.ts';

/**
 * Whether a stored value, in its read form, is the value a client sent
 * (resource ADR 0005, exact or rejected): the read form may spell it
 * otherwise (`numeric(5,2)` prints `1.50`, `uuid` lower case, `timestamptz`
 * in UTC, `bpchar` without its padding, `real` at single precision), but
 * never change it.
 */
import { isDeepStrictEqual } from 'node:util';

const MINUTES_PER_HOUR = 60;
const SECONDS_PER_DAY = 86_400n;
const MICROS = 1_000_000n;
const FRACTION_DIGITS = 6;
const DATE_TIME =
  /^(-?\d+)-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:[Zz]|([+-])(\d{2}):(\d{2}))?$/u;

/**
 * Days since 1970-01-01 in the proleptic Gregorian calendar, by Howard
 * Hinnant's `days_from_civil`.
 * @ref http://howardhinnant.github.io/date_algorithms.html#days_from_civil
 */
function daysFromCivil(year: number, month: number, day: number): bigint {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return BigInt(era * 146_097 + doe - 719_468);
}

/** The instant a date-time names, in microseconds since 1970; local time counts as UTC. */
function instantOf(text: unknown): bigint | undefined {
  const match = typeof text === 'string' ? DATE_TIME.exec(text) : null;
  if (match === null) {
    return undefined;
  }
  const [, y, mo, d, h, mi, s, fraction = '', sign, oh = '0', om = '0'] = match;
  const seconds =
    daysFromCivil(Number(y), Number(mo), Number(d)) * SECONDS_PER_DAY +
    BigInt(Number(h) * 3600 + Number(mi) * MINUTES_PER_HOUR + Number(s));
  const offset = BigInt(
    (sign === '-' ? -1 : 1) * (Number(oh) * MINUTES_PER_HOUR + Number(om)) * 60,
  );
  const micros = BigInt(
    fraction.padEnd(FRACTION_DIGITS, '0').slice(0, FRACTION_DIGITS),
  );
  return (seconds - offset) * MICROS + micros;
}

function canonicalDecimal(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.includes('.')
    ? value.replace(/0+$/u, '').replace(/\.$/u, '')
    : value;
  return trimmed === '-0' ? '0' : trimmed;
}

const COMPARERS: Readonly<
  Record<string, (stored: unknown, sent: unknown) => boolean>
> = {
  bpchar: (stored, sent) =>
    typeof stored === 'string' &&
    typeof sent === 'string' &&
    stored.trimEnd() === sent.replace(/ +$/u, ''),
  float4: (stored, sent) =>
    Math.fround(Number(stored)) === Math.fround(Number(sent)),
  numeric: (stored, sent) =>
    canonicalDecimal(stored) === canonicalDecimal(sent),
  uuid: (stored, sent) =>
    String(stored).toLowerCase() === String(sent).toLowerCase(),
  timestamp: (stored, sent) =>
    instantOf(stored) !== undefined && instantOf(stored) === instantOf(sent),
  timestamptz: (stored, sent) =>
    instantOf(stored) !== undefined && instantOf(stored) === instantOf(sent),
};

function sameScalar(stored: unknown, sent: unknown, type: ColumnType): boolean {
  const compare = type.enum ? undefined : COMPARERS[type.base];
  return compare === undefined
    ? isDeepStrictEqual(stored, sent)
    : compare(stored, sent);
}

/** Whether `stored`, a read form, is the value `sent`. */
export function sameValue(
  stored: unknown,
  sent: unknown,
  type: ColumnType,
): boolean {
  if (!type.array || type.base === 'json' || type.base === 'jsonb') {
    return sameScalar(stored, sent, type);
  }
  return (
    Array.isArray(stored) &&
    Array.isArray(sent) &&
    stored.length === sent.length &&
    stored.every((element: unknown, index) =>
      sameScalar(element, sent[index], type),
    )
  );
}
