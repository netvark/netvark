/**
 * `app.onError` and `app.notFound` handlers (SPEC 10.5). `errorHandler` is a
 * `@netvark/hono-ban` handler over an instance that carries this package's catalog and
 * renders in @netvark/ban-core's JSON:API format with `mixedEntries` on, so every
 * failure reaching `app.onError` becomes an error document: a `BanError`
 * from `@netvark/jsonapi-core`, from the application's own @netvark/ban-core instance, or from
 * any other library on @netvark/ban-core, as it is; Hono's `HTTPException` adopted by
 * status; anything else as a constant 500 that reveals nothing.
 * @ref https://jsonapi.org/format/1.1/#errors
 * @ref https://hono.dev/docs/api/hono#error-handling
 * @ref https://github.com/netvark/netvark/blob/main/docs/jsonapi/SPEC.md (section 6: the handler; section 7.2: the JSON:API format)
 * @packageDocumentation
 */
import type { Env, ErrorHandler, NotFoundHandler } from 'hono';

import type { HandlerOptions } from '@netvark/hono-ban';
import type {
  JsonApiDocumentMembers,
  JsonApiOptions,
} from '@netvark/hono-ban/formats/json-api';
import type { DocumentBase, JsonApiCatalog } from '@netvark/jsonapi-core';

import type { ResponseHeaders } from './respond';

import { createBan } from '@netvark/hono-ban';
import { jsonApi } from '@netvark/hono-ban/formats/json-api';
import { ERROR_CATALOG, jsonApiError } from '@netvark/jsonapi-core';

import { respondError } from './respond';

/**
 * `@netvark/hono-ban`'s handler options (`onReport`, `headers`, `map`, `includeStack`,
 * the id headers, ...) plus the JSON:API document's own. `map` receives the
 * handler's instance, whose catalog is `ERROR_CATALOG` over the built-ins.
 */
export interface ErrorHandlerOptions<
  E extends Env = Env,
> extends HandlerOptions<E, JsonApiCatalog> {
  /** Top-level members (`jsonapi`, `links`, `meta`) for every error document. */
  readonly document?: DocumentBase | undefined;
  /**
   * The JSON:API format's options: `typeLinkBaseUrl` for `links.type`,
   * `aboutLink`, `includeId`, `traceIdMetaKey`. `mixedEntries` is always on,
   * since the errors of this package combine catalog entries.
   */
  readonly format?:
    | Omit<JsonApiOptions, 'mixedEntries' | 'document'>
    | undefined;
}

export interface NotFoundHandlerOptions {
  /** Top-level members (`jsonapi`, `links`, `meta`) for the error document. */
  readonly document?: DocumentBase | undefined;
  /** Headers added to the response, such as `Cache-Control`. */
  readonly headers?: ResponseHeaders | undefined;
}

/** `DocumentBase` in the format's shape; a `JsonApiObject` is spread into a plain record. */
function documentMembers(base: DocumentBase): JsonApiDocumentMembers {
  return {
    ...(base.jsonapi === undefined ? {} : { jsonapi: { ...base.jsonapi } }),
    ...(base.links === undefined ? {} : { links: base.links }),
    ...(base.meta === undefined ? {} : { meta: base.meta }),
  };
}

/**
 * For `app.onError`: renders anything thrown as a JSON:API error document.
 * Equivalent to `createBan({ errors: ERROR_CATALOG, format: jsonApi({
 * mixedEntries: true }) }).onError(options)` from `@netvark/hono-ban`; an application
 * with entries of its own builds that instance itself and installs its
 * `onError`, which renders this package's errors the same way.
 */
export function errorHandler<E extends Env = Env>(
  options: ErrorHandlerOptions<E> = {},
): ErrorHandler<E> {
  const { document, format, ...handlerOptions } = options;
  const ban = createBan({
    errors: ERROR_CATALOG,
    format: jsonApi({
      ...format,
      mixedEntries: true,
      ...(document === undefined
        ? {}
        : { document: documentMembers(document) }),
    }),
  });
  return ban.onError<E>(handlerOptions);
}

/** For `app.notFound`: a 404 error document instead of Hono's plain text. */
export function notFoundHandler<E extends Env = Env>(
  options: NotFoundHandlerOptions = {},
): NotFoundHandler<E> {
  return (c) =>
    respondError(
      c,
      jsonApiError('NOT_FOUND', {
        detail: 'No resource exists at the requested URL',
      }),
      options.document,
      options.headers,
    );
}
