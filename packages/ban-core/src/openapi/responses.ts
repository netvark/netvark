/**
 * The error responses of an operation (SPEC 9): each status's response
 * for a list of entries, and the error objects and lone responses a
 * document holds once in its components and references.
 * @ref https://spec.openapis.org/oas/v3.1.2#responses-object
 * @ref https://spec.openapis.org/oas/v3.1.2#components-object
 * @packageDocumentation
 */
import type { ResolvedDefinition } from '../core/definition';
import type { JsonSchema, SchemaContext } from '../formats/context';
import type { ErrorFormat } from '../formats/types';
import type {
  ErrorRef,
  OpenApiOptions,
  ReferenceObject,
  ResponseObject,
  SchemaSource,
} from './source';

import { context, definitionsOf, response } from './source';
import { byStatus, describe, mixedGroups } from './status-groups';

/** A format that combines entries in one body (SPEC 7.2.4). */
type MixingFormat = ErrorFormat & Required<Pick<ErrorFormat, 'mixedSchema'>>;

/** A format that combines entries and gives each entry's object apart, so documents can reference it. */
type ReferringFormat = MixingFormat &
  Required<Pick<ErrorFormat, 'objectSchema'>>;

function mixes(format: ErrorFormat): format is MixingFormat {
  return format.mixedSchema !== undefined;
}

function refers(format: ErrorFormat): format is ReferringFormat {
  return mixes(format) && format.objectSchema !== undefined;
}

/** The format, when it can reference objects; `TypeError` naming `caller` otherwise. */
function referring(format: ErrorFormat, caller: string): ReferringFormat {
  if (!refers(format)) {
    throw new TypeError(
      `${caller} needs a format that combines entries in one body, such as jsonApi({ mixedEntries: true }); "${format.name}" does not`,
    );
  }
  return format;
}

/** The format the responses use: the instance's, checked when `objectRef` asks it to give objects apart. */
function formatOf(ban: SchemaSource, options: OpenApiOptions): ErrorFormat {
  return options.objectRef === undefined
    ? ban.format
    : referring(ban.format, 'objectRef');
}

