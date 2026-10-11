/**
 * Wire values as the text PostgreSQL reads them from, and one-dimensional
 * array literals back into their elements (SPEC 5.1, 7.3). A driver sends
 * text as UTF-8, so an unpaired surrogate reaches the server as U+FFFD
 * (SPEC 5.2). A value is written as itself or not at all: one with no
 * text form is `Unwritable`, never sent as another value.
 * @ref https://www.postgresql.org/docs/18/arrays.html#ARRAYS-IO
 * @packageDocumentation
 */
import type { ColumnType } from './column-type';

import { sameJson } from './same-json';
import { Unwritable } from './unwritable';

const NULL_ELEMENT = 'NULL';

/**
 * The JSON text of `value`. JSON has no text for `undefined`, a function,
 * a symbol, a bigint, or a cycle, and writes some values as others: `NaN`
 * as `null`, a `Date` as its ISO text, an object without its `undefined`
 * members. Either way the database would judge another value, so the
 * value is `Unwritable`.
 * @ref https://tc39.es/ecma262/#sec-json.stringify
 */
function jsonText(value: unknown): string {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    // A bigint or a cycle; the runtime's message varies, the reason does not.
  }
  if (text === undefined) {
    throw new Unwritable('it has no text form');
  }
  const back: unknown = JSON.parse(text);
  if (!sameJson(back, value)) {
    throw new Unwritable(`JSON writes it as ${text}`);
  }
  return text;
}

function scalarText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
    ? String(value)
    : jsonText(value);
}

/** An element double-quoted, with `"` and `\` escaped, so any text survives. */
function elementText(value: unknown): string {
  const text = scalarText(value);
  return typeof value === 'string'
    ? `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
    : text;
}

/** The text PostgreSQL reads `value` from for a column of `type`; `Unwritable` when it has none. */
export function parameterText(value: unknown, type: ColumnType): string {
  if (type.base === 'json' || type.base === 'jsonb') {
    return jsonText(value);
  }
  return type.array && Array.isArray(value)
    ? `{${value.map((element: unknown) => elementText(element)).join(',')}}`
    : scalarText(value);
}

function quotedElement(body: string, start: number): readonly [string, number] {
  let value = '';
  let at = start + 1;
  while (at < body.length && body[at] !== '"') {
    if (body[at] === '\\') {
      at += 1;
    }
    value += body[at] ?? '';
    at += 1;
  }
  return [value, at + 1];
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
  const elements: Array<string | null> = [];
  let at = 0;
  while (at <= body.length) {
    if (body[at] === '{') {
      return undefined;
    }
    if (body[at] === '"') {
      const [value, next] = quotedElement(body, at);
      elements.push(value);
      at = next;
    } else {
      const end = body.includes(',', at) ? body.indexOf(',', at) : body.length;
      const raw = body.slice(at, end);
      elements.push(raw === NULL_ELEMENT ? null : raw);
      at = end;
    }
    at += 1;
  }
  return elements;
}
