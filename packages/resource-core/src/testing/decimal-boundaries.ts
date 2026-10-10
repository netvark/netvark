/**
 * Boundary fixtures of `int8` and `numeric` (SPEC 5.1 to 5.3): the type's
 * limits and their neighbors, the spellings PostgreSQL reads but the wire
 * form refuses (`-0`, `+1`, `01`, `.5`, `1e3`, a leading space), the
 * digit limits of an unconstrained `numeric`, the extra fraction digit
 * `numeric(p, s)` rounds away, and each folded bound with its neighbors one
 * step away: one for `int8`, `10^-s` for `numeric(p, s)`, and one digit
 * past the bound's own for an unconstrained `numeric`.
 * @packageDocumentation
 */
import type { Bound, Limits } from '../schema/limits';
import type { BoundaryFixture } from './fixture';

import {
  INTEGER_RANGES,
  NUMERIC_FRACTION_DIGITS,
  NUMERIC_INTEGER_DIGITS,
} from '../wire/bounds';
import { exponentOfPowerOfTen, writtenFractionDigits } from '../wire/decimal';
import { stepDecimal } from './decimal-steps';
import { fixture } from './fixture';

const SPELLINGS: ReadonlyArray<BoundaryFixture> = [
  fixture('0', 'zero'),
  fixture('-0', 'negative zero'),
  fixture('+1', 'a plus sign'),
  fixture('01', 'a leading zero'),
  fixture(' 1', 'a leading space'),
];

const NUMERIC_SPELLINGS: ReadonlyArray<BoundaryFixture> = [
  fixture('.5', 'no integer digit'),
  fixture('1e3', 'an exponent'),
  fixture('1.50', 'a trailing fraction zero'),
];

function int8Fixtures(): ReadonlyArray<BoundaryFixture> {
  const { min, max } = INTEGER_RANGES.int8;
  return [
    ...SPELLINGS,
    fixture('1.5', 'a fraction'),
    fixture(min, 'int8 minimum'),
    fixture(stepDecimal(min, -1, 0), 'int8 minimum, minus one'),
    fixture(max, 'int8 maximum'),
    fixture(stepDecimal(max, 1, 0), 'int8 maximum, plus one'),
  ];
}

/** The digit limits of numeric input, which hold with or without a typmod. */
function digitLimitFixtures(): ReadonlyArray<BoundaryFixture> {
  const integer = String(NUMERIC_INTEGER_DIGITS);
  const fraction = String(NUMERIC_FRACTION_DIGITS);
  return [
    fixture('9'.repeat(NUMERIC_INTEGER_DIGITS), `${integer} integer digits`),
    fixture(
      '9'.repeat(NUMERIC_INTEGER_DIGITS + 1),
      `${integer} integer digits, plus one`,
    ),
    fixture(
      `0.${'1'.repeat(NUMERIC_FRACTION_DIGITS)}`,
      `${fraction} fraction digits`,
    ),
    fixture(
      `0.${'1'.repeat(NUMERIC_FRACTION_DIGITS + 1)}`,
      `${fraction} fraction digits, plus one`,
    ),
  ];
}

/** Half a step of `numeric(p, s)`: the digit it rounds away, alone and past the largest value. */
function scaleFixtures(
  step: string,
  upper: Bound | null,
): ReadonlyArray<BoundaryFixture> {
  const exponent = exponentOfPowerOfTen(step);
  const half = stepDecimal('0', 5, exponent - 1);
  const extra = [fixture(half, `an extra fraction digit below ${step}`)];
  if (upper === null) {
    return extra;
  }
  const largest = stepDecimal(upper.value, -1, exponent);
  return [
    ...extra,
    fixture(
      stepDecimal(largest, 5, exponent - 1),
      `rounds past the largest value ${largest}`,
    ),
  ];
}

/** The exponent of one step next to a bound. */
function stepExponent(bound: Bound, limits: Limits, int8: boolean): number {
  if (int8) {
    return 0;
  }
  return limits.multipleOf === null
    ? -(writtenFractionDigits(bound.value) + 1)
    : exponentOfPowerOfTen(limits.multipleOf);
}

function boundFixtures(
  name: string,
  bound: Bound | null,
  limits: Limits,
  int8: boolean,
): ReadonlyArray<BoundaryFixture> {
  if (bound === null) {
    return [];
  }
  const exponent = stepExponent(bound, limits, int8);
  return [
    fixture(bound.value, `${name} ${bound.value}`),
    fixture(
      stepDecimal(bound.value, -1, exponent),
      `${name} ${bound.value}, one step below`,
    ),
    fixture(
      stepDecimal(bound.value, 1, exponent),
      `${name} ${bound.value}, one step above`,
    ),
  ];
}

/** The fixtures of a decimal value of `type` with these limits. */
export function decimalFixtures(
  type: 'int8' | 'numeric',
  limits: Limits,
): ReadonlyArray<BoundaryFixture> {
  const int8 = type === 'int8';
  const base = int8
    ? int8Fixtures()
    : [
        ...SPELLINGS,
        ...NUMERIC_SPELLINGS,
        ...digitLimitFixtures(),
        ...(limits.multipleOf === null
          ? []
          : scaleFixtures(limits.multipleOf, limits.upper)),
      ];
  return [
    ...base,
    ...boundFixtures('lower bound', limits.lower, limits, int8),
    ...boundFixtures('upper bound', limits.upper, limits, int8),
  ];
}
