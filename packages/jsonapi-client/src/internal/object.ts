/**
 * Reads of the server's JSON. A response body is parsed JSON, so its
 * objects are read only through `Object.hasOwn`: a member named
 * `constructor` or `__proto__` is a plain key and never a prototype walk.
 * @packageDocumentation
 */

/** A JSON object: a non-null, non-array object. */
export type JsonRecord = Readonly<Record<string, unknown>>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Own-property read that cannot reach the prototype chain. */
export function ownMember(record: JsonRecord, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Sets an own enumerable data property, so a name such as `__proto__` stays a plain key. */
export function defineMember(
  target: object,
  name: string,
  value: unknown,
): void {
  Object.defineProperty(target, name, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
