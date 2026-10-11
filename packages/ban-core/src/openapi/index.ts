/**
 * OpenAPI response helpers (SPEC 9). The objects returned are plain OpenAPI
 * Response Objects whose schemas come from the instance's format, so they drop
 * straight into `@hono/zod-openapi` route configs (which accept raw schema
 * objects in `content`) or any other generator.
 * @ref https://spec.openapis.org/oas/v3.1.0#response-object
 * @ref https://github.com/asteasolutions/zod-to-openapi/blob/master/src/openapi-registry.ts
 * @packageDocumentation
 */
import type { JsonSchema } from '../formats/context';
import type {
  ErrorRef,
  OpenApiOptions,
  ResponseObject,
  SchemaSource,
} from './source';

import { context, resolve, response } from './source';

export type {
  ErrorRef,
  MediaTypeObject,
  OpenApiOptions,
  ReferenceObject,
  ResponseObject,
  SchemaSource,
} from './source';
export {
  errorObjectSchemas,
  errorResponseObjects,
  errorResponses,
} from './responses';

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
