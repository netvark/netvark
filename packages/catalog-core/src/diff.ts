import type { JsonValue } from './internal/json';
import type { Catalog } from './model';

/**
 * `diffCatalogs`: the structural difference between two catalogs, the
 * engine of drift detection (SPEC 4, ADR 0008).
 * @packageDocumentation
 */
import { isJsonValue, isPlainObject, jsonEqual } from './internal/json';

/**
 * One difference. `path` is the member names from the catalog root, such as
 * `["tables", "contacts", "columns", "email", "nullable"]`. An `added`
 * member exists only in the actual catalog and a `removed` one only in the
 * expected catalog, each with its whole value; a `changed` member holds
 * different values in both.
 */
export type CatalogChange =
  | {
      readonly kind: 'added';
      readonly path: ReadonlyArray<string>;
      readonly actual: JsonValue;
    }
  | {
      readonly kind: 'removed';
      readonly path: ReadonlyArray<string>;
      readonly expected: JsonValue;
    }
  | {
      readonly kind: 'changed';
      readonly path: ReadonlyArray<string>;
      readonly expected: JsonValue;
      readonly actual: JsonValue;
    };

/** The differences between two catalogs, depth first; empty when they are equal. */
export interface CatalogDiff {
  readonly changes: ReadonlyArray<CatalogChange>;
}

function json(value: unknown, path: ReadonlyArray<string>): JsonValue {
  if (isJsonValue(value)) {
    return value;
  }
  throw new TypeError(
    `catalog member ${JSON.stringify(path)} is not JSON data`,
  );
}

function walk(
  expected: unknown,
  actual: unknown,
  path: ReadonlyArray<string>,
  changes: Array<CatalogChange>,
): void {
  if (!isPlainObject(expected) || !isPlainObject(actual)) {
    if (!jsonEqual(expected, actual)) {
      changes.push({
        kind: 'changed',
        path,
        expected: json(expected, path),
        actual: json(actual, path),
      });
    }
    return;
  }
  for (const key of Object.keys(expected)) {
    const member = [...path, key];
    if (Object.hasOwn(actual, key)) {
      walk(expected[key], actual[key], member, changes);
    } else {
      changes.push({
        kind: 'removed',
        path: member,
        expected: json(expected[key], member),
      });
    }
  }
  for (const key of Object.keys(actual)) {
    if (!Object.hasOwn(expected, key)) {
      const member = [...path, key];
      changes.push({
        kind: 'added',
        path: member,
        actual: json(actual[key], member),
      });
    }
  }
}

/**
 * Compares `expected` (usually the committed catalog) with `actual` (usually
 * a live database's) member by member. Objects recurse; arrays and scalars
 * compare as whole values, so an enum that gained a label is one `changed`
 * entry holding both label lists. Changes visit the members of `expected`
 * in order, then the members only `actual` has. Catalogs of different
 * `format` throw `TypeError`, because their members are not comparable.
 */
export function diffCatalogs(expected: Catalog, actual: Catalog): CatalogDiff {
  const expectedFormat: unknown = expected.format;
  const actualFormat: unknown = actual.format;
  if (expectedFormat !== actualFormat) {
    throw new TypeError(
      `cannot compare catalogs of format ${JSON.stringify(expectedFormat)} and ${JSON.stringify(actualFormat)}`,
    );
  }
  const changes: Array<CatalogChange> = [];
  walk(expected, actual, [], changes);
  return { changes };
}
