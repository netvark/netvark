/**
 * The `uuid` wire form (SPEC 5.1): 8-4-4-4-12 hexadecimal digits in either
 * case; PostgreSQL prints lower case. It also accepts braces and missing
 * hyphens, the same value spelled differently, which the wire form leaves
 * out so every id has one spelling.
 * @ref https://www.postgresql.org/docs/18/datatype-uuid.html
 * @packageDocumentation
 */

/** A UUID in the hyphenated form, either case. */
export const UUID_TEXT: RegExp =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
