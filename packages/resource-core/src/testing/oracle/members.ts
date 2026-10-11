/**
 * What the case builders share: a declared column, a member's probe, a
 * schema's verdict, and the text of a value a member, a validator, or a
 * codec sends (SPEC 7.3).
 * @packageDocumentation
 */
import type { $ZodType } from 'zod/v4/core';

import type { DeclaredInternals } from '../../declare/declared-resource';
import type { MemberSpec } from '../../schema/field-spec';
import type { ColumnType } from './column-type';

import { safeParse } from 'zod/v4/core';

import { describe, ownValue } from '../../internal/object';
import { columnType } from './column-type';
import { parameterText } from './pg-text';

/**
 * A storage codec over text (SPEC 7.1): `write` gives the text PostgreSQL
 * reads for a value of its codec, and `read` takes the text it prints.
 * `write` takes `never` here, so the storage codec of any codec fits.
 */
export interface TextStorageCodec {
  readonly read: (stored: string) => unknown;
  readonly write: (value: never) => string;
}

/** The oracle's storage codecs, by codec name. */
export type TextStorage = Readonly<Record<string, TextStorageCodec>>;

/**
 * Writes `value`, a value of the codec `codec` belongs to: a codec's
 * fixtures and its storage codec meet by the codec's name, which TypeScript
 * cannot follow through a registry, so the text is checked instead.
 * Throws what `write` throws, and `TypeError` for anything but text.
 */
export function writeText(codec: TextStorageCodec, value: unknown): string {
  const text: unknown = Reflect.apply(codec.write, undefined, [value]);
  if (typeof text !== 'string') {
    throw new TypeError(`write returned ${describe(text)}, not text`);
  }
  return text;
}

/** Whether `schema` accepts `value`. */
export function accepts(schema: $ZodType, value: unknown): boolean {
  return safeParse(schema, value).success;
}

/** The type of a column of the resource's table. */
export function columnTypeOf(
  internals: DeclaredInternals,
  column: string,
): ColumnType {
  const table = ownValue(internals.catalog.tables, internals.resource.table);
  const definition =
    table === undefined ? undefined : ownValue(table.columns, column);
  if (definition === undefined) {
    throw new TypeError(
      `oracleCases: ${internals.resource.table}.${column} is not in the resource's catalog`,
    );
  }
  return columnType(internals.catalog, definition);
}

/**
 * The table's CHECKs a member's copy holds: those over its column alone
 * that its schema enforces, each with a rule (unless a codec owns the
 * value, SPEC 6.1) or with the validator the declaration names.
 */
export function memberChecks(
  internals: DeclaredInternals,
  spec: MemberSpec,
): ReadonlyArray<string> {
  const table = ownValue(internals.catalog.tables, internals.resource.table);
  const ruled =
    table === undefined || spec.value.form.kind === 'codec'
      ? []
      : Object.entries(table.constraints)
          .filter(
            ([, constraint]) =>
              constraint.kind === 'check' &&
              constraint.enforced &&
              constraint.rule !== null &&
              constraint.columns.length === 1 &&
              constraint.columns[0] === spec.column,
          )
          .map(([name]) => name);
  const validated = spec.value.validators
    .filter((use) => use.check.domain === null)
    .map((use) => use.check.constraint);
  return [...ruled, ...validated];
}

/**
 * How a member writes a value: a codec's value through its storage codec,
 * any other value, a relationship's id included, as the text of its wire
 * form. Throws what a storage codec's `write` throws.
 */
export function memberText(
  internals: DeclaredInternals,
  spec: MemberSpec,
  storage: TextStorage,
): (value: unknown) => string | null {
  const { form } = spec.value;
  if (form.kind === 'codec') {
    const codec = storageOf(storage, form.name, internals, spec);
    return (value) => (value === null ? null : writeText(codec, value));
  }
  const type = columnTypeOf(internals, spec.column);
  return (value) => (value === null ? null : parameterText(value, type));
}

/** The storage codec of `name`; `TypeError` when the options give none. */
export function storageOf(
  storage: TextStorage,
  name: string,
  internals: DeclaredInternals,
  spec: MemberSpec,
): TextStorageCodec {
  const codec = ownValue(storage, name);
  if (codec === undefined) {
    throw new TypeError(
      `oracleCases.options.storage.${name}: must be a storage codec over text, since ${internals.resource.names.type}.${spec.name} names codec ${name}`,
    );
  }
  return codec;
}
