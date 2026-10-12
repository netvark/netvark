/**
 * The node-postgres table of SPEC 9.2: the TypeScript type node-postgres's
 * default parsers (pg-types 2.x) return for a column, and the parameter
 * values it serializes into text PostgreSQL accepts. node-postgres sends an
 * object without `toPostgres` as JSON, so a parsed point or circle cannot
 * be sent back and is written as text, and a JSON array would become a
 * PostgreSQL array literal, so JSON is written as text. The driver sees a
 * domain as its base type, but an array of a domain as an array type of
 * its own, which pg-types does not parse.
 * @ref https://github.com/brianc/node-pg-types/blob/v2.2.0/lib/textParsers.js
 * @ref https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/utils.js (prepareValue)
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/access/common/printtup.c (SendRowDescriptionMessage sends getBaseType)
 * @packageDocumentation
 */
import type { DriverTable, Scalar } from './kysely-type-table';

import {
  arrayOf,
  arrayParameter,
  BOOLEAN,
  NUMBER,
  NUMERIC_TEXT,
  same,
  TEXT,
  ts,
} from './kysely-type-table';

const BYTEA = same('Buffer');
const INT8: Scalar = {
  select: ts('string'),
  insert: ts('string | number | bigint'),
};
const TIMESTAMP: Scalar = { select: ts('Date'), insert: ts('Date | string') };
const INTERVAL: Scalar = {
  select: ts('PostgresInterval', 'PostgresInterval'),
  insert: ts('PostgresInterval | string', 'PostgresInterval'),
};
const JSON_TEXT: Scalar = {
  select: ts('JsonValue', 'JsonValue'),
  insert: ts('string'),
};
const POINT: Scalar = { select: ts('Point', 'Point'), insert: ts('string') };

/** pg-types's scalar parsers by type name; every other type is returned as text. */
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
  ['interval', INTERVAL],
  ['bytea', BYTEA],
  ['json', JSON_TEXT],
  ['jsonb', JSON_TEXT],
  ['point', POINT],
  ['circle', { select: ts('Circle', 'Circle'), insert: ts('string') }],
]);

const TEXT_ARRAYS = [
  'bpchar',
  'varchar',
  'text',
  'regproc',
  'uuid',
  'inet',
  'cidr',
  'macaddr',
  'money',
  'time',
  'timetz',
  'numrange',
];

/** The element types of the arrays pg-types parses; it parses `numeric[]` as floats. */
const PARSED_ARRAYS: ReadonlyMap<string, Scalar> = new Map([
  ['bool', BOOLEAN],
  ['int2', NUMBER],
  ['int4', NUMBER],
  ['oid', NUMBER],
  ['float4', NUMBER],
  ['float8', NUMBER],
  ['int8', INT8],
  ['numeric', { select: ts('number'), insert: ts('string | number') }],
  ...TEXT_ARRAYS.map((name): [string, Scalar] => [name, TEXT]),
  ['date', TIMESTAMP],
  ['timestamp', TIMESTAMP],
  ['timestamptz', TIMESTAMP],
  ['interval', INTERVAL],
  ['bytea', BYTEA],
  ['json', JSON_TEXT],
  ['jsonb', JSON_TEXT],
  ['point', POINT],
]);

export const NODE_POSTGRES_TYPES: DriverTable = {
  scalars: SCALARS,
  array: (ref, element) => {
    const parsed =
      ref.typeKind === 'base' || ref.typeKind === 'range'
        ? PARSED_ARRAYS.get(ref.type)
        : undefined;
    if (parsed !== undefined) {
      const insert = arrayParameter(parsed.insert);
      return { select: arrayOf(parsed.select), insert, update: insert };
    }
    // Every other array, an array of an enum or a domain included, is returned as text.
    return {
      select: ts('string'),
      insert: arrayParameter(element.insert),
      update: arrayParameter(element.update),
    };
  },
  // node-postgres serializes a value the same whatever type PostgreSQL gives the parameter.
  domainParameter: (_base, types) => types.insert,
};
