/**
 * Range checks over the folded limits (SPEC 5.3, 6.1): each violated end
 * raises one issue whose `expected` is the bound as written, compared the
 * way PostgreSQL compares the value with it.
 * @packageDocumentation
 */
import type { ParsePayload } from 'zod/v4/core';

import type { Bound, Limits } from './limits';

import { compareDecimals } from '../wire/decimal';
import { raise } from './raise';

/** `-1`, `0`, or `1` as a value is below, at, or above a bound. */
export type Compare<TValue> = (value: TValue, bound: string) => number;

function compareNumbers(value: number, bound: number): number {
  if (value === bound) {
    return 0;
  }
  return value < bound ? -1 : 1;
}

/**
 * The comparison PostgreSQL makes for each number type (SPEC 5.3): an
 * integer is promoted to `numeric` and compared exactly
 * (`1::int4 >= 1.0000000000000000001` is false); a `float8` meets the bound
 * converted to `float8` (`1::float8 >= 1.0000000000000000001` is true); a
 * `real` is rounded to single precision first (`0.1::real > 0.1` is true).
 * Each was captured on PostgreSQL 14 and 18.
 */
export const NUMBER_COMPARE: Readonly<
  Record<'int2' | 'int4' | 'float4' | 'float8', Compare<number>>
> = {
  int2: (value, bound) => compareDecimals(String(value), bound),
  int4: (value, bound) => compareDecimals(String(value), bound),
  float4: (value, bound) => compareNumbers(Math.fround(value), Number(bound)),
  float8: (value, bound) => compareNumbers(value, Number(bound)),
};

function fails(order: number, bound: Bound, side: 1 | -1): boolean {
  return order * side < 0 || (order === 0 && !bound.inclusive);
}

/** Reports each violated end of the folded range. */
export function checkRange<TValue>(
  payload: ParsePayload<TValue>,
  limits: Limits,
  compare: Compare<TValue>,
): void {
  const { lower, upper } = limits;
  if (lower !== null && fails(compare(payload.value, lower.value), lower, 1)) {
    raise(
      payload,
      {
        kind: lower.inclusive ? 'minimum' : 'exclusiveMinimum',
        expected: lower.value,
      },
      { abort: false },
    );
  }
  if (upper !== null && fails(compare(payload.value, upper.value), upper, -1)) {
    raise(
      payload,
      {
        kind: upper.inclusive ? 'maximum' : 'exclusiveMaximum',
        expected: upper.value,
      },
      { abort: false },
    );
  }
}
