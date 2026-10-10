/**
 * Startup checks of a value's shape, for declarations written in JavaScript
 * or assembled at runtime (SPEC 14). Each throws `TypeError` starting with
 * the option's path; a member set to `undefined` counts as absent.
 * @packageDocumentation
 */
import { describe, isRecord } from './object';

/** `value` as a record, or a `TypeError`. */
export function expectRecord(
  path: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new TypeError(
      `${path}: must be an object, received ${describe(value)}`,
    );
  }
  return value;
}

/** Rejects a member outside `known`, so a misspelled option fails instead of being ignored. */
export function expectKnownKeys(
  path: string,
  value: Readonly<Record<string, unknown>>,
  known: ReadonlyArray<string>,
): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key) && value[key] !== undefined) {
      throw new TypeError(`${path}: unknown member "${key}"`);
    }
  }
}

/** An optional string member. */
export function optionalString(
  path: string,
  value: unknown,
): string | undefined {
  if (value === undefined || typeof value === 'string') {
    return value;
  }
  throw new TypeError(`${path}: must be a string, received ${describe(value)}`);
}

/** An optional boolean member. */
export function optionalBoolean(
  path: string,
  value: unknown,
): boolean | undefined {
  if (value === undefined || typeof value === 'boolean') {
    return value;
  }
  throw new TypeError(
    `${path}: must be a boolean, received ${describe(value)}`,
  );
}

/** An optional array member. */
export function optionalArray(
  path: string,
  value: unknown,
): ReadonlyArray<unknown> | undefined {
  if (value === undefined || Array.isArray(value)) {
    return value;
  }
  throw new TypeError(`${path}: must be an array, received ${describe(value)}`);
}

/** A string member drawn from `allowed`. */
export function expectOneOf<TValue extends string>(
  path: string,
  value: unknown,
  allowed: ReadonlyArray<TValue>,
): TValue {
  const found = allowed.find((candidate) => candidate === value);
  if (found === undefined) {
    throw new TypeError(
      `${path}: ${describe(value)} is not one of ${allowed.join(', ')}`,
    );
  }
  return found;
}

/** An optional positive integer member. */
export function optionalPositiveInteger(
  path: string,
  value: unknown,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(
      `${path}: must be a positive integer, received ${describe(value)}`,
    );
  }
  return value;
}

/**
 * A registry of named entries, each checked by `check` at `<path>.<name>`.
 * The result is a fresh record of what `check` returns, so the entry type
 * comes from the check itself rather than from an assertion.
 */
export function expectRegistry<TEntry>(
  path: string,
  value: unknown,
  check: (path: string, entry: unknown, name: string) => TEntry,
): Readonly<Record<string, TEntry>> {
  return Object.fromEntries(
    Object.entries(expectRecord(path, value)).map(([name, entry]) => [
      name,
      check(`${path}.${name}`, entry, name),
    ]),
  );
}
