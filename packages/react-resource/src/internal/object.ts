/**
 * Prototype-safe checks of what a JavaScript caller hands the bindings.
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
