/**
 * The float wire forms (SPEC 5.1, 5.2). JSON numbers are finite doubles,
 * so `float8` takes any of them; `real` fails with 22003 on overflow
 * (`'3.5e38'::float4`) and on underflow (`'1e-50'::float4`), so a value
 * must stay finite and, unless it is zero, nonzero after rounding to single
 * precision. Captured on PostgreSQL 14 and 18.
 * @ref https://www.postgresql.org/docs/18/datatype-numeric.html#DATATYPE-FLOAT
 * @packageDocumentation
 */

/** Whether `real` stores this number, rounded to single precision, without an error. */
export function isStorableReal(value: number): boolean {
  const rounded = Math.fround(value);
  return Number.isFinite(rounded) && (rounded !== 0 || value === 0);
}

/** A decimal `digits × 10^exponent`. */
interface Decimal {
  readonly digits: bigint;
  readonly exponent: number;
}

/** Bits of a float32 fraction, the bias that makes `exponent` that of its last bit, and the most digits a float32 needs. */
const FRACTION_BITS = 23;
const FRACTION_MASK = 0x7f_ff_ff;
const EXPONENT_MASK = 0xff;
const HIDDEN_BIT = 0x80_00_00;
const LAST_BIT_BIAS = 150;
const SUBNORMAL_EXPONENT = -149;
const FLOAT32_BYTES = 4;
const FLOAT32_DIGITS = 9;
const PRECISION_TEXT = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/u;

/**
 * A positive float32 as `mantissa × 2^exponent`, and whether the gap below
 * it is half the gap above, as at a power of two other than the smallest
 * normal.
 */
function float32Parts(value: number): {
  readonly mantissa: bigint;
  readonly exponent: number;
  readonly narrowBelow: boolean;
} {
  const view = new DataView(new ArrayBuffer(FLOAT32_BYTES));
  view.setFloat32(0, value);
  const bits = view.getUint32(0);
  const biased = (bits >>> FRACTION_BITS) & EXPONENT_MASK;
  const fraction = bits & FRACTION_MASK;
  return biased === 0
    ? {
        mantissa: BigInt(fraction),
        exponent: SUBNORMAL_EXPONENT,
        narrowBelow: false,
      }
    : {
        mantissa: BigInt(fraction | HIDDEN_BIT),
        exponent: biased - LAST_BIT_BIAS,
        narrowBelow: fraction === 0 && biased > 1,
      };
}

/** The decimal `toPrecision` printed: exactly `precision` significant digits, the nearest to the number. */
function decimalOf(text: string): Decimal {
  const [, integer = '', fraction = '', power = '0'] =
    PRECISION_TEXT.exec(text) ?? [];
  return {
    digits: BigInt(`${integer}${fraction}`),
    exponent: Number(power) - fraction.length,
  };
}

/** The decimals of `precision` digits next to `nearest`, a digit count changing at a power of ten. */
function neighbours(
  nearest: Decimal,
  precision: number,
): ReadonlyArray<Decimal> {
  const smallest = 10n ** BigInt(precision - 1);
  const { digits, exponent } = nearest;
  const below =
    digits - 1n < smallest
      ? { digits: smallest * 10n - 1n, exponent: exponent - 1 }
      : { digits: digits - 1n, exponent };
  const above =
    digits + 1n === smallest * 10n
      ? { digits: smallest, exponent: exponent + 1 }
      : { digits: digits + 1n, exponent };
  return [nearest, below, above];
}

/**
 * The open interval of half a gap on each side of a float32, in units of
 * `2^binary`: the decimals within read back as it. A bound reads back as
 * it too when its mantissa is even (round half to even), but PostgreSQL
 * never prints a bound: "we avoid outputting the exact midpoint value
 * between two representable floats, since that relies on the reader
 * getting the round-to-even rule correct" (`STRICTLY_SHORTEST 0`).
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/common/ryu_common.h
 */
