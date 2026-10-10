/**
 * What `defineCodec` and `defineValidator` check of a schema and its
 * fixtures (SPEC 7): the schema is a Zod 4 schema, from `zod` or
 * `zod/mini`, that parses synchronously, and a fixture list is non-empty.
 * Zod Core is the one surface both flavors share, so the schema is tested
 * with `instanceof $ZodType` and parsed with its `safeParse`.
 * @ref https://zod.dev/library-authors
 * @packageDocumentation
 */
import type { $ZodError } from 'zod/v4/core';

import { $ZodAsyncError, $ZodType, safeParse } from 'zod/v4/core';

/** `value` as a Zod 4 schema, or a `TypeError`. */
export function expectSchema(path: string, value: unknown): $ZodType {
  if (!(value instanceof $ZodType)) {
    throw new TypeError(`${path}: must be a Zod 4 schema (zod or zod/mini)`);
  }
  return value;
}

/** `value` as a non-empty list, or a `TypeError`. */
export function expectFixtureList(
  path: string,
  value: unknown,
): ReadonlyArray<unknown> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${path}: must be a non-empty list of values`);
  }
  return value;
}

/**
 * The error `schema` reports for `value`, or `undefined` when it accepts
 * the value. A schema that needs asynchronous parsing throws `TypeError`
 * at `schemaPath`: the composed schemas parse synchronously (SPEC 6), so a
 * codec or validator must too.
 */
export function rejection(
  schemaPath: string,
  schema: $ZodType,
  value: unknown,
): $ZodError | undefined {
  try {
    const result = safeParse(schema, value);
    return result.success ? undefined : result.error;
  } catch (error) {
    if (error instanceof $ZodAsyncError) {
      throw new TypeError(`${schemaPath}: must parse synchronously`, {
        cause: error,
      });
    }
    throw error;
  }
}
