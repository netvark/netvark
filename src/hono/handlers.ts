/**
 * `app.onError` and `app.notFound` handlers (SPEC 10.5) that render every
 * failure as a JSON:API error document. Hono passes errors thrown by routes
 * to `app.onError` directly, so middleware cannot intercept them; this is
 * the one place thrown `JsonApiError`s become responses.
 * @ref https://jsonapi.org/format/1.1/#errors
 * @ref https://hono.dev/docs/api/hono#error-handling
 * @packageDocumentation
 */
import type { Context, Env, ErrorHandler, NotFoundHandler } from 'hono';

import type { DocumentBase } from '../document/types';
import type { ResponseHeaders } from './respond';

import { HTTPException } from 'hono/http-exception';

import { JsonApiError, isJsonApiError } from '../errors/json-api-error';
import { isErrorStatusCode, reasonPhrase } from '../errors/status';
import { respondError } from './respond';

export interface ErrorHandlerOptions<E extends Env = Env> {
  /**
   * Called with every error before it is rendered, for logging or tracing.
   * Anything it throws is ignored so a failing reporter cannot change the
   * response.
   */
  readonly report?:
    | ((error: unknown, c: Context<E>) => void | Promise<void>)
    | undefined;
  /** Top-level members (`jsonapi`, `links`, `meta`) for every error document. */
  readonly document?: DocumentBase | undefined;
  /** Headers added to every error response, such as `Cache-Control`. */
  readonly headers?: ResponseHeaders | undefined;
}

/**
 * The `JsonApiError` to render for anything thrown: a `JsonApiError` as is,
 * an `HTTPException` (Hono's own, such as the 400 of `validator('json')`)
 * by status with the registry's reason phrase as title, anything else as a
 * constant 500 that reveals nothing.
 */
export function toJsonApiError(error: unknown): JsonApiError {
  if (isJsonApiError(error)) {
    return error;
  }
  if (error instanceof HTTPException && isErrorStatusCode(error.status)) {
    const { status } = error;
    return new JsonApiError(
      {
        status: String(status),
        title: reasonPhrase(status),
        ...(error.message === '' ? {} : { detail: error.message }),
      },
      { status, cause: error },
    );
  }
  return JsonApiError.internal(error);
}

async function report<E extends Env>(
  options: ErrorHandlerOptions<E>,
  error: unknown,
  c: Context<E>,
): Promise<void> {
  if (options.report === undefined) {
    return;
  }
  try {
    await options.report(error, c);
  } catch {
    // A broken reporter must not change the response; see the option's doc.
  }
}

/** For `app.onError`: renders thrown errors as JSON:API error documents. */
export function errorHandler<E extends Env = Env>(
  options: ErrorHandlerOptions<E> = {},
): ErrorHandler<E> {
  return async (error, c) => {
    await report(options, error, c);
    return respondError(
      c,
      toJsonApiError(error),
      options.document,
      options.headers,
    );
  };
}

/** For `app.notFound`: a 404 error document instead of Hono's plain text. */
export function notFoundHandler<E extends Env = Env>(
  options: Pick<ErrorHandlerOptions<E>, 'document' | 'headers'> = {},
): NotFoundHandler<E> {
  return (c) =>
    respondError(
      c,
      JsonApiError.notFound('No resource exists at the requested URL'),
      options.document,
      options.headers,
    );
}
