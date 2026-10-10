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
