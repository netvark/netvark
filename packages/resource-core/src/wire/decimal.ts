/**
 * Exact decimal arithmetic on text (SPEC 5.3): `int8` and `numeric` values
 * and every range bound are compared digit by digit, never through a
 * JavaScript number, so a bound like `9223372036854775807` keeps every
 * digit. Values are decimal literals, `-?\d+(\.\d+)?`; leading zeros in the
 * integer part and trailing zeros in the fraction do not change the value.
 * @packageDocumentation
 */

/** The canonical spelling of an `int8` on the wire (SPEC 5.1): zero has no sign, as PostgreSQL prints it. */
export const INTEGER_TEXT: RegExp = /^(?:0|-?[1-9][0-9]*)$/u;

/**
 * The canonical spelling of a `numeric` on the wire (SPEC 5.1): no sign on
 * a zero (`-0.00` is stored and printed as `0.00`); trailing fraction zeros
 * stay, since an unconstrained `numeric` keeps them.
 */
export const DECIMAL_TEXT: RegExp =
  /^(?!-0(?:\.0+)?$)-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;

/** A decimal's sign, its integer digits without leading zeros, and its fraction without trailing zeros. */
interface DecimalParts {
  readonly negative: boolean;
  readonly integer: string;
  readonly fraction: string;
}

const LEADING_ZEROS = /^0+/u;
const TRAILING_ZEROS = /0+$/u;

function partsOf(text: string): DecimalParts {
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const point = unsigned.indexOf('.');
  const integer = (point === -1 ? unsigned : unsigned.slice(0, point)).replace(
    LEADING_ZEROS,
    '',
  );
  const fraction =
    point === -1 ? '' : unsigned.slice(point + 1).replace(TRAILING_ZEROS, '');
  return { negative, integer, fraction };
}

function negate(order: -1 | 0 | 1): -1 | 0 | 1 {
  if (order === 0) {
    return 0;
  }
  return order === 1 ? -1 : 1;
}

function isZero(parts: DecimalParts): boolean {
  return parts.integer === '' && parts.fraction === '';
}

/** Compares two magnitudes: integer length, then integer digits, then the fraction digit by digit. */
function compareMagnitudes(a: DecimalParts, b: DecimalParts): -1 | 0 | 1 {
  if (a.integer.length !== b.integer.length) {
    return a.integer.length < b.integer.length ? -1 : 1;
  }
  if (a.integer !== b.integer) {
    return a.integer < b.integer ? -1 : 1;
  }
  const length = Math.max(a.fraction.length, b.fraction.length);
  const left = a.fraction.padEnd(length, '0');
  const right = b.fraction.padEnd(length, '0');
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/** `-1`, `0`, or `1` as `a` is below, equal to, or above `b`; `-0` equals `0`. */
export function compareDecimals(a: string, b: string): -1 | 0 | 1 {
  const left = partsOf(a);
  const right = partsOf(b);
  const leftNegative = left.negative && !isZero(left);
  const rightNegative = right.negative && !isZero(right);
  if (leftNegative !== rightNegative) {
    return leftNegative ? -1 : 1;
  }
  const magnitude = compareMagnitudes(left, right);
  return leftNegative ? negate(magnitude) : magnitude;
}

/** The fraction digits as written, trailing zeros included: what PostgreSQL's input limit counts. */
export function writtenFractionDigits(text: string): number {
  const point = text.indexOf('.');
  return point === -1 ? 0 : text.length - point - 1;
}

/** The integer digits without leading zeros: `0.5` has none. */
export function integerDigits(text: string): number {
  return partsOf(text).integer.length;
}

/** `10^exponent` as a decimal literal: `1000`, `1`, `0.01`. */
export function powerOfTen(exponent: number): string {
  return exponent >= 0
    ? `1${'0'.repeat(exponent)}`
    : `0.${'0'.repeat(-exponent - 1)}1`;
}

/** The exponent of a power of ten written by `powerOfTen`: `1000` is 3, `0.01` is -2. */
export function exponentOfPowerOfTen(power: string): number {
  const point = power.indexOf('.');
  return point === -1 ? power.length - 1 : point - power.length + 1;
}

/**
 * Whether the value is an exact multiple of `10^exponent`: no nonzero digit
 * below that place. A `numeric(p, s)` value fits its scale exactly when it
 * is a multiple of `10^-s`, which also holds for a negative scale.
 */
export function isMultipleOfPowerOfTen(
  text: string,
  exponent: number,
): boolean {
  const { integer, fraction } = partsOf(text);
  if (exponent <= 0) {
    return fraction.length <= -exponent;
  }
  return (
    fraction === '' &&
    (integer === '' || integer.endsWith('0'.repeat(exponent)))
  );
}

/** Whether `|value| < 10^exponent`, the bound `numeric(p, s)` puts on a value: `10^(p - s)`. */
export function isBelowPowerOfTen(text: string, exponent: number): boolean {
  const { integer, fraction } = partsOf(text);
  if (exponent >= 0) {
    return integer.length <= exponent;
  }
  const places = -exponent;
  return (
    integer === '' &&
    fraction.padEnd(places, '0').slice(0, places) === '0'.repeat(places)
  );
}
