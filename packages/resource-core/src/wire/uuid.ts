/**
 * The `uuid` wire form (SPEC 5.1): 8-4-4-4-12 hexadecimal digits in either
 * case, RFC 9562's string representation; PostgreSQL prints lower case,
 * the spelling an id is sent in (SPEC 3.4). PostgreSQL also accepts braces
 * and missing hyphens, which the wire form leaves out.
 * @ref https://www.rfc-editor.org/rfc/rfc9562#section-4
 * @ref https://www.postgresql.org/docs/18/datatype-uuid.html
 * @packageDocumentation
 */

/** A UUID in the hyphenated form, either case. */
export const UUID_TEXT: RegExp =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
