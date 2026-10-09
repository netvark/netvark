/**
 * hono-jsonapi: JSON:API 1.1 for Hono. Everything `jsonapi-kit` exports is
 * re-exported here, so a Hono application imports from one package; on top
 * comes the Hono integration (SPEC 10): the `jsonApi()` middleware,
 * `respond`, `readDocument`, the validators, and the error handlers. The
 * Atomic Operations endpoint lives in `hono-jsonapi/atomic`.
 * @ref https://jsonapi.org/format/1.1/
 * @ref https://hono.dev/docs/guides/middleware
 * @packageDocumentation
 */
export * from 'jsonapi-kit';

export type { ErrorHandlerOptions, NotFoundHandlerOptions } from './handlers';
export type { JsonApiOptions } from './middleware';
export type { JsonApiResponse, ResponseHeaders } from './respond';
export type { JsonApiContext, JsonApiEnv, JsonApiVariables } from './types';
export type {
  BodyValidation,
  BodyValidatorOptions,
  CreateBodyOptions,
  QueryValidation,
  UpdateBodyOptions,
} from './validators';

export { readDocument } from './body';
export { errorHandler, notFoundHandler } from './handlers';
export { jsonApi } from './middleware';
export {
  isJsonApiResponse,
  respond,
  respondError,
  varyAccept,
} from './respond';
export {
  bodyValidator,
  queryValidator,
  relationshipValidator,
} from './validators';
