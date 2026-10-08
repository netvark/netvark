/**
 * `atomicOperations()` (SPEC 11.1): a Hono handler for an operations
 * endpoint. It accepts `POST` with the extension declared, reads the
 * document, runs it through `operationsProcessor` from `jsonapi-kit`, and
 * answers with `atomic:results` or, when no operation produced data,
 * `204 No Content`.
 * @ref https://jsonapi.org/ext/atomic/#processing
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 * @packageDocumentation
 */
import type { Context, Env, Handler } from 'hono';

import type { AtomicOptions } from 'jsonapi-kit/atomic';

import { JsonApiError, isJsonApiError, reasonPhrase } from 'jsonapi-kit';
import {
  assertOperationsContentType,
  operationsProcessor,
} from 'jsonapi-kit/atomic';

import { readDocument } from '../body';
import { respond, respondError } from '../respond';

const HTTP_NO_CONTENT = 204;
const HTTP_METHOD_NOT_ALLOWED = 405;

/** The extension: operations requests "MUST be sent via POST". */
function methodNotAllowed(): JsonApiError {
  return new JsonApiError(
    {
      status: String(HTTP_METHOD_NOT_ALLOWED),
      title: reasonPhrase(HTTP_METHOD_NOT_ALLOWED),
      detail: 'Operations requests must use POST',
    },
    { status: HTTP_METHOD_NOT_ALLOWED },
  );
}

/**
 * A handler for the operations endpoint, for `app.post('/operations', ...)`.
 * Handlers receive the Hono `Context` as `ctx`, and `transaction` as its
 * first argument. Rejected requests are answered as JSON:API error documents
 * here; errors that are not `JsonApiError`s propagate to `app.onError`
 * after the transaction has rolled back.
 */
export function atomicOperations<TTransaction, E extends Env = Env>(
  options: AtomicOptions<TTransaction, Context<E>>,
): Handler<E> {
  const process = operationsProcessor(options);
  return async (c) => {
    try {
      if (c.req.method !== 'POST') {
        return respondError(c, methodNotAllowed(), {}, { Allow: 'POST' });
      }
      assertOperationsContentType(c.req.header('content-type'));
      const { document } = await process(await readDocument(c), c);
      return document === undefined
        ? c.body(null, HTTP_NO_CONTENT)
        : respond(c, document);
    } catch (error) {
      if (isJsonApiError(error)) {
        return respondError(c, error);
      }
      throw error;
    }
  };
}
