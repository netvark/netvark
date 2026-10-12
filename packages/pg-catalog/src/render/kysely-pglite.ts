/**
 * The PGlite table of SPEC 9.2 (ADR 0013): the TypeScript type PGlite's own
 * parsers return for a column, as `PGliteDialect` reads it through
 * `query()`, and the parameter values its serializers send. PGlite parses
 * and serializes the elements of every array type with the element type's
 * own parser and serializer; a domain has neither, so the elements of an
 * array of one stay text, and a domain's parameter is sent with
 * `toString()`, which writes PostgreSQL's text only for strings, numbers,
 * bigints, and booleans.
 * @ref https://github.com/electric-sql/pglite/blob/%40electric-sql/pglite%400.5.8/packages/pglite/src/types.ts
 * @ref https://github.com/electric-sql/pglite/blob/%40electric-sql/pglite%400.5.8/packages/pglite/src/base.ts (_initArrayTypes, #runQuery)
 * @ref https://pglite.dev/docs/api#refresharraytypes
 * @packageDocumentation
 */
import type { DriverTable, Scalar } from './kysely-type-table';

import {
  arrayOf,
  arrayParameter,
  BOOLEAN,
  NUMBER,
  NUMERIC_TEXT,
  ts,
} from './kysely-type-table';

const TEXT_ONLY = ts('string');
/** A number within ±(2^53 - 1), a bigint beyond. */
const INT8: Scalar = {
  select: ts('number | bigint'),
  insert: ts('string | number | bigint'),
};
const TIMESTAMP: Scalar = {
  select: ts('Date'),
  insert: ts('Date | string'),
  text: TEXT_ONLY,
};
// The serializer refuses anything but a Uint8Array, text included.
const BYTEA: Scalar = {
  select: ts('Uint8Array'),
  insert: ts('Uint8Array'),
  text: TEXT_ONLY,
};
const JSON_VALUE: Scalar = {
  select: ts('JsonValue', 'JsonValue'),
  insert: ts('JsonParameter', 'JsonParameter', 'JsonValue'),
  text: TEXT_ONLY,
};

/** PGlite's parsers and serializers by type name; every other type is returned and sent as text. */
const SCALARS: ReadonlyMap<string, Scalar> = new Map([
  ['int2', NUMBER],
  ['int4', NUMBER],
  ['oid', NUMBER],
  ['float4', NUMBER],
  ['float8', NUMBER],
  ['int8', INT8],
  ['numeric', NUMERIC_TEXT],
  ['bool', BOOLEAN],
  ['date', TIMESTAMP],
  ['timestamp', TIMESTAMP],
  ['timestamptz', TIMESTAMP],
  ['bytea', BYTEA],
  ['json', JSON_VALUE],
  ['jsonb', JSON_VALUE],
]);

export const PGLITE_TYPES: DriverTable = {
  scalars: SCALARS,
  array: (ref, element) => {
    const insert = arrayParameter(element.insert);
    return {
      select:
        ref.typeKind === 'domain'
          ? arrayOf(TEXT_ONLY)
          : arrayOf(element.select),
      insert,
      update: insert,
    };
  },
  domainParameter: (base, types) => {
    if (base.array) {
      return TEXT_ONLY;
    }
    const scalar =
      base.typeKind === 'base' ? SCALARS.get(base.type) : undefined;
    return scalar?.text ?? types.insert;
  },
};
