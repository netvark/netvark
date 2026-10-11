/**
 * OpenAPI response helpers (SPEC 9). The objects returned are plain OpenAPI
 * Response Objects whose schemas come from the instance's format, so they drop
 * straight into `@hono/zod-openapi` route configs (which accept raw schema
 * objects in `content`) or any other generator.
 * @ref https://spec.openapis.org/oas/v3.1.0#response-object
 * @ref https://github.com/asteasolutions/zod-to-openapi/blob/master/src/openapi-registry.ts
 * @packageDocumentation
 */
import type { ResolvedDefinition } from '../core/definition';
import type {
  JsonSchema,
  SchemaContext,
  SchemaDialect,
} from '../formats/context';
import type { ErrorFormat } from '../formats/types';

import { indexByStatus } from '../core/definition';

/** The statuses `responseStatus` sends a body of several statuses with (SPEC 7.2.4). */
const BAD_REQUEST = 400;
const INTERNAL_SERVER_ERROR = 500;

/** The part of a `Ban` instance the helpers read. */
export interface SchemaSource {
  readonly format: ErrorFormat;
  readonly catalog: Readonly<Record<string, ResolvedDefinition>>;
  readonly docsBaseUrl: string | undefined;
  readonly validationKey: string;
}

export interface OpenApiOptions {
  /** Default `draft-2020-12` (OpenAPI 3.1). Use `openapi-3.0` for 3.0 documents. */
  readonly dialect?: SchemaDialect | undefined;
  /** Overrides the definition's description. */
  readonly description?: string | undefined;
}

export interface MediaTypeObject {
  readonly schema: JsonSchema;
}

export interface ResponseObject {
  readonly description: string;
  readonly content: Readonly<Record<string, MediaTypeObject>>;
}

export type ErrorRef = string | number;

function resolve(ban: SchemaSource, ref: ErrorRef): ResolvedDefinition {
  const definition =
    typeof ref === 'number'
      ? indexByStatus(ban.catalog).get(ref)
      : ban.catalog[ref];
  if (definition === undefined) {
    throw new RangeError(
      `No catalog entry for ${typeof ref === 'number' ? 'status' : 'key'} "${ref}"`,
    );
  }
  return definition;
}

function context(ban: SchemaSource, options: OpenApiOptions): SchemaContext {
  return {
    docsBaseUrl: ban.docsBaseUrl,
    dialect: options.dialect ?? 'draft-2020-12',
  };
}

function response(
  ban: SchemaSource,
  description: string,
  schema: JsonSchema,
): ResponseObject {
  return {
    description,
    content: { [ban.format.contentType]: { schema } },
  };
}

/** JSON Schema for one catalog entry, by key or by status (primary entry). */
export function errorSchema(
  ban: SchemaSource,
  ref: ErrorRef,
  options: OpenApiOptions = {},
): JsonSchema {
  return ban.format.schema(resolve(ban, ref), context(ban, options));
}

