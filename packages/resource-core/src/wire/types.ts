/**
 * The catalog types that have a wire form (SPEC 5.1). Types are matched by
 * reference name: built-in types are never qualified, and `citext`, an
 * extension type, matches in any schema (`extensions.citext` where the
 * extension lives outside the default schema).
 * @ref https://www.postgresql.org/docs/18/citext.html
 * @packageDocumentation
 */

/** The base types of SPEC 5.1, by reference name. */
export const WIRE_TYPES: ReadonlyArray<string> = [
  'text',
  'varchar',
  'bpchar',
  'citext',
  'int2',
  'int4',
  'int8',
  'numeric',
  'float4',
  'float8',
  'bool',
  'uuid',
  'date',
  'timestamp',
  'timestamptz',
  'json',
  'jsonb',
];

/** The JSON types, which have no array wire form: a `null` element would be ambiguous. */
export const JSON_TYPES: ReadonlyArray<string> = ['json', 'jsonb'];

/** `WIRE_TYPES` as a type. */
export type WireTypeName =
  | 'text'
  | 'varchar'
  | 'bpchar'
  | 'citext'
  | `${string}.citext`
  | 'int2'
  | 'int4'
  | 'int8'
  | 'numeric'
  | 'float4'
  | 'float8'
  | 'bool'
  | 'uuid'
  | 'date'
  | 'timestamp'
  | 'timestamptz'
  | 'json'
  | 'jsonb';

const QUALIFIED_CITEXT = /^.+\.citext$/u;

/** Whether a base type, by reference name, has a wire form. */
export function isWireType(type: string): boolean {
  return WIRE_TYPES.includes(type) || QUALIFIED_CITEXT.test(type);
}
