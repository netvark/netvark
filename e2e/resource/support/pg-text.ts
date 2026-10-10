/**
 * Wire values as PostgreSQL parameter text, and one-dimensional array
 * literals back into their elements (resource SPEC 15.3). node-postgres
 * sends a string parameter as UTF-8, so an unpaired surrogate reaches the
 * server as U+FFFD (resource SPEC 5.2).
 * @ref https://www.postgresql.org/docs/18/arrays.html#ARRAYS-IO
 */
import type { ColumnType } from './column-type.ts';

const NULL_ELEMENT = 'NULL';

function scalarText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value);
}

/** An element double-quoted, with `"` and `\` escaped, so any text survives. */
function elementText(value: unknown): string {
  const text = scalarText(value);
  return typeof value === 'string'
    ? `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
    : text;
}

/** The text PostgreSQL reads `value` from for a column of `type`. */
export function parameterText(value: unknown, type: ColumnType): string {
  if (type.base === 'json' || type.base === 'jsonb') {
    return JSON.stringify(value);
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
