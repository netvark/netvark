/**
 * Exact decimals for the model (SPEC 5.3): literals of
 * `/^-?\d+(\.\d+)?$/` compared by value through `bigint`, never through a
 * JavaScript number, so `int8` and `numeric` bounds keep every digit.
 * Written apart from `wire/decimal.ts`, which the property test checks.
 * Not published with the package.
 * @packageDocumentation
 */

/** One end of a range: a decimal literal and whether it is included. */
export interface ModelBound {
  readonly value: string;
  readonly inclusive: boolean;
}

interface Scaled {
  readonly units: bigint;
  readonly scale: number;
}

const TEN = 10n;

function scaled(literal: string): Scaled {
  const negative = literal.startsWith('-');
  const [whole = '', fraction = ''] = (
    negative ? literal.slice(1) : literal
  ).split('.');
  const units = BigInt(`${whole}${fraction}`);
  return { units: negative ? -units : units, scale: fraction.length };
}

/** The sign of `a - b`. */
function compareDecimal(a: string, b: string): number {
  const left = scaled(a);
  const right = scaled(b);
  const scale = Math.max(left.scale, right.scale);
  const x = left.units * TEN ** BigInt(scale - left.scale);
  const y = right.units * TEN ** BigInt(scale - right.scale);
  if (x === y) {
    return 0;
  }
  return x < y ? -1 : 1;
}

/** `10^exponent` as a decimal literal: `1000` for 3, `0.01` for -2. */
export function powerOfTen(exponent: number): string {
  return exponent >= 0
    ? `1${'0'.repeat(exponent)}`
    : `0.${'0'.repeat(-exponent - 1)}1`;
}

/**
 * The tightest of `bounds` on one side: the largest lower bound or the
 * smallest upper one; of two equal values, the excluded one.
 */
export function tightest(
  bounds: ReadonlyArray<ModelBound>,
  side: 'lower' | 'upper',
): ModelBound | null {
  const direction = side === 'lower' ? 1 : -1;
  let best: ModelBound | null = null;
  for (const bound of bounds) {
    const order =
      best === null ? 1 : compareDecimal(bound.value, best.value) * direction;
    if (
      order > 0 ||
      (order === 0 && best?.inclusive === true && !bound.inclusive)
    ) {
      best = bound;
    }
  }
  return best;
}

/** One spelling per value: `-0.50` as `-0.5`, `007` as `7`, `-0` as `0`. */
export function canonicalDecimal(literal: string): string {
  const negative = literal.startsWith('-');
  const [whole = '', fraction = ''] = (
    negative ? literal.slice(1) : literal
  ).split('.');
  const digits = whole.replace(/^0+(?=\d)/u, '');
  const kept = fraction.replace(/0+$/u, '');
  const magnitude = kept === '' ? digits : `${digits}.${kept}`;
  return negative && magnitude !== '0' ? `-${magnitude}` : magnitude;
}
