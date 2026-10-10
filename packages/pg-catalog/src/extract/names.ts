/**
 * Reference names and the keys of the generated object literals (SPEC 2.1,
 * 2.10).
 * @packageDocumentation
 */
import { PgCatalogError } from '../errors';
import { compareCodeUnits } from '../internal/code-units';

/**
 * The name an object is keyed and referred to by: bare in the default
 * schema (the first configured one) and in `pg_catalog`, `<schema>.<name>`
 * elsewhere. Names are PostgreSQL's own, never case-folded or quoted.
 */
export function referenceName(
  schema: string,
  name: string,
  defaultSchema: string,
): string {
  return schema === defaultSchema || schema === 'pg_catalog'
    ? name
    : `${schema}.${name}`;
}

/** " of <owner>" for messages, or nothing for top-level objects. */
function ownedBy(owner: string): string {
  return owner === '' ? '' : ` of ${owner}`;
}

/**
 * Rejects `__proto__`: an object literal with that key sets its prototype
 * instead of creating a member, so the generated module would lose the
 * object. `kind` and `owner` name it in the message ("the column
 * "__proto__" of table contacts").
 * @ref https://tc39.es/ecma262/#sec-__proto__-property-names-in-object-initializers
 */
export function assertSafeKey(key: string, kind: string, owner = ''): void {
  if (key === '__proto__') {
    throw new PgCatalogError(
      'unsafe_name',
      `the ${kind} "__proto__"${ownedBy(owner)} cannot be a key of the generated catalog; rename it`,
    );
  }
}

function toRecord<TValue>(
  entries: ReadonlyArray<readonly [string, TValue]>,
  kind: string,
  owner: string,
): Record<string, TValue> {
  const record: Record<string, TValue> = {};
  for (const [key, value] of entries) {
    assertSafeKey(key, kind, owner);
    if (Object.hasOwn(record, key)) {
      throw new PgCatalogError(
        'duplicate_key',
        `two objects map to the ${kind} key "${key}"${ownedBy(owner)}`,
      );
    }
    record[key] = value;
  }
  return record;
}

/** A record of the entries in the given order (columns, by `attnum`), after the key checks. */
export function orderedRecord<TValue>(
  entries: ReadonlyArray<readonly [string, TValue]>,
  kind: string,
  owner = '',
): Record<string, TValue> {
  return toRecord(entries, kind, owner);
}

/** A record of the entries ordered by key in UTF-16 code units, after the key checks. */
export function sortedRecord<TValue>(
  entries: ReadonlyArray<readonly [string, TValue]>,
  kind: string,
  owner = '',
): Record<string, TValue> {
  return toRecord(
    entries.toSorted(([left], [right]) => compareCodeUnits(left, right)),
    kind,
    owner,
  );
}
