/**
 * The OpenAPI format of each base type that has one (SPEC 5.1, 8): the
 * name a field's metadata gives as `format` and the name a format issue
 * gives as `expected` (SPEC 6.4), from one table so the two never differ.
 * An `int2` or `int4` id travels as text and still names its number's
 * format (SPEC 3.4).
 * @ref https://spec.openapis.org/registry/format/
 * @packageDocumentation
 */

/** The base types with a format. */
type FormattedType =
  | 'int2'
  | 'int4'
  | 'int8'
  | 'numeric'
  | 'float4'
  | 'float8'
  | 'uuid'
  | 'date'
  | 'timestamp'
  | 'timestamptz';

/** Each base type's format; the text types, `bool`, and the JSON types have none. */
export const WIRE_FORMATS: Readonly<Record<FormattedType, string>> =
  Object.freeze({
    int2: 'int16',
    int4: 'int32',
    int8: 'int64',
    numeric: 'decimal',
    float4: 'float',
    float8: 'double',
    uuid: 'uuid',
    date: 'date',
    timestamp: 'date-time-local',
    timestamptz: 'date-time',
  });