export function errorResponse(
  ban: SchemaSource,
  ref: ErrorRef,
  options: OpenApiOptions = {},
): ResponseObject {
  const definition = resolve(ban, ref);
  return response(
    ban,
    options.description ?? definition.description,
    ban.format.schema(definition, context(ban, options)),
  );
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

/** Each ref's definition once, in the order given. */
function definitionsOf(
  ban: SchemaSource,
  refs: ReadonlyArray<ErrorRef>,
): Array<ResolvedDefinition> {
  const byKey = new Map<string, ResolvedDefinition>();
  for (const ref of refs) {
    const definition = resolve(ban, ref);
    byKey.set(definition.key, definition);
  }
  return [...byKey.values()];
}

/** The definitions of each status, in the order given. */
function byStatus(
  definitions: ReadonlyArray<ResolvedDefinition>,
): Map<number, Array<ResolvedDefinition>> {
  const groups = new Map<number, Array<ResolvedDefinition>>();
  for (const definition of definitions) {
    const group = groups.get(definition.status) ?? [];
    group.push(definition);
    groups.set(definition.status, group);
  }
  return groups;
}

/**
 * The definitions a body of each status may carry when one body combines
 * entries. Such a body is sent with `responseStatus` of its objects (SPEC
 * 7.2.4): the status they share, else 400 when every one is a client error,
 * else 500. So each status carries its own entries; 400 also every 4xx
 * entry once the 4xx entries span two statuses; 500 every entry once the
 * entries span two statuses and one of them is 5xx.
 * @ref https://jsonapi.org/format/1.1/#errors-processing
 */
function mixedGroups(
  definitions: ReadonlyArray<ResolvedDefinition>,
): Map<number, ReadonlyArray<ResolvedDefinition>> {
  const groups: Map<number, ReadonlyArray<ResolvedDefinition>> = byStatus(
    definitions,
  );
  const clientErrors = definitions.filter(
    (definition) => definition.status < INTERNAL_SERVER_ERROR,
  );
  if (new Set(clientErrors.map((definition) => definition.status)).size > 1) {
    groups.set(BAD_REQUEST, clientErrors);
  }
  const statuses = [...groups.keys()];
  if (
    statuses.length > 1 &&
    statuses.some((status) => status >= INTERNAL_SERVER_ERROR)
  ) {
    groups.set(INTERNAL_SERVER_ERROR, definitions);
  }
  return groups;
}

function describe(definitions: ReadonlyArray<ResolvedDefinition>): string {
  return definitions.map((definition) => definition.description).join(' or ');
}

/** A format that combines entries in one body (SPEC 7.2.4). */
type MixingFormat = ErrorFormat & Required<Pick<ErrorFormat, 'mixedSchema'>>;

function mixes(format: ErrorFormat): format is MixingFormat {
  return format.mixedSchema !== undefined;
}

/** Each status's response when one body may combine entries: `mixedSchema` of the entries it may carry. */
function mixedResponses(
  ban: SchemaSource,
  format: MixingFormat,
  definitions: ReadonlyArray<ResolvedDefinition>,
  ctx: SchemaContext,
): Record<string, ResponseObject> {
  const responses: Record<string, ResponseObject> = {};
  for (const [status, group] of mixedGroups(definitions)) {
    responses[String(status)] = response(
      ban,
      describe(group),
      format.mixedSchema(group, ctx),
    );
  }
  return responses;
}

/**
 * Response Objects keyed by status. Entries sharing a status (for example
 * `BAD_REQUEST` and `MALFORMED_JSON`) merge into one `anyOf` response whose
 * description joins theirs with " or ". `anyOf`, not `oneOf`: a body has to
 * match at least one entry's schema, and a format whose schemas do not
 * discriminate by `code` would fail `oneOf` by matching several (ADR 0011).
 * A format that combines entries in one body (`mixedSchema`, SPEC 7.2.4)
 * instead gives each status the document of every entry a body of that
 * status may carry.
 * @ref https://json-schema.org/draft/2020-12/json-schema-core#section-10.2.1.2
 */
export function errorResponses(
  ban: SchemaSource,
  refs: ReadonlyArray<ErrorRef>,
  options: OpenApiOptions = {},
): Record<string, ResponseObject> {
  const ctx = context(ban, options);
  const definitions = definitionsOf(ban, refs);
  const { format } = ban;
  if (mixes(format)) {
    return mixedResponses(ban, format, definitions, ctx);
  }
  const responses: Record<string, ResponseObject> = {};
  for (const [status, group] of byStatus(definitions)) {
    const schemas = uniqueSchemas(group.map((d) => format.schema(d, ctx)));
    const [first, ...rest] = schemas;
    if (first === undefined) {
      continue;
    }
    responses[String(status)] = response(
      ban,
      describe(group),
      rest.length === 0 ? first : { anyOf: schemas },
    );
  }
  return responses;
}

/** JSON Schema for `ban.validation()` bodies: the format's `errorsSchema` for the validation entry. */
export function validationSchema(
  ban: SchemaSource,
  options: OpenApiOptions = {},
): JsonSchema {
  return ban.format.errorsSchema(
    resolve(ban, ban.validationKey),
    context(ban, options),
  );
}

export function validationResponse(
  ban: SchemaSource,
  options: OpenApiOptions = {},
): ResponseObject {
  const definition = resolve(ban, ban.validationKey);
  return response(
    ban,
    options.description ?? definition.description,
    validationSchema(ban, options),
  );
}
