/**
 * What the OpenAPI helpers share (SPEC 9): the part of a `Ban` instance
 * they read, their options, the OpenAPI objects they return, and how a
 * ref resolves to its catalog entry.
 * @ref https://spec.openapis.org/oas/v3.1.2#response-object
 * @ref https://spec.openapis.org/oas/v3.1.2#reference-object
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
  /** Overrides the definition's description; `errorResponse` and `validationResponse` read it. */
  readonly description?: string | undefined;
  /**
   * Where the document holds each entry's error object, by catalog key;
   * `errorResponses` reads it. Given, every response references the objects
   * instead of inlining them, and `errorObjectSchemas` gives the objects to
   * place there. Needs a format that combines entries (SPEC 7.2.4).
   */
  readonly objectRef?: ((key: string) => string) | undefined;
  /**
   * Where the document holds the response of each entry that a status's
   * response holds alone, by catalog key; `errorResponses` reads it.
   * Given, such a status's response is a Reference Object, and
   * `errorResponseObjects` gives the responses to place there.
   */
  readonly responseRef?: ((key: string) => string) | undefined;
}

/**
 * A Media Type Object. An object type, not an interface, so it is
 * assignable to a generator's own Media Type Object, which has an index
 * signature for `x-` extensions that an interface would lack: then
 * `@hono/zod-openapi`'s `registerComponent('responses', name, response)`
 * takes a response as it is.
 * @ref https://spec.openapis.org/oas/v3.1.2#specification-extensions
 */
export type MediaTypeObject = {
  readonly schema: JsonSchema;
};

/** A Response Object; an object type for the reason `MediaTypeObject` is. */
export type ResponseObject = {
  readonly description: string;
  readonly content: Readonly<Record<string, MediaTypeObject>>;
};

/** Where the document holds the object it stands for, such as `#/components/responses/<name>`. */
export interface ReferenceObject {
  readonly $ref: string;
}

export type ErrorRef = string | number;

export function resolve(ban: SchemaSource, ref: ErrorRef): ResolvedDefinition {
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

export function context(
  ban: SchemaSource,
  options: OpenApiOptions,
): SchemaContext {
  return {
    docsBaseUrl: ban.docsBaseUrl,
    dialect: options.dialect ?? 'draft-2020-12',
    objectRef: options.objectRef,
  };
}

export function response(
  ban: SchemaSource,
  description: string,
  schema: JsonSchema,
): ResponseObject {
  return {
    description,
    content: { [ban.format.contentType]: { schema } },
  };
}

/** Each ref's definition once, in the order given. */
export function definitionsOf(
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
