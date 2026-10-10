/**
 * JSON values and the two predicates the diff needs. The catalog model is
 * plain JSON data (SPEC 2), so the diff compares it as JSON: structurally,
 * with object members compared by key and arrays by position.
 * @ref https://www.rfc-editor.org/rfc/rfc8259
 * @packageDocumentation
 */

/** A JSON value: what `JSON.parse` returns, as readonly data. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

/** Whether `value` is an array; unlike `Array.isArray`, it narrows to `unknown` elements. */
function isArray(value: unknown): value is ReadonlyArray<unknown> {
  return Array.isArray(value);
}

/** Whether `value` is an object literal: not `null`, not an array, and not a class instance such as a `Date`. */
export function isPlainObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Whether `value` is JSON data all the way down; `undefined`, functions, and non-finite numbers are not. */
export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }
  return (
    isPlainObject(value) &&
    Object.values(value).every((item) => isJsonValue(item))
  );
}

/**
 * Structural equality of JSON data: arrays are equal element by element, in
 * order; objects when they have the same keys, in any order, with equal
 * values; everything else by `===`.
 */
export function jsonEqual(left: unknown, right: unknown): boolean {
  if (isArray(left) && isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => jsonEqual(item, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every(
        (key) => Object.hasOwn(right, key) && jsonEqual(left[key], right[key]),
      )
    );
  }
  return left === right;
}
