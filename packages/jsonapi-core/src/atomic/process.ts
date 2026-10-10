/**
 * `operationsProcessor()` (SPEC 11.1): the framework-free core of an
 * operations endpoint. The host (an HTTP adapter such as `@netvark/hono-jsonapi`)
 * checks the method and the `Content-Type`, reads the JSON body, and hands
 * it here; the processor parses the document, runs every operation in
 * order inside the caller's transaction, and returns the results together
 * with the response document, or no document when `204 No Content` applies.
 * @ref https://jsonapi.org/ext/atomic/#processing
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 * @packageDocumentation
 */
import type { ErrorItem } from '@netvark/ban-core';

import type { ExtensionDocument, JsonApiObject } from '../document/types';
import type { OperationResult } from './execute';
import type { AnyResourceHandlers, AtomicOptions } from './types';

import { BanError, isBanError } from '@netvark/ban-core';

import {
  ATOMIC_OPERATIONS_EXTENSION,
  DEFAULT_MAX_OPERATIONS,
  JSON_API_VERSION,
} from '../internal/constants';
import { pathFromPointer } from '../internal/pointer';
import { executeOperation } from './execute';
import { Lids } from './lids';
import { RESULTS_MEMBER, parseOperationsDocument } from './parse-document';

/** The response document: results in operation order, extension applied. */
export interface OperationsResultDocument extends ExtensionDocument {
  readonly jsonapi: JsonApiObject;
  readonly [RESULTS_MEMBER]: ReadonlyArray<OperationResult>;
}

/** What processing an operations document produces. */
export interface OperationsOutcome {
  /** One result object per operation, in operation order. */
  readonly results: ReadonlyArray<OperationResult>;
  /**
   * The document to send with `200`, or `undefined` when no operation
   * returned `data`: the extension then allows `204 No Content` and no
   * document ("if all results are empty, the server MAY respond with 204").
   */
  readonly document: OperationsResultDocument | undefined;
}

/**
 * Parses an operations document (the request body as JSON) and runs it
 * inside one transaction. Rejects with the `BanError` to render (a 400
 * for the document, the failing operation's error with its pointer added)
 * or with whatever else a handler threw, after the transaction rolled back.
 */
export type OperationsProcessor<TContext = unknown> = (
  body: unknown,
  ctx: TContext,
) => Promise<OperationsOutcome>;

function indexHandlers<TTransaction, TContext>(
  resources: ReadonlyArray<AnyResourceHandlers<TTransaction, TContext>>,
): ReadonlyMap<string, AnyResourceHandlers<TTransaction, TContext>> {
  const handlers = new Map<
    string,
    AnyResourceHandlers<TTransaction, TContext>
  >();
  for (const entry of resources) {
    if (handlers.has(entry.resource.type)) {
      throw new TypeError(
        `operationsProcessor: resource type "${entry.resource.type}" is listed twice`,
      );
    }
    handlers.set(entry.resource.type, entry);
  }
  return handlers;
}

/** The one item an error without a list renders as: its own identity and message. */
function itemOf(error: BanError): ErrorItem {
  return {
    status: error.status,
    code: error.code,
    title: error.title,
    ...(error.type === undefined ? {} : { type: error.type }),
    detail: error.message,
  };
}

/** The item, addressed at the operation. */
function pointedAt(item: ErrorItem, path: ReadonlyArray<string>): ErrorItem {
  return { ...item, path };
}

/**
 * Gives every error object of an operation's failure a pointer to the
 * operation when it has no source of its own, as the extension asks. The
 * error is rebuilt from its own fields (`toInit`), so its id, headers, and
 * rendering stay; an item with a `path` already points somewhere.
 */
function atOperation(error: BanError, pointer: string): BanError {
  const items =
    error.errors === undefined || error.errors.length === 0
      ? [itemOf(error)]
      : error.errors;
  if (items.every((item) => item.path !== undefined)) {
    return error;
  }
  const path = pathFromPointer(pointer);
  return new BanError({
    ...error.toInit(),
    errors: items.map((item) =>
      item.path === undefined ? pointedAt(item, path) : item,
    ),
  });
}

function resultsDocument(
  results: ReadonlyArray<OperationResult>,
): OperationsResultDocument | undefined {
  if (results.every((result) => result.data === undefined)) {
    return undefined;
  }
  return {
    jsonapi: { version: JSON_API_VERSION, ext: [ATOMIC_OPERATIONS_EXTENSION] },
    [RESULTS_MEMBER]: results,
  };
}

/**
 * Builds the processor for a set of resource handlers. Listing a resource
 * type twice is a `TypeError` here, at setup, not per request.
 */
export function operationsProcessor<TTransaction, TContext = unknown>(
  options: AtomicOptions<TTransaction, TContext>,
): OperationsProcessor<TContext> {
  const handlers = indexHandlers(options.resources);
  const parseOptions = {
    maxOperations: options.maxOperations ?? DEFAULT_MAX_OPERATIONS,
    resolveHref: options.resolveHref,
  };
  return async (body, ctx) => {
    const operations = parseOperationsDocument(body, parseOptions);
    const results = await options.transaction(ctx, async (tx) => {
      const lids = new Lids();
      const out: Array<OperationResult> = [];
      for (const operation of operations) {
        const execution = {
          handlers,
          lids,
          context: {
            ctx,
            tx,
            index: operation.index,
            pointer: operation.pointer,
            meta: operation.meta,
          },
        };
        try {
          out.push(await executeOperation(execution, operation));
        } catch (error) {
          throw isBanError(error)
            ? atOperation(error, operation.pointer)
            : error;
        }
      }
      return out;
    });
    return { results, document: resultsDocument(results) };
  };
}
