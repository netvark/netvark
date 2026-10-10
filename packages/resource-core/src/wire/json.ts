/**
 * The `json` and `jsonb` wire form (SPEC 5.1, 5.2): any JSON value, with
 * `null` at the top level meaning SQL `NULL`, so a `null` the column takes
 * goes through nullability (SPEC 6.1) and the JSON value `null` stored at
 * the top level has no read form. Captured on PostgreSQL 14 and 18:
 * `jsonb` fails with 22P05 on `\u0000` and with 22P02 on an unpaired
 * surrogate escape, in strings and keys alike, where `json` keeps the text
 * as sent. Only plain objects, arrays, strings, finite numbers, booleans,
 * and nested `null`s are JSON values; anything else would change in
 * `JSON.stringify` on its way to the database.
 * @ref https://www.postgresql.org/docs/18/datatype-json.html
 * @ref https://www.rfc-editor.org/rfc/rfc8259
 * @packageDocumentation
 */
import type { Violation } from '../schema/issue-kinds';

import { isStorableText, TEXT_FORMAT } from './text';

/** A value that is not JSON. */
const JSON_FORMAT: Violation = Object.freeze({
  kind: 'format',
  expected: 'json',
});

/** A violation inside a JSON value, with the keys and indexes that lead to it. */
export interface JsonViolation {
  readonly path: ReadonlyArray<string | number>;
  readonly violation: Violation;
}

interface Visit {
  readonly value: unknown;
  readonly key: string | number | undefined;
  readonly parent: Visit | undefined;
}

function pathOf(visit: Visit): ReadonlyArray<string | number> {
  const path: Array<string | number> = [];
  for (
    let at: Visit | undefined = visit;
    at?.key !== undefined;
    at = at.parent
  ) {
    path.unshift(at.key);
  }
  return path;
}

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** The violation of a value that has no children, or `undefined` for one that is fine. */
function scalarViolation(
  value: unknown,
  jsonb: boolean,
): Violation | undefined {
  if (typeof value === 'string') {
    return jsonb && !isStorableText(value) ? TEXT_FORMAT : undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? undefined : JSON_FORMAT;
  }
  return value === null || typeof value === 'boolean' ? undefined : JSON_FORMAT;
}

/** The children of an array or a plain object, or `undefined` for any other value. */
function childrenOf(visit: Visit): ReadonlyArray<Visit> | undefined {
  const { value } = visit;
  if (Array.isArray(value)) {
    return Array.from(value, (element: unknown, index) => ({
      value: element,
      key: index,
      parent: visit,
    }));
  }
  if (typeof value === 'object' && value !== null && isPlainObject(value)) {
    return Object.entries(value).map(([key, member]: [string, unknown]) => ({
      value: member,
      key,
      parent: visit,
    }));
  }
  return undefined;
}

function keyViolation(visit: Visit, jsonb: boolean): JsonViolation | undefined {
  return jsonb && typeof visit.key === 'string' && !isStorableText(visit.key)
    ? { path: pathOf(visit), violation: TEXT_FORMAT }
    : undefined;
}

/**
 * The first violation in a JSON value, depth first. The walk keeps its own
 * stack, so a deeply nested value cannot overflow the call stack.
 */
export function jsonViolation(
  value: unknown,
  jsonb: boolean,
): JsonViolation | undefined {
  const stack: Array<Visit> = [{ value, key: undefined, parent: undefined }];
  for (let visit = stack.pop(); visit !== undefined; visit = stack.pop()) {
    const badKey = keyViolation(visit, jsonb);
    if (badKey !== undefined) {
      return badKey;
    }
    const children = childrenOf(visit);
    if (children === undefined) {
      const violation = scalarViolation(visit.value, jsonb);
      if (violation !== undefined) {
        return { path: pathOf(visit), violation };
      }
    } else {
      stack.push(...children.toReversed());
    }
  }
  return undefined;
}