/** Drops structurally identical schemas: a format may emit one shape for every entry. */
function uniqueSchemas(schemas: ReadonlyArray<JsonSchema>): Array<JsonSchema> {
  const seen = new Set<string>();
  return schemas.filter((schema) => {
    const key = JSON.stringify(schema);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** The response of a status that carries `definition` alone: what `errorResponseObjects` gives and `responseRef` points at. */
function loneResponse(
  ban: SchemaSource,
  format: ErrorFormat,
  definition: ResolvedDefinition,
  ctx: SchemaContext,
): ResponseObject {
  return response(
    ban,
    definition.description,
    mixes(format)
      ? format.mixedSchema([definition], ctx)
      : format.schema(definition, ctx),
  );
}

/** The response of a status that carries several entries. */
function sharedResponse(
  ban: SchemaSource,
  format: ErrorFormat,
  group: ReadonlyArray<ResolvedDefinition>,
  ctx: SchemaContext,
): ResponseObject {
  if (mixes(format)) {
    return response(ban, describe(group), format.mixedSchema(group, ctx));
  }
  const schemas = uniqueSchemas(group.map((d) => format.schema(d, ctx)));
  const [first, ...rest] = schemas;
  return response(
    ban,
    describe(group),
    first !== undefined && rest.length === 0 ? first : { anyOf: schemas },
  );
}

/** The response of a status that carries `group`; a lone entry's is a reference to it when `responseRef` is given. */
function statusResponse(
  ban: SchemaSource,
  format: ErrorFormat,
  group: ReadonlyArray<ResolvedDefinition>,
  ctx: SchemaContext,
  responseRef: OpenApiOptions['responseRef'],
): ResponseObject | ReferenceObject {
  const [only, ...others] = group;
  if (only === undefined || others.length > 0) {
    return sharedResponse(ban, format, group, ctx);
  }
  return responseRef === undefined
    ? loneResponse(ban, format, only, ctx)
    : { $ref: responseRef(only.key) };
}

/**
 * Response Objects keyed by status. Entries sharing a status (for example
 * `BAD_REQUEST` and `MALFORMED_JSON`) merge into one `anyOf` response whose
 * description joins theirs with " or ". `anyOf`, not `oneOf`: a body has to
 * match at least one entry's schema, and a format whose schemas do not
 * discriminate by `code` would fail `oneOf` by matching several (ADR 0011).
 * A format that combines entries in one body (`mixedSchema`, SPEC 7.2.4)
 * instead gives each status the document of every entry a body of that
 * status may carry, whose objects are references when `objectRef` is
 * given; `TypeError` when it is given for another format. With
 * `responseRef`, a status that carries one entry is a Reference Object to
 * that entry's response (`errorResponseObjects`).
 * @ref https://json-schema.org/draft/2020-12/json-schema-core#section-10.2.1.2
 */
export function errorResponses(
  ban: SchemaSource,
  refs: ReadonlyArray<ErrorRef>,
  options?: OpenApiOptions & { readonly responseRef?: undefined },
): Record<string, ResponseObject>;
/** As above, some statuses a Reference Object when `options.responseRef` is given. */
export function errorResponses(
  ban: SchemaSource,
  refs: ReadonlyArray<ErrorRef>,
  options: OpenApiOptions,
): Record<string, ResponseObject | ReferenceObject>;
export function errorResponses(
  ban: SchemaSource,
  refs: ReadonlyArray<ErrorRef>,
  options: OpenApiOptions = {},
): Record<string, ResponseObject | ReferenceObject> {
  const ctx = context(ban, options);
  const format = formatOf(ban, options);
  const definitions = definitionsOf(ban, refs);
  const groups = mixes(format)
    ? mixedGroups(definitions)
    : byStatus(definitions);
  const responses: Record<string, ResponseObject | ReferenceObject> = {};
  for (const [status, group] of groups) {
    responses[String(status)] = statusResponse(
      ban,
      format,
      group,
      ctx,
      options.responseRef,
    );
  }
  return responses;
}

/**
 * Each entry's response alone, by catalog key: what `responseRef` points
 * at, so the responses `errorResponses` references when given
 * `responseRef`, which a status gets when it carries one entry. Place them
 * where `responseRef` says, for example `components.responses`. A lone
 * response depends only on its entry, the format, the dialect, and
 * `objectRef`, so a document places the responses of every operation's
 * refs once.
 * @ref https://spec.openapis.org/oas/v3.1.2#components-object
 */
export function errorResponseObjects(
  ban: SchemaSource,
  refs: ReadonlyArray<ErrorRef>,
  options: OpenApiOptions = {},
): Record<string, ResponseObject> {
  const ctx = context(ban, options);
  const format = formatOf(ban, options);
  return Object.fromEntries(
    definitionsOf(ban, refs).map((definition) => [
      definition.key,
      loneResponse(ban, format, definition, ctx),
    ]),
  );
}

/**
 * Each entry's error object, by catalog key: what `objectRef` points at, so
 * the objects `errorResponses` references when given `objectRef`. Place
 * them where `objectRef` says, for example `components.schemas`. Throws
 * `TypeError` unless the format combines entries in one body and defines
 * `objectSchema` (SPEC 7.2.4).
 * @ref https://spec.openapis.org/oas/v3.1.2#components-object
 */
export function errorObjectSchemas(
  ban: SchemaSource,
  refs: ReadonlyArray<ErrorRef>,
  options: OpenApiOptions = {},
): Record<string, JsonSchema> {
  const format = referring(ban.format, 'errorObjectSchemas');
  const ctx = context(ban, options);
  return Object.fromEntries(
    definitionsOf(ban, refs).map((definition) => [
      definition.key,
      format.objectSchema(definition, ctx),
    ]),
  );
}