interface Interval {
  readonly binary: number;
  readonly lower: bigint;
  readonly center: bigint;
  readonly upper: bigint;
}

function intervalOf(value: number): Interval {
  const { mantissa, exponent, narrowBelow } = float32Parts(value);
  const center = 4n * mantissa;
  return {
    binary: exponent - 2,
    lower: center - (narrowBelow ? 1n : 2n),
    center,
    upper: center + 2n,
  };
}

/**
 * The candidates within `interval`, each with its distance from the
 * float32, compared exactly on integers scaled by `10^shift10 × 2^shift2`.
 */
function within(
  interval: Interval,
  candidates: ReadonlyArray<Decimal>,
): ReadonlyArray<{ readonly decimal: Decimal; readonly distance: bigint }> {
  const shift10 = Math.max(0, ...candidates.map((d) => -d.exponent));
  const shift2 = Math.max(0, -interval.binary);
  const binary = (units: bigint): bigint =>
    units * 2n ** BigInt(interval.binary + shift2) * 10n ** BigInt(shift10);
  const low = binary(interval.lower);
  const high = binary(interval.upper);
  const middle = binary(interval.center);
  return candidates.flatMap((decimal) => {
    const scaled =
      decimal.digits *
      10n ** BigInt(decimal.exponent + shift10) *
      2n ** BigInt(shift2);
    const inside = low < scaled && scaled < high;
    const gap = scaled - middle;
    return inside ? [{ decimal, distance: gap < 0n ? -gap : gap }] : [];
  });
}

/** The nearer decimal, an even last digit on a tie. */
function nearer(
  a: { readonly decimal: Decimal; readonly distance: bigint },
  b: { readonly decimal: Decimal; readonly distance: bigint },
): number {
  if (a.distance !== b.distance) {
    return a.distance < b.distance ? -1 : 1;
  }
  return Number(a.decimal.digits % 2n) - Number(b.decimal.digits % 2n);
}

/**
 * The shortest decimal strictly within half a gap of the positive float32
 * `value`, the nearest to it when several are that short, ties to an even
 * last digit: what PostgreSQL's Ryu `f2s` prints. At each length only the
 * nearest decimal (`toPrecision`, exact) and its two neighbours can lie
 * within the interval, which is narrower than three steps of the first
 * length that reaches it; the neighbour on the far side matters at a power
 * of two, where the interval is narrower below.
 */
function shortestDecimal(value: number): Decimal {
  const interval = intervalOf(value);
  for (let precision = 1; precision <= FLOAT32_DIGITS; precision += 1) {
    const nearest = decimalOf(value.toPrecision(precision));
    const [best] = within(interval, neighbours(nearest, precision)).toSorted(
      nearer,
    );
    if (best !== undefined) {
      return best.decimal;
    }
  }
  throw new RangeError('a float32 has a decimal of at most nine digits');
}

/**
 * PostgreSQL's text of a `real`, as the number JavaScript reads from it
 * prints (SPEC 3.4): `value` rounded to single precision, then the
 * shortest decimal strictly within half a gap of that float32, the nearest
 * when several are that short (`float4out`, Ryu since PostgreSQL 12, which
 * prints an integer below 2^24 whole, the same decimal). A driver reads
 * `0.3` for a `real` that holds the float32 nearest to 0.3, which `String`
 * prints as `0.3`; the double `0.30000000000000004` names the same
 * float32. `value` is a number `real` stores (`isStorableReal`).
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/common/f2s.c
 * @ref https://www.postgresql.org/docs/18/datatype-numeric.html#DATATYPE-FLOAT
 */
export function realText(value: number): string {
  const rounded = Math.fround(value);
  if (rounded === 0) {
    return '0';
  }
  const magnitude = Math.abs(rounded);
  const { digits, exponent } = shortestDecimal(magnitude);
  const text = String(Number(`${String(digits)}e${String(exponent)}`));
  return rounded < 0 ? `-${text}` : text;
}
