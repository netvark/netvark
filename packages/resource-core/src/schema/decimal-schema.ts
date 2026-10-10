import type { ValueSpec } from './value-form';

/**
 * The `int8` and `numeric` schemas (SPEC 5.1, 5.3): canonical decimal text,
 * since both exceed JavaScript's exact integers, compared exactly with
 * every bound. PostgreSQL also reads `+5`, `007`, `.5`, `1e5`, and
 * surrounding spaces as the same value; the wire form keeps one spelling.
 * `numeric` input takes at most 131072 integer digits and 16383 fraction
 * digits as written, trailing zeros included, and `numeric(p, s)` rounds
 * any digit below `10^-s`, so a value with one is refused (`multipleOf`)
 * instead of stored rounded.
 * @ref https://www.postgresql.org/docs/18/datatype-numeric.html#DATATYPE-NUMERIC-DECIMAL
 * @packageDocumentation
 */
import { z } from 'zod/v4';

import {
  NUMERIC_FRACTION_DIGITS,
  NUMERIC_INTEGER_DIGITS,
} from '../wire/bounds';
import {
  compareDecimals,
  DECIMAL_TEXT,
  exponentOfPowerOfTen,
  integerDigits,
  INTEGER_TEXT,
  isMultipleOfPowerOfTen,
  writtenFractionDigits,
} from '../wire/decimal';
import { WIRE_FORMATS } from '../wire/formats';
import { raise } from './raise';
import { checkRange } from './range-check';

function isNumericText(text: string): boolean {
  return (
    DECIMAL_TEXT.test(text) &&
    integerDigits(text) <= NUMERIC_INTEGER_DIGITS &&
    writtenFractionDigits(text) <= NUMERIC_FRACTION_DIGITS
  );
}

/** The schema of an `int8` or a `numeric` value. */
export function decimalSchema(
  spec: ValueSpec,
  type: 'int8' | 'numeric',
): z.ZodType {
  const { multipleOf } = spec.limits;
  const exponent =
    multipleOf === null ? null : exponentOfPowerOfTen(multipleOf);
  return z.string().check((payload) => {
    const text = payload.value;
    if (type === 'int8' ? !INTEGER_TEXT.test(text) : !isNumericText(text)) {
      raise(
        payload,
        { kind: 'format', expected: WIRE_FORMATS[type] },
        { abort: true },
      );
      return;
    }
    if (exponent !== null && !isMultipleOfPowerOfTen(text, exponent)) {
      raise(
        payload,
        { kind: 'multipleOf', expected: multipleOf ?? undefined },
        { abort: false },
      );
    }
    checkRange(payload, spec.limits, compareDecimals);
  });
}
