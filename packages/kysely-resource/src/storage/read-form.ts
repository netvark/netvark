/**
 * Read forms (SPEC 18.2, obligation 3 of resource SPEC 12.8): the text
 * PostgreSQL prints for a value, under the transaction's settings (UTC,
 * ISO dates), becomes the read form of resource SPEC 5.1 by its column's
 * type. A value outside the read form has none: a BC date, a year past
 * 9999, an infinity, `NaN`, a `NULL` element, a nested array, and the JSON
 * `null` at the top; the adapter fails the read rather than emit another
 * value.
 * @ref https://www.postgresql.org/docs/18/datatype-datetime.html#DATATYPE-DATETIME-OUTPUT
 * @ref https://www.postgresql.org/docs/18/datatype-numeric.html#DATATYPE-NUMERIC-DECIMAL (NaN and the infinities)
 * @ref https://www.postgresql.org/docs/18/arrays.html#ARRAYS-IO
 * @packageDocumentation
 */
import type { ColumnType } from './column-type';

import { arrayElements } from './array-literal';

/** What `readForm` returns for a value outside the read form. */
export const NO_READ_FORM: unique symbol = Symbol('no read form');

const DECIMAL = /^-?\d+(?:\.\d+)?$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const LOCAL = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/u;
const UTC = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)\+00$/u;

/**
 * A boolean as PostgreSQL prints it: a cast to text gives `true` or
 * `false` (`booltext`), while an array prints its elements with the
 * element type's output function, `boolout`, as `t` or `f`.
 * @ref https://www.postgresql.org/docs/18/datatype-boolean.html ("The datatype output function for type boolean always emits either t or f")
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/bool.c (`booltext`, the cast to text, differs from `boolout`)
 */
const BOOLEANS: ReadonlyMap<string, boolean> = new Map([
  ['true', true],
  ['t', true],
  ['false', false],
  ['f', false],
]);

function finite(text: string): unknown {
  const value = Number(text);
  return Number.isFinite(value) ? value : NO_READ_FORM;
}

/** The date and the time of a matching date-time, joined by `T`, with `suffix`. */
function dateTime(pattern: RegExp, text: string, suffix: string): unknown {
  return pattern.test(text)
    ? text.replace(pattern, `$1T$2${suffix}`)
    : NO_READ_FORM;
}

function json(text: string): unknown {
  const value: unknown = JSON.parse(text);
  return value === null ? NO_READ_FORM : value;
}

/** The readers of the base types whose read form is not their text. */
const READERS: ReadonlyMap<string, (text: string) => unknown> = new Map<
  string,
  (text: string) => unknown
>([
  ['int2', Number],
  ['int4', Number],
  ['float4', finite],
  ['float8', finite],
  ['numeric', (text) => (DECIMAL.test(text) ? text : NO_READ_FORM)],
  ['bool', (text) => BOOLEANS.get(text) ?? NO_READ_FORM],
  ['date', (text) => (DATE.test(text) ? text : NO_READ_FORM)],
  ['timestamp', (text) => dateTime(LOCAL, text, '')],
  ['timestamptz', (text) => dateTime(UTC, text, 'Z')],
  ['json', json],
  ['jsonb', json],
]);

function readScalar(text: string, type: ColumnType): unknown {
  const reader = type.enum ? undefined : READERS.get(type.base);
  return reader === undefined ? text : reader(text);
}

/** The read form of a value PostgreSQL printed as `text`, or `NO_READ_FORM`. */
export function readForm(text: string, type: ColumnType): unknown {
  if (!type.array) {
    return readScalar(text, type);
  }
  const elements = arrayElements(text);
  if (elements === undefined) {
    return NO_READ_FORM;
  }
  const values: Array<unknown> = [];
  for (const element of elements) {
    const value = element === null ? NO_READ_FORM : readScalar(element, type);
    if (value === NO_READ_FORM) {
      return NO_READ_FORM;
    }
    values.push(value);
  }
  return values;
}
