import type { JsonSchema, SchemaDialect } from './context';

/** A single allowed value, spelled for the target dialect. */
export function constant(
  value: string | number,
  dialect: SchemaDialect,
): JsonSchema {
  return dialect === 'openapi-3.0' ? { enum: [value] } : { const: value };
}

/**
 * A string a host may localize, such as a `title`, with the catalog's
 * `value` as its example, spelled for the target dialect. RFC 9457 lets a
 * title change between occurrences only for localization, which the
 * handler's `transform` does, so the schema admits any string (ADR 0020).
 * @ref https://www.rfc-editor.org/rfc/rfc9457#section-3.1.3
 * @ref https://json-schema.org/draft/2020-12/json-schema-validation#section-9.5 (`examples`)
 * @ref https://spec.openapis.org/oas/v3.0.4.html#fixed-fields-20 (`example`; a 3.0 Schema Object has no `examples`)
 */
export function localizable(value: string, dialect: SchemaDialect): JsonSchema {
  return dialect === 'openapi-3.0'
    ? { type: 'string', example: value }
    : { type: 'string', examples: [value] };
}
