/**
 * The type bounds of SPEC 5.1 and 17: the integer ranges and the limits of
 * `numeric`, each captured by running the cast in PostgreSQL 14 and 18
 * (`'9223372036854775808'::int8` fails with 22003 "out of range",
 * `numeric` input with more than 131072 integer digits or 16383 fraction
 * digits fails with 22003 "value overflows numeric format").
 * @ref https://www.postgresql.org/docs/18/datatype-numeric.html
 * @packageDocumentation
 */

/** An inclusive range of integers as decimal literals. */
export interface IntegerRange {
  readonly min: string;
  readonly max: string;
}

/** The integer types' ranges. */
export const INTEGER_RANGES: Readonly<
  Record<'int2' | 'int4' | 'int8', IntegerRange>
> = Object.freeze({
  int2: Object.freeze({ min: '-32768', max: '32767' }),
  int4: Object.freeze({ min: '-2147483648', max: '2147483647' }),
  int8: Object.freeze({
    min: '-9223372036854775808',
    max: '9223372036854775807',
  }),
});

/** The most integer digits an unconstrained `numeric` takes. */
export const NUMERIC_INTEGER_DIGITS = 131_072;

/** The most fraction digits `numeric` input takes, trailing zeros included. */
export const NUMERIC_FRACTION_DIGITS = 16_383;

/** The most fraction digits of a second PostgreSQL keeps; more are rounded. */
export const SECOND_FRACTION_DIGITS = 6;
