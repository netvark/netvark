/**
 * Object helpers for data that came from a client. Parsed JSON and parsed
 * query strings are read only through `Object.hasOwn`, so a member named
 * `constructor` or `__proto__` is a plain key and never a prototype walk.
 * @packageDocumentation
 */

/** A JSON object: a non-null, non-array object. */
export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Own-property read that cannot reach the prototype chain. */
export function ownMember(record: JsonRecord, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export function hasOwnMember(record: JsonRecord, key: string): boolean {
  return Object.hasOwn(record, key);
}

/**
 * Own-property read of a typed record keyed by a client-supplied name: a
 * definition's relationships or filter fields looked up by a name from a
 * request. `record['constructor']` would otherwise hand back
 * `Object.prototype.constructor`.
 */
export function ownEntry<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** The own, enumerable keys of a client object, in insertion order. */
export function ownKeys(record: JsonRecord): Array<string> {
  return Object.keys(record);
}

/**
 * A shallow copy without the members whose value is `undefined`, so optional
 * members never serialize as gaps and `toEqual` comparisons see no phantom
 * keys. Member order is preserved.
 */
export function compact<T extends object>(value: T): T {
  const out: T = { ...value };
  for (const [key, member] of Object.entries(value)) {
    if (member === undefined) {
      Reflect.deleteProperty(out, key);
    }
  }
  return out;
}
