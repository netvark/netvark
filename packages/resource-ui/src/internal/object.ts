/**
 * Prototype-safe lookups. Public names come from PostgreSQL names, and
 * `constructor` or `toString` is a valid one, so every lookup asks for an
 * own member and never meets `Object.prototype`.
 * @packageDocumentation
 */

/** A non-null object. */
export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** A non-null object that is not an array, read by key: an options object, a record, linkage. */
export function isRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return isObject(value) && !Array.isArray(value);
}

/** The own member `key` of `record`, or `undefined` when it has none. */
export function ownValue<TValue>(
  record: Readonly<Record<string, TValue>>,
  key: string,
): TValue | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
