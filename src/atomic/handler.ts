/**
 * `atomicOperations()` (SPEC 11.1): a Hono handler for an operations
 * endpoint. It accepts `POST` with the extension declared, parses the
 * document, runs every operation in order inside the caller's transaction,
 * and answers with `atomic:results` or, when no operation produced data,
 * `204 No Content`.
 * @ref https://jsonapi.org/ext/atomic/#processing
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 * @packageDocumentation
 */
import type { Context, Env, Handler } from 'hono';

import type { ExtensionDocument, JsonApiObject } from '../document/types';
import type { OperationResult } from './execute';
import type { AnyResourceHandlers, AtomicOptions } from './types';

import { JsonApiError, isJsonApiError } from '../errors/json-api-error';
import { reasonPhrase } from '../errors/status';
import { readDocument } from '../hono/body';
import { respond, respondError } from '../hono/respond';
import {
  ATOMIC_OPERATIONS_EXTENSION,
  DEFAULT_MAX_OPERATIONS,
  HTTP_METHOD_NOT_ALLOWED,
  JSON_API_VERSION,
} from '../internal/constants';
import { jsonApiParameters } from '../media-type/json-api';
import { parseMediaType } from '../media-type/parse';
import { executeOperation } from './execute';
import { Lids } from './lids';
import { RESULTS_MEMBER, parseOperationsDocument } from './parse-document';

/** The response document: results in operation order, extension applied. */
export interface OperationsResultDocument extends ExtensionDocument {
  readonly jsonapi: JsonApiObject;
  readonly [RESULTS_MEMBER]: ReadonlyArray<OperationResult>;
}

const HTTP_NO_CONTENT = 204;

function indexHandlers<TTransaction, E extends Env>(
  resources: ReadonlyArray<AnyResourceHandlers<TTransaction, E>>,
): ReadonlyMap<string, AnyResourceHandlers<TTransaction, E>> {
  const handlers = new Map<string, AnyResourceHandlers<TTransaction, E>>();
  for (const entry of resources) {
    if (handlers.has(entry.resource.type)) {
      throw new TypeError(
        `atomicOperations: resource type "${entry.resource.type}" is listed twice`,
      );
    }
    handlers.set(entry.resource.type, entry);
  }
  return handlers;
}

/** The extension MUST be declared on the request's `Content-Type`. */
function assertExtensionDeclared(contentType: string | undefined): void {
  const mediaType =
    contentType === undefined ? undefined : parseMediaType(contentType);
  const declared =
    mediaType !== undefined &&
    jsonApiParameters(mediaType).ext.includes(ATOMIC_OPERATIONS_EXTENSION);
  if (!declared) {
    throw JsonApiError.unsupportedMediaType(
      `Operations requests must declare the extension: Content-Type: application/vnd.api+json; ext="${ATOMIC_OPERATIONS_EXTENSION}"`,
    );
  }
}

/**
 * Gives every error object of an operation's failure a pointer to the
 * operation when it has no source of its own, as the extension asks.
 */
function atOperation(error: JsonApiError, pointer: string): JsonApiError {
  if (error.errors.every((object) => object.source !== undefined)) {
    return error;
  }
  return new JsonApiError(
    error.errors.map((object) =>
      object.source === undefined ? { ...object, source: { pointer } } : object,
    ),
    { status: error.status, cause: error },
  );
}

async function process<TTransaction, E extends Env>(
  c: Context<E>,
  options: AtomicOptions<TTransaction, E>,
  handlers: ReadonlyMap<string, AnyResourceHandlers<TTransaction, E>>,
): Promise<Response> {
  if (c.req.method !== 'POST') {
    return respondError(
      c,
      new JsonApiError(
        {
          status: String(HTTP_METHOD_NOT_ALLOWED),
          title: reasonPhrase(HTTP_METHOD_NOT_ALLOWED),
          detail: 'Operations requests must use POST',
        },
        { status: HTTP_METHOD_NOT_ALLOWED },
      ),
      {},
      { Allow: 'POST' },
    );
  }
  assertExtensionDeclared(c.req.header('content-type'));
  const operations = parseOperationsDocument(await readDocument(c), {
    maxOperations: options.maxOperations ?? DEFAULT_MAX_OPERATIONS,
    resolveHref: options.resolveHref,
  });
  const results = await options.transaction(c, async (tx) => {
    const lids = new Lids();
    const out: Array<OperationResult> = [];
    for (const operation of operations) {
      const execution = {
        handlers,
        lids,
        context: {
          c,
          tx,
          index: operation.index,
          pointer: operation.pointer,
          meta: operation.meta,
        },
      };
      try {
        out.push(await executeOperation(execution, operation));
      } catch (error) {
        throw isJsonApiError(error)
          ? atOperation(error, operation.pointer)
          : error;
      }
    }
    return out;
  });
  if (results.every((result) => result.data === undefined)) {
    return c.body(null, HTTP_NO_CONTENT);
  }
  const document: OperationsResultDocument = {
    jsonapi: { version: JSON_API_VERSION, ext: [ATOMIC_OPERATIONS_EXTENSION] },
    [RESULTS_MEMBER]: results,
  };
  return respond(c, document);
}

/**
 * A handler for the operations endpoint, for `app.post('/operations', ...)`.
 * Rejected requests are answered as JSON:API error documents here; errors
 * that are not `JsonApiError`s propagate to `app.onError` after the
 * transaction has rolled back.
 */
export function atomicOperations<TTransaction, E extends Env = Env>(
  options: AtomicOptions<TTransaction, E>,
): Handler<E> {
  const handlers = indexHandlers(options.resources);
  return async (c) => {
    try {
      return await process(c, options, handlers);
    } catch (error) {
      if (isJsonApiError(error)) {
        return respondError(c, error);
      }
      throw error;
    }
  };
}
