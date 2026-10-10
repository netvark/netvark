/**
 * The type table of SPEC 9.2: the TypeScript type node-postgres's default
 * parsers (pg-types 2.x) return for a column, and the parameter values it
 * serializes into text PostgreSQL accepts. node-postgres sends an object
 * without `toPostgres` as JSON, so a parsed point or circle cannot be sent
 * back and is written as text, and a JSON array would become a PostgreSQL
 * array literal, so JSON is written as text. The driver sees a domain as
 * its base type, but an array of a domain as an array type of its own,
 * which pg-types does not parse.
 * @ref https://github.com/brianc/node-pg-types/blob/v2.2.0/lib/textParsers.js
 * @ref https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/utils.js (prepareValue)
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/access/common/printtup.c (SendRowDescriptionMessage sends getBaseType)
 * @packageDocumentation
 */
import type { Catalog, TypeKind } from '@netvark/catalog-core';

/** The helper types a generated file declares when it uses them. */
export type Helper = 'JsonValue' | 'PostgresInterval' | 'Point' | 'Circle';

/** A TypeScript type and the helper types it mentions. */
export interface TsType {
  readonly text: string;
  readonly helpers: ReadonlyArray<Helper>;
}

/** A column's types in Kysely's three positions. */
export interface PositionTypes {
  readonly select: TsType;
  readonly insert: TsType;
  readonly update: TsType;
}

/** A column's or a domain's type: its reference name, its kind, and whether it is an array of it. */
export interface TypeRef {
  readonly type: string;
  readonly typeKind: TypeKind;
  readonly array: boolean;
}

/** What the mapping reads besides the type. */
export interface MappingContext {
  readonly catalog: Catalog;
  /** The TypeScript name of each enum, by reference name. */
  readonly enumNames: ReadonlyMap<string, string>;
  /** `types.overrides` by type key (`int8`, `int8[]`). */
  readonly overrides: ReadonlyMap<string, PositionTypes>;
}

interface Scalar {
  readonly select: TsType;
  readonly insert: TsType;
}

function ts(text: string, ...helpers: ReadonlyArray<Helper>): TsType {
  return { text, helpers };
}

function same(text: string, ...helpers: ReadonlyArray<Helper>): Scalar {
  return { select: ts(text, ...helpers), insert: ts(text, ...helpers) };
}

const NUMBER = same('number');
const TEXT = same('string');
const BOOLEAN = same('boolean');
const BYTEA = same('Buffer');
/** A domain whose definition lies outside the configured schemas: its base type is not known. */
const UNKNOWN = same('unknown');
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
  ['numeric', { select: ts('string'), insert: ts('string | number') }],
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

function positions(scalar: Scalar): PositionTypes {
  return {
    select: scalar.select,
    insert: scalar.insert,
    update: scalar.insert,
  };
}

/** `Array<T> | string`: an array, or PostgreSQL's array text. */
function arrayParameter(element: TsType): TsType {
  return ts(`Array<${element.text}> | string`, ...element.helpers);
}

function scalarOf(ref: TypeRef, context: MappingContext): Scalar {
  if (ref.typeKind === 'enum') {
    const name = context.enumNames.get(ref.type);
    // An enum outside the configured schemas is still returned as its label.
    return name === undefined ? TEXT : same(name);
  }
  return ref.typeKind === 'base' ? (SCALARS.get(ref.type) ?? TEXT) : TEXT;
}

function arrayOf(ref: TypeRef, context: MappingContext): PositionTypes {
  const parsed =
    ref.typeKind === 'base' || ref.typeKind === 'range'
      ? PARSED_ARRAYS.get(ref.type)
      : undefined;
  if (parsed !== undefined) {
    const select = ts(`Array<${parsed.select.text}>`, ...parsed.select.helpers);
    return positions({ select, insert: arrayParameter(parsed.insert) });
  }
  // Every other array, an array of an enum or a domain included, is returned as text.
  const element = mapType({ ...ref, array: false }, context);
  return {
    select: ts('string'),
    insert: arrayParameter(element.insert),
    update: arrayParameter(element.update),
  };
}

/**
 * The three types of a column or domain of type `ref`. An override for the
 * type's key (`<type>`, or `<type>[]` for an array) wins; a domain resolves
 * to its base type, the nearest override on the way winning.
 */
export function mapType(ref: TypeRef, context: MappingContext): PositionTypes {
  const override = context.overrides.get(
    ref.array ? `${ref.type}[]` : ref.type,
  );
  if (override !== undefined) {
    return override;
  }
  if (ref.typeKind === 'domain' && !ref.array) {
    const domain = context.catalog.domains[ref.type];
    return domain === undefined ? positions(UNKNOWN) : mapType(domain, context);
  }
  return ref.array ? arrayOf(ref, context) : positions(scalarOf(ref, context));
}
