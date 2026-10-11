/**
 * The contract suite's assertions: no test runner, so an adapter package
 * runs the cases under its own (SPEC 12.9). Values compare as the JSON a
 * row or an event is: arrays element by element, plain objects by their
 * own enumerable keys, which must match exactly, so a key holding
 * `undefined` differs from a missing one, and everything else with
 * `Object.is`.
 * @packageDocumentation
 */

/** A failed check of the storage contract. */
export class ContractFailure extends Error {
  public override readonly name: string = 'ContractFailure';
}

function isPlainObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Whether two values are the same JSON value, keys in any order. */
export function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item: unknown, index) => sameValue(item, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = Object.keys(left).toSorted();
    const otherKeys = Object.keys(right).toSorted();
    return (
      sameValue(keys, otherKeys) &&
      keys.every((key) => sameValue(left[key], right[key]))
    );
  }
  return Object.is(left, right);
}

/** A value for a failure message: JSON, with `undefined` and big integers spelled out. */
function show(value: unknown): string {
  if (
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    return String(value);
  }
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === undefined) {
      return '<undefined>';
    }
    return typeof item === 'bigint' ? `${String(item)}n` : item;
  });
}

/** Throws `ContractFailure` naming `what` unless `actual` is the same JSON value as `expected`. */
export function assertEqual(
  actual: unknown,
  expected: unknown,
  what: string,
): void {
  if (!sameValue(actual, expected)) {
    throw new ContractFailure(
      `${what}: expected ${show(expected)}, got ${show(actual)}`,
    );
  }
}

/** Throws `ContractFailure` naming `what` unless `condition` holds. */
export function assertThat(condition: boolean, what: string): void {
  if (!condition) {
    throw new ContractFailure(what);
  }
}

/** What `promise` rejects with; throws `ContractFailure` naming `what` when it resolves instead. */
export async function rejection(
  promise: Promise<unknown>,
  what: string,
): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new ContractFailure(`${what}: expected a rejection, but it resolved`);
}
