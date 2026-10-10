/**
 * JSON Schema for the JSON:API error document (SPEC 7.2.3): a closed
 * `{ errors: [ErrorObject, ...] }` whose error objects are closed too and,
 * unless the document may mix entries, pin `status`, `code`, and `title` to
 * the definition.
 * @ref https://jsonapi.org/format/#error-objects
 * @packageDocumentation
 */
import type { ResolvedDefinition } from '../../core/definition';
import type { JsonSchema, SchemaContext } from '../context';

import { constant } from '../schema-helpers';

/**
 * Top-level members of every error document (SPEC 7.2.5). Static: a value
 * that depends on the request belongs in the handler's `transform`.
 * @ref https://jsonapi.org/format/#document-top-level
 * @ref https://jsonapi.org/format/#document-jsonapi-object
 */
export interface JsonApiDocumentMembers {
  /** The `jsonapi` object, for example `{ version: '1.1' }`. */
  readonly jsonapi?: Readonly<Record<string, unknown>> | undefined;
  readonly links?: Readonly<Record<string, unknown>> | undefined;
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
}

export interface JsonApiSchemaOptions {
  readonly includeId: boolean;
  readonly mixedEntries: boolean;
  readonly document: JsonApiDocumentMembers | undefined;
}

/** `status` is the HTTP status as a string: three digits, 4xx or 5xx. */
const STATUS_PATTERN = '^[45][0-9]{2}$';

function identity(
  definition: ResolvedDefinition,
  ctx: SchemaContext,
  pinned: boolean,
): Record<string, JsonSchema> {
  if (pinned) {
    return {
      status: constant(String(definition.status), ctx.dialect),
      code: constant(definition.code, ctx.dialect),
      title: constant(definition.title, ctx.dialect),
    };
  }
  return {
    status: { type: 'string', pattern: STATUS_PATTERN },
    code: { type: 'string' },
    title: { type: 'string' },
  };
}

function errorObjectSchema(
  definition: ResolvedDefinition,
  ctx: SchemaContext,
  options: JsonApiSchemaOptions,
  pinned: boolean,
): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    ...(options.includeId ? { id: { type: 'string' } } : {}),
    // Links are URI references (RFC 3986 section 4.1), the same class RFC
    // 9457 uses for `type`, so a relative `about` link conforms too.
    // @ref https://jsonapi.org/format/#document-links
    // @ref https://www.rfc-editor.org/rfc/rfc3986#section-4.1
    links: {
      type: 'object',
      properties: {
        type: { type: 'string', format: 'uri-reference' },
        about: { type: 'string', format: 'uri-reference' },
      },
      additionalProperties: false,
    },
    ...identity(definition, ctx, pinned),
    detail: { type: 'string' },
    source: {
      type: 'object',
      properties: {
        pointer: { type: 'string' },
        parameter: { type: 'string' },
        header: { type: 'string' },
      },
      additionalProperties: false,
    },
    meta: { type: 'object' },
  };
  return {
    type: 'object',
    required: ['status', 'code', 'title'],
    properties,
    additionalProperties: false,
  };
}

/**
 * The document schema. `list` is true for `errorsSchema`, where the entry's
 * identity is pinned unless `mixedEntries` is on (7.2.4); a single-object
 * document is always pinned.
 */
export function bodySchema(
  definition: ResolvedDefinition,
  ctx: SchemaContext,
  options: JsonApiSchemaOptions,
  list: boolean,
): JsonSchema {
  const pinned = !(list && options.mixedEntries);
  const members = options.document;
  const properties: Record<string, JsonSchema> = {
    ...(members?.jsonapi === undefined ? {} : { jsonapi: { type: 'object' } }),
    errors: {
      type: 'array',
      minItems: 1,
      items: errorObjectSchema(definition, ctx, options, pinned),
    },
    ...(members?.links === undefined ? {} : { links: { type: 'object' } }),
    ...(members?.meta === undefined ? {} : { meta: { type: 'object' } }),
  };
  return {
    type: 'object',
    required: ['errors'],
    properties,
    additionalProperties: false,
  };
}
