/**
 * Prototype-safe object helpers. Catalog keys and declaration keys are
 * PostgreSQL names, and `constructor` or `toString` is a valid column name,
 * so every lookup asks for an own member and never meets
 * `Object.prototype`.
 * @packageDocumentation
 */

/** A non-null object that is not an array. */
export function isRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The own member `key` of `record`, or `undefined` when it has none. */
export function ownValue<TValue>(
  record: Readonly<Record<string, TValue>>,
  key: string,
): TValue | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** A value for an error message: JSON text, or its type when it has none. */
export function describe(value: unknown): string {
  try {
    const text: unknown = JSON.stringify(value);
    if (typeof text === 'string') {
      return text;
    }
  } catch {
    // A circular value or a bigint has no JSON text; its type is enough.
  }
  return typeof value;
}
