/**
 * JSON:API 1.1 error document format (SPEC 7.2): `{ errors: [ErrorObject] }`
 * with one error object per item of the error's list.
 * @ref https://jsonapi.org/format/#errors
 * @packageDocumentation
 */
import type { BanError } from '../../core/ban-error';
import type { ResolvedDefinition } from '../../core/definition';
import type { ErrorItem } from '../../core/error-item';
import type { JsonSchema, RenderContext, SchemaContext } from '../context';
import type { ErrorFormat } from '../types';
import type {
  JsonApiErrorObject,
  ResolvedJsonApiOptions,
} from './error-object';
import type { JsonApiDocumentMembers } from './schema';

import { assertMemberName } from '../../internal/member-name';
import { errorAsObject, itemsAsObjects } from './error-object';
import { bodySchema, entryObjectSchema, mixedBodySchema } from './schema';

export type {
  JsonApiErrorObject,
  JsonApiLinks,
  JsonApiSource,
} from './error-object';
export type { JsonApiDocumentMembers } from './schema';
export { responseStatus } from './response-status';

export interface JsonApiOptions {
  /** Base for `links.type`; overrides the instance `docsBaseUrl`. */
  readonly typeLinkBaseUrl?: string | undefined;
  /** Produces `links.about`, a URL for this occurrence. */
  readonly aboutLink?:
    | ((error: BanError, ctx: RenderContext) => string | undefined)
    | undefined;
  /** Emit `id`. Default true. */
  readonly includeId?: boolean | undefined;
  /** Key for the trace id inside `meta`. Default `traceId`; `false` disables. */
  readonly traceIdMetaKey?: string | false | undefined;
  /**
   * Error documents may combine catalog entries (SPEC 7.2.4): an item's own
   * `status`, `code`, and `title` are rendered, `errorsSchema` types those
   * members as strings instead of pinning the entry's values, and
   * `mixedSchema` describes a document combining known entries. Default
   * false: every object carries the error's identity and the schema pins it
   * (ADR 0011).
   */
  readonly mixedEntries?: boolean | undefined;
  /** Top-level `jsonapi`, `links`, and `meta` members added to every document. */
  readonly document?: JsonApiDocumentMembers | undefined;
}

export interface JsonApiBody {
  readonly jsonapi?: Readonly<Record<string, unknown>>;
  readonly errors: ReadonlyArray<JsonApiErrorObject>;
  readonly links?: Readonly<Record<string, unknown>>;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * No parameters: the specification allows only `ext` and `profile`.
 * @ref https://jsonapi.org/format/#content-negotiation-servers
 */
export const JSON_API_CONTENT_TYPE = 'application/vnd.api+json';

/**
 * Member names: at least one character, starting and ending with a letter,
 * digit, or a code point at U+0080 or above, with `-`, `_`, and space allowed
 * in between.
 * @ref https://jsonapi.org/format/#document-member-names
 */
const MEMBER_NAME_PATTERN =
  /^[A-Za-z0-9\u0080-\u{10FFFF}](?:[A-Za-z0-9\u0080-\u{10FFFF} _-]*[A-Za-z0-9\u0080-\u{10FFFF}])?$/u;
/**
 * `meta` keys this format writes itself (7.2.1, 7.2.2); a `traceIdMetaKey`
 * with one of these names would be overwritten or overwrite it.
 */
const RESERVED_META_KEYS: ReadonlySet<string> = new Set([
  'stack',
  'location',
  'name',
  'code',
  'expected',
  'received',
]);

function document(
  options: ResolvedJsonApiOptions,
  errors: ReadonlyArray<JsonApiErrorObject>,
): JsonApiBody {
  const members = options.document;
  return {
    ...(members?.jsonapi === undefined ? {} : { jsonapi: members.jsonapi }),
    errors,
    ...(members?.links === undefined ? {} : { links: members.links }),
    ...(members?.meta === undefined ? {} : { meta: members.meta }),
  };
}

/**
 * JSON:API 1.1 error documents (SPEC 7.2). Throws `TypeError` when
 * `traceIdMetaKey` names a `meta` key the format writes itself or is not a
 * valid member name.
 * @ref https://jsonapi.org/format/#errors
 */
export function jsonApi(
  options: JsonApiOptions = {},
): ErrorFormat<JsonApiBody> {
  const resolved: ResolvedJsonApiOptions = {
    typeLinkBaseUrl: options.typeLinkBaseUrl,
    aboutLink: options.aboutLink,
    includeId: options.includeId ?? true,
    traceIdMetaKey: options.traceIdMetaKey ?? 'traceId',
    mixedEntries: options.mixedEntries ?? false,
    document: options.document,
  };
  if (resolved.traceIdMetaKey !== false) {
    assertMemberName(
      'traceIdMetaKey',
      resolved.traceIdMetaKey,
      RESERVED_META_KEYS,
      MEMBER_NAME_PATTERN,
    );
  }
  const schemaOptions = {
    includeId: resolved.includeId,
    mixedEntries: resolved.mixedEntries,
    document: resolved.document,
  };
  return {
    name: 'json-api',
    contentType: JSON_API_CONTENT_TYPE,
    render(error: BanError, ctx: RenderContext): JsonApiBody {
      return document(resolved, [errorAsObject(error, ctx, resolved)]);
    },
    renderErrors(
      error: BanError,
      errors: ReadonlyArray<ErrorItem>,
      ctx: RenderContext,
    ): JsonApiBody {
      // `errors` must hold at least one object (7.2.3), so an empty list
      // renders the error itself as the one object.
      return document(
        resolved,
        errors.length === 0
          ? [errorAsObject(error, ctx, resolved)]
          : itemsAsObjects(error, errors, ctx, resolved),
      );
    },
    schema(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema {
      return bodySchema(definition, ctx, schemaOptions, false);
    },
    errorsSchema(
      definition: ResolvedDefinition,
      ctx: SchemaContext,
    ): JsonSchema {
      return bodySchema(definition, ctx, schemaOptions, true);
    },
    ...(resolved.mixedEntries
      ? {
          mixedSchema(
            definitions: ReadonlyArray<ResolvedDefinition>,
            ctx: SchemaContext,
          ): JsonSchema {
            return mixedBodySchema(definitions, ctx, schemaOptions);
          },
          objectSchema(
            definition: ResolvedDefinition,
            ctx: SchemaContext,
          ): JsonSchema {
            return entryObjectSchema(definition, ctx, schemaOptions);
          },
        }
      : {}),
  };
}
