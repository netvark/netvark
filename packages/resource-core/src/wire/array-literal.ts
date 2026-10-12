/**
 * A one-dimensional array literal as PostgreSQL prints it, read back into
 * its elements (SPEC 5.1). Elements are separated by commas, the delimiter
 * of every element type with a wire form; one is double-quoted when it is
 * empty, holds a brace, a comma, a quote, a backslash, or white space, or
 * spells `NULL` in any case, and a quote or a backslash inside it is escaped by a
 * backslash; `NULL` unquoted is the null element. The output decorates an
 * array with its dimensions only when a lower bound is not 1, so a literal
 * such as `[0:1]={a,b}`, and a nested one, have no elements here.
 * @ref https://www.postgresql.org/docs/18/arrays.html#ARRAYS-IO ("The array output routine will put double quotes around element values if they are empty strings, ...")
 * @packageDocumentation
 */

/**
 * An element as the output prints it: double-quoted, with a backslash
 * before each quote and backslash inside, or bare, without the white space
 * `array_isspace` names, a quote, a backslash, a comma, or a brace.
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/arrayfuncs.c (array_out, array_isspace)
 */
const ELEMENT = String.raw`"(?:[^"\\]|\\.)*"|[^ \t\n\r\v\f"\\,{}]+`;
const BODY = new RegExp(String.raw`^(?:${ELEMENT})(?:,(?:${ELEMENT}))*$`, 'su');
const ELEMENTS = new RegExp(ELEMENT, 'gsu');
const ESCAPE = /\\(.)/gsu;
const NULL_ELEMENT = 'NULL';

/** A printed element's value: a quoted one unescaped, `NULL` bare as `null`. */
function elementOf(printed: string): string | null {
  if (printed.startsWith('"')) {
    return printed.slice(1, -1).replaceAll(ESCAPE, '$1');
  }
  return printed === NULL_ELEMENT ? null : printed;
}

/** The elements of a one-dimensional array literal, `null` for `NULL`; `undefined` for any other text. */
export function arrayElements(
  text: string,
): ReadonlyArray<string | null> | undefined {
  if (!text.startsWith('{') || !text.endsWith('}')) {
    return undefined;
  }
  const body = text.slice(1, -1);
  if (body === '') {
    return [];
  }
  return BODY.test(body)
    ? Array.from(body.matchAll(ELEMENTS), ([printed]) => elementOf(printed))
    : undefined;
}
