/**
 * The pattern a string wire form puts on its text (SPEC 3.4, 5.1, 13.1):
 * integer and decimal text with as many digits as the value's bounds and
 * step allow, a float id's round-trip text, and a date-time's fraction
 * digits. Each pattern admits every text the server accepts and may admit
 * more: it keeps to the regular expression tokens JSON Schema recommends
 * for interoperability, so no lookahead refuses a negative zero, and a
 * digit count bounds a value only by the power of ten above its bounds.
 * @ref https://json-schema.org/draft/2020-12/json-schema-core#section-6.4
 * @packageDocumentation
 */
import type { FieldLimits } from '../meta/types';

import {
  compareDecimals,
  exponentOfPowerOfTen,
  integerDigits,
  powerOfTen,
} from '../wire/decimal';

/** What a string's pattern is read from. */
export interface FormText {
  readonly format: string | null;
  readonly fractionDigits: number | null;
  readonly limits: FieldLimits;
}

/** How many digits a bounded value's integer part has at most, and how many zeros a value below one starts its fraction with. */
interface Digits {
  readonly integer: number;
  readonly fractionZeros: number;
}

interface Bound {
  readonly magnitude: string;
  readonly inclusive: boolean;
}

/** JavaScript's shortest round-trip text of a finite number, the text of a float id (SPEC 3.4). */
const FLOAT_TEXT = '^-?(0|[1-9][0-9]*)(\\.[0-9]*[1-9])?(e[+-][1-9][0-9]*)?$';
const INTEGER_FORMATS: ReadonlySet<string> = new Set([
  'int16',
  'int32',
  'int64',
]);
const FLOAT_FORMATS: ReadonlySet<string> = new Set(['float', 'double']);
const DATE_TIME_FORMATS: ReadonlySet<string> = new Set([
  'date-time',
  'date-time-local',
]);

/** `-?` unless the lower bound rules out negative values. */
function signOf(limits: FieldLimits): string {
  const lower = limits.minimum ?? limits.exclusiveMinimum;
  return lower === null || compareDecimals(lower, '0') < 0 ? '-?' : '';
}

function magnitudeOf(text: string): string {
  return text.startsWith('-') ? text.slice(1) : text;
}

/** The bound of larger magnitude, or `undefined` when a side is unbounded; the looser one on a tie. */
function outerBound(limits: FieldLimits): Bound | undefined {
  const lower = limits.minimum ?? limits.exclusiveMinimum;
  const upper = limits.maximum ?? limits.exclusiveMaximum;
  if (lower === null || upper === null) {
    return undefined;
  }
  const below = magnitudeOf(lower);
  const above = magnitudeOf(upper);
  const order = compareDecimals(below, above);
  return {
    magnitude: order < 0 ? above : below,
    inclusive:
      (order <= 0 && limits.maximum !== null) ||
      (order >= 0 && limits.minimum !== null),
  };
}

/** The digits of the values within `bound`: below an exclusive `10^k`, `k` integer digits, or `-k` fraction zeros. */
function digitsWithin(bound: Bound): Digits {
  const exponent = exponentOfPowerOfTen(bound.magnitude);
  if (!bound.inclusive && powerOfTen(exponent) === bound.magnitude) {
    return exponent >= 0
      ? { integer: exponent, fractionZeros: 0 }
      : { integer: 0, fractionZeros: -exponent };
  }
  return { integer: integerDigits(bound.magnitude), fractionZeros: 0 };
}

/** A count quantifier, empty for exactly one. */
function times(low: number, high: number): string {
  return low === 1 && high === 1 ? '' : `{${String(low)},${String(high)}}`;
}

/**
 * An integer part without leading zeros: zero, or `sign` and at most
 * `digits` digits when bounded, the last `zeros` of them zeros.
 */
function integerPart(
  digits: number | null,
  zeros: number,
  sign: string,
): string {
  const tail = zeros === 0 ? '' : `0{${String(zeros)}}`;
  if (digits === null) {
    return `(0|${sign}[1-9][0-9]*${tail})`;
  }
  if (digits <= zeros) {
    return '0';
  }
  const middle = digits - zeros - 1;
  const body = middle === 0 ? '' : `[0-9]{0,${String(middle)}}`;
  return `(0|${sign}[1-9]${body}${tail})`;
}

/** A fraction of at most `scale` digits that are not trailing zeros, the first `zeros` of them zeros; any digits without a scale. */
function fractionPart(scale: number | null, zeros: number): string {
  const lead = zeros === 0 ? '' : `0{${String(zeros)}}`;
  if (scale === null) {
    return zeros === 0 ? '(\\.[0-9]+)?' : `(\\.(${lead}[0-9]*|0+))?`;
  }
  if (scale <= zeros) {
    return '(\\.0+)?';
  }
  const significant = `[0-9]${times(1, scale - zeros)}0*`;
  return zeros === 0
    ? `(\\.${significant})?`
    : `(\\.(${lead}${significant}|0+))?`;
}

/** Integer text whose digits fit the bounds, signed only where the lower bound is negative or absent; zero is unsigned, as `int8` text is (SPEC 5.1). */
function integerPattern(limits: FieldLimits): string {
  const bound = outerBound(limits);
  const digits = bound === undefined ? null : digitsWithin(bound).integer;
  return `^${integerPart(digits, 0, signOf(limits))}$`;
}

/**
 * Decimal text whose digits fit the bounds and the step: a `10^-s` step
 * allows `s` significant fraction digits, and a `10^k` step ends the
 * integer in `k` zeros.
 */
function decimalPattern(limits: FieldLimits): string {
  const bound = outerBound(limits);
  const digits = bound === undefined ? undefined : digitsWithin(bound);
  const step =
    limits.multipleOf === null ? null : exponentOfPowerOfTen(limits.multipleOf);
  const integer = integerPart(
    digits?.integer ?? null,
    step === null ? 0 : Math.max(step, 0),
    '',
  );
  const fraction = fractionPart(
    step === null ? null : -step,
    digits?.fractionZeros ?? 0,
  );
  return `^${signOf(limits)}${integer}${fraction}$`;
}

/** A date-time with at most `digits` significant fraction digits, as `timestamp(p)` and `timestamptz(p)` store (SPEC 5.2). */
function dateTimePattern(digits: number): string {
  const fraction = digits === 0 ? '\\.0+' : `\\.[0-9]${times(1, digits)}0*`;
  return `^[^.]*(${fraction})?([Zz+-][^.]*)?$`;
}

/** The pattern a string's form puts on its text, or `null` when its format and limits say all there is. */
export function formPattern(text: FormText): string | null {
  const { format, fractionDigits, limits } = text;
  if (format === 'decimal') {
    return decimalPattern(limits);
  }
  if (format !== null && INTEGER_FORMATS.has(format)) {
    return integerPattern(limits);
  }
  if (format !== null && FLOAT_FORMATS.has(format)) {
    return FLOAT_TEXT;
  }
  return format !== null &&
    DATE_TIME_FORMATS.has(format) &&
    fractionDigits !== null
    ? dateTimePattern(fractionDigits)
    : null;
}
