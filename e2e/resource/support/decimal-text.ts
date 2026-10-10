/**
 * Exact arithmetic on decimal text for the metadata probes (resource SPEC
 * 8): a numeric bound is a decimal literal, and the probe one step past it
 * must be exact, since PostgreSQL compares `numeric` exactly. A result is
 * canonical: no leading zeros and no negative zero.
 */
const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/u;
const TEN = 10n;

interface Scaled {
  readonly units: bigint;
  readonly scale: number;
}

function parse(text: string): Scaled {
  const match = DECIMAL.exec(text);
  if (match === null) {
    throw new Error(`not a decimal literal: ${text}`);
  }
  const [, sign = '', whole = '', fraction = ''] = match;
  const units = BigInt(`${whole}${fraction}`);
  return { units: sign === '-' ? -units : units, scale: fraction.length };
}

function format(units: bigint, scale: number): string {
  const magnitude = (units < 0n ? -units : units)
    .toString()
    .padStart(scale + 1, '0');
  const whole = magnitude.slice(0, magnitude.length - scale);
  const text =
    scale === 0 ? whole : `${whole}.${magnitude.slice(whole.length)}`;
  return units < 0n ? `-${text}` : text;
}

/** `left + right`, exactly, at the larger scale of the two. */
export function addDecimals(left: string, right: string): string {
  const a = parse(left);
  const b = parse(right);
  const scale = Math.max(a.scale, b.scale);
  const units =
    a.units * TEN ** BigInt(scale - a.scale) +
    b.units * TEN ** BigInt(scale - b.scale);
  return format(units, scale);
}

/** `value` with its sign flipped. */
export function negateDecimal(value: string): string {
  const { units, scale } = parse(value);
  return format(-units, scale);
}

/** One unit of the digit after the last fraction digit of every value: smaller than any step between them. */
export function finerStep(values: ReadonlyArray<string>): string {
  const scale = Math.max(0, ...values.map((value) => parse(value).scale));
  return format(1n, scale + 1);
}

/** Below zero, zero, or above zero as `left` is below, at, or above `right`. */
export function compareDecimals(left: string, right: string): number {
  const difference = parse(addDecimals(left, negateDecimal(right))).units;
  if (difference === 0n) {
    return 0;
  }
  return difference < 0n ? -1 : 1;
}

/** Whether `value` is a whole multiple of `step`. */
export function isMultiple(value: string, step: string): boolean {
  const a = parse(value);
  const b = parse(step);
  const scale = Math.max(a.scale, b.scale);
  const units = a.units * TEN ** BigInt(scale - a.scale);
  const unit = b.units * TEN ** BigInt(scale - b.scale);
  return units % unit === 0n;
}
