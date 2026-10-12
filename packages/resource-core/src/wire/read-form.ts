/**
 * PostgreSQL's text read into the read form (SPEC 5.4): what a stored
 * value, printed in a UTC session with ISO dates, becomes on the wire, or
 * `UNREPRESENTABLE` for a value outside it (a year past 9999, a BC date,
 * `infinity`, `NaN`, a `NULL` element, the JSON `null` at the top), which a
 * storage adapter refuses to read (SPEC 12.8). The oracle reads what the
 * database stored with it (SPEC 7.3), and the field metadata a default's
 * constant (SPEC 8), which the catalog extracts in the same settings.
 * @packageDocumentation
 */
import type { ColumnType } from './column-type';

import { arrayElements } from './array-literal';

export const UNREPRESENTABLE: unique symbol = Symbol('unrepresentable');

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
  return Number.isFinite(value) ? value : UNREPRESENTABLE;
}

function matching(pattern: RegExp, text: string, wire: string): unknown {
  const match = pattern.exec(text);
  if (match === null) {
    return UNREPRESENTABLE;
  }
  const [, date = '', time = ''] = match;
  return wire.replace('$date', date).replace('$time', time);
}

function json(text: string): unknown {
  const value: unknown = JSON.parse(text);
  return value === null ? UNREPRESENTABLE : value;
}

const READERS: Readonly<Record<string, (text: string) => unknown>> = {
  int2: Number,
  int4: Number,
  float4: finite,
  float8: finite,
  numeric: (text) => (DECIMAL.test(text) ? text : UNREPRESENTABLE),
  bool: (text) => BOOLEANS.get(text) ?? UNREPRESENTABLE,
  date: (text) => (DATE.test(text) ? text : UNREPRESENTABLE),
  timestamp: (text) => matching(LOCAL, text, '$dateT$time'),
  timestamptz: (text) => matching(UTC, text, '$dateT$timeZ'),
  json,
  jsonb: json,
};

function readScalar(text: string, type: ColumnType): unknown {
  const reader =
    type.enum || !Object.hasOwn(READERS, type.base)
      ? undefined
      : READERS[type.base];
  return reader === undefined ? text : reader(text);
}

/** The wire value of a stored value PostgreSQL printed as `text`. */
export function readForm(text: string, type: ColumnType): unknown {
  if (!type.array || type.base === 'json' || type.base === 'jsonb') {
    return readScalar(text, type);
  }
  const elements = arrayElements(text);
  if (elements === undefined) {
    return UNREPRESENTABLE;
  }
  const texts = elements.filter((element) => element !== null);
  if (texts.length < elements.length) {
    return UNREPRESENTABLE;
  }
  const values = texts.map((element) => readScalar(element, type));
  return values.includes(UNREPRESENTABLE) ? UNREPRESENTABLE : values;
}
