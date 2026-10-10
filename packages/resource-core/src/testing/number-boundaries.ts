/**
 * Boundary fixtures of `int2`, `int4`, `float4`, and `float8` (SPEC 5.1 to
 * 5.3): the type's limits and their neighbors, a fraction for an integer,
 * single precision's overflow and underflow, and each folded bound with
 * its neighbors, which for `real` include the neighbors of the bound
 * rounded to single precision, since PostgreSQL compares the rounded value
 * against the bound as a double.
 * @packageDocumentation
 */
import type { Bound, Limits } from '../schema/limits';
import type { BoundaryFixture } from './fixture';

import { INTEGER_RANGES } from '../wire/bounds';
import { INTEGER_TEXT } from '../wire/decimal';
import { fixture } from './fixture';
import { FLOAT4_MAX, FLOAT4_MIN, nextDouble, nextSingle } from './float-steps';

/** The smallest double that single precision rounds to infinity. */
const FLOAT4_OVERFLOW = 3.402_823_567_797_336_6e38;
/** A double that single precision rounds to zero: below half of `FLOAT4_MIN`. */
const FLOAT4_UNDERFLOW = 7e-46;

type NumberType = 'int2' | 'int4' | 'float4' | 'float8';

function integerLimitFixtures(
  type: 'int2' | 'int4',
): ReadonlyArray<BoundaryFixture> {
  const min = Number(INTEGER_RANGES[type].min);
  const max = Number(INTEGER_RANGES[type].max);
  return [
    fixture(0, 'zero'),
    fixture(1.5, 'a fraction'),
    fixture(min, `${type} minimum`),
    fixture(min - 1, `${type} minimum, minus one`),
    fixture(max, `${type} maximum`),
    fixture(max + 1, `${type} maximum, plus one`),
  ];
}

const FLOAT_LIMITS: Readonly<
  Record<'float4' | 'float8', ReadonlyArray<BoundaryFixture>>
> = {
  float4: [
    fixture(0, 'zero'),
    fixture(0.1, 'a fraction single precision rounds'),
    fixture(FLOAT4_MAX, 'float4 maximum'),
    fixture(-FLOAT4_MAX, 'float4 minimum'),
    fixture(FLOAT4_OVERFLOW, 'rounds past the float4 maximum'),
    fixture(FLOAT4_MIN, 'the smallest float4'),
    fixture(FLOAT4_UNDERFLOW, 'rounds to zero in float4'),
  ],
  float8: [
    fixture(0, 'zero'),
    fixture(0.1, 'a fraction'),
    fixture(1e-7, 'a negative exponent'),
    fixture(Number.MAX_VALUE, 'float8 maximum'),
    fixture(-Number.MAX_VALUE, 'float8 minimum'),
    fixture(Number.MIN_VALUE, 'the smallest float8'),
  ],
};

function integerBoundFixtures(
  name: string,
  bound: Bound,
): ReadonlyArray<BoundaryFixture> {
  const value = Number(bound.value);
  if (!INTEGER_TEXT.test(bound.value)) {
    return [
      fixture(Math.floor(value), `${name} ${bound.value}, rounded down`),
      fixture(Math.ceil(value), `${name} ${bound.value}, rounded up`),
    ];
  }
  return [
    fixture(value, `${name} ${bound.value}`),
    fixture(value - 1, `${name} ${bound.value}, minus one`),
    fixture(value + 1, `${name} ${bound.value}, plus one`),
  ];
}

function floatBoundFixtures(
  name: string,
  bound: Bound,
  single: boolean,
): ReadonlyArray<BoundaryFixture> {
  const value = Number(bound.value);
  const doubles = [
    fixture(value, `${name} ${bound.value}`),
    fixture(nextDouble(value, -1), `${name} ${bound.value}, the double below`),
    fixture(nextDouble(value, 1), `${name} ${bound.value}, the double above`),
  ];
  return single
    ? [
        ...doubles,
        fixture(Math.fround(value), `${name} ${bound.value} in float4`),
        fixture(
          nextSingle(value, -1),
          `${name} ${bound.value}, the float4 below`,
        ),
        fixture(
          nextSingle(value, 1),
          `${name} ${bound.value}, the float4 above`,
        ),
      ]
    : doubles;
}

function boundFixtures(
  type: NumberType,
  name: string,
  bound: Bound | null,
): ReadonlyArray<BoundaryFixture> {
  if (bound === null) {
    return [];
  }
  return type === 'int2' || type === 'int4'
    ? integerBoundFixtures(name, bound)
    : floatBoundFixtures(name, bound, type === 'float4');
}

/** The fixtures of a number value of `type` with these limits. */
export function numberFixtures(
  type: NumberType,
  limits: Limits,
): ReadonlyArray<BoundaryFixture> {
  return [
    ...(type === 'int2' || type === 'int4'
      ? integerLimitFixtures(type)
      : FLOAT_LIMITS[type]),
    ...boundFixtures(type, 'lower bound', limits.lower),
    ...boundFixtures(type, 'upper bound', limits.upper),
  ];
}
