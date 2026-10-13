/**
 * The results of an Atomic Operations request (SPEC 17.2): a `200`'s
 * `atomic:results`, one result object per operation in their order, or a
 * `204`'s none, every result then empty. Each result is held to its
 * operation's shape: the `data` of a create or an update is a resource
 * object, read as the record the single call reads, and a removal or a
 * relationship operation holds none. Anything else breaks the protocol
 * and throws `TypeError` naming the operations' types and the status,
 * never quoting the document.
 * @ref https://jsonapi.org/ext/atomic/#processing ("The results array MUST be the same length as the requested operations array")
 * @ref https://jsonapi.org/ext/atomic/#result-objects
 * @ref https://jsonapi.org/ext/atomic/#auto-id-deleting-resources ("the server MUST return a result with no data")
 * @ref https://jsonapi.org/ext/atomic/#auto-id-updating-to-one-relationships ("the server MUST return a result with no data")
 * @packageDocumentation
 */
import type { Incoming, Outgoing } from '../transport/send';
import type { Operation, OperationResult, OperationsResult } from './types';

import { deserialize, documentMembers } from '../document/deserialize';
import { isRecord, ownMember } from '../internal/object';

const OK = 200;
const NO_CONTENT = 204;
const EMPTY: OperationResult = Object.freeze({
  data: undefined,
  meta: undefined,
});

function brokenResponse(
  outgoing: Outgoing,
  status: number,
  what: string,
): TypeError {
  return new TypeError(
    `${outgoing.type} ${outgoing.call} answered ${String(status)} ${what}`,
  );
}

/** Whether the result of `operation` may hold a resource object: a create's or an update's, not a relationship's. */
function holdsRecord(operation: Operation): boolean {
  return operation.op !== 'remove' && operation.ref?.relationship === undefined;
}

function resultOf(
  value: unknown,
  operation: Operation,
  at: { readonly index: number; readonly outgoing: Outgoing },
): OperationResult {
  const position = `result ${String(at.index)}`;
  if (!isRecord(value)) {
    throw brokenResponse(
      at.outgoing,
      OK,
      `with ${position}, which is not a result object`,
    );
  }
  const meta = ownMember(value, 'meta');
  const result = { meta: isRecord(meta) ? meta : undefined };
  if (!Object.hasOwn(value, 'data')) {
    return { data: undefined, ...result };
  }
  if (!holdsRecord(operation)) {
    throw brokenResponse(
      at.outgoing,
      OK,
      `with data at ${position}, which the result of its operation must not hold`,
    );
  }
  const data = ownMember(value, 'data');
  if (!isRecord(data)) {
    throw brokenResponse(
      at.outgoing,
      OK,
      `with data at ${position} that is not a resource object`,
    );
  }
  return { data: deserialize({ data }).data, ...result };
}

/**
 * The results of `operations`, read from the response to the request
 * `outgoing` sent; `TypeError` for a response no such request is answered
 * with.
 */
export function operationsResult(
  incoming: Incoming,
  outgoing: Outgoing,
  operations: ReadonlyArray<Operation>,
): OperationsResult {
  const { status, document } = incoming;
  if (status === NO_CONTENT) {
    return {
      status,
      results: operations.map(() => EMPTY),
      links: undefined,
      meta: undefined,
      jsonapi: undefined,
    };
  }
  if (status !== OK || document === undefined) {
    throw brokenResponse(
      outgoing,
      status,
      'where a 200 with atomic:results or a 204 is the answer',
    );
  }
  const results = ownMember(document, 'atomic:results');
  if (!Array.isArray(results)) {
    throw brokenResponse(outgoing, status, 'without atomic:results');
  }
  const list: ReadonlyArray<unknown> = results;
  if (list.length !== operations.length) {
    throw brokenResponse(
      outgoing,
      status,
      `with ${String(list.length)} results for ${String(operations.length)} operations`,
    );
  }
  return {
    status,
    results: operations.map((operation, index) =>
      resultOf(list[index], operation, { index, outgoing }),
    ),
    ...documentMembers(document),
  };
}
