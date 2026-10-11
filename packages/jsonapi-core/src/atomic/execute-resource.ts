/**
 * Resource operations (SPEC 11.4): `add` creates, `update` updates, and
 * `remove` deletes the resource an operation targets.
 * @ref https://jsonapi.org/ext/atomic/#creating-resources
 * @ref https://jsonapi.org/ext/atomic/#updating-resources
 * @ref https://jsonapi.org/ext/atomic/#deleting-resources
 * @packageDocumentation
 */
import type { Execution, OperationResult } from './execute-support';
import type { RawOperation } from './parse-document';
import type { ResolvedResourceObject } from './types';

import { jsonApiError } from '../errors/json-api-error';
import { quotable } from '../internal/quotable';
import { conflict, invalidDocument } from '../request/identifiers';
import {
  dataType,
  forbidden,
  handlersFor,
  parseData,
  resultOf,
  targetId,
} from './execute-support';

/**
 * `add` without a relationship target creates a resource. The target, when
 * given, may only name the collection: a type without id or lid.
 * @ref https://jsonapi.org/ext/atomic/#creating-resources
 */
export async function create<TTransaction, TContext>(
  execution: Execution<TTransaction, TContext>,
  operation: RawOperation,
): Promise<OperationResult> {
  const { target } = operation;
  if (target !== undefined && (target.id ?? target.lid) !== undefined) {
    throw jsonApiError(
      invalidDocument(
        operation.pointer,
        'An add operation may target a collection or a to-many relationship, not a resource',
      ),
    );
  }
  const type = target?.type ?? dataType(operation);
  const handlers = handlersFor(
    execution,
    type,
    `${operation.pointer}/${target === undefined ? 'data' : 'ref'}/type`,
  );
  if (handlers.create === undefined) {
    throw forbidden(
      operation.pointer,
      `"${handlers.resource.type}" does not support add`,
    );
  }
  const data = await parseData(
    execution,
    handlers.resource,
    operation,
    'create',
  );
  const row = await handlers.create({ data }, execution.context);
  const result = resultOf(handlers.resource, row);
  if (data.lid !== undefined) {
    const id = result.data?.id ?? data.id;
    if (id === undefined) {
      throw new TypeError(
        `The create handler of "${type}" must return the created row when the operation declares a lid`,
      );
    }
    execution.lids.define(type, data.lid, id, `${operation.pointer}/data/lid`);
  }
  return result;
}

/** The updated resource's id: the target's, else `data`'s id or lid. */
function updatedId<TTransaction, TContext>(
  execution: Execution<TTransaction, TContext>,
  operation: RawOperation,
  type: string,
  data: ResolvedResourceObject<unknown>,
  targeted: string | undefined,
): string {
  if (targeted !== undefined) {
    return targeted;
  }
  if (data.id !== undefined) {
    return data.id;
  }
  if (data.lid !== undefined) {
    return execution.lids.resolve(
      type,
      data.lid,
      `${operation.pointer}/data/lid`,
    );
  }
  throw jsonApiError(
    invalidDocument(
      `${operation.pointer}/data/id`,
      'An update must identify the resource with a string id',
    ),
  );
}

/**
 * `update` without a relationship target updates the resource the target
 * names, or the one `data` identifies.
 * @ref https://jsonapi.org/ext/atomic/#updating-resources
 */
export async function update<TTransaction, TContext>(
  execution: Execution<TTransaction, TContext>,
  operation: RawOperation,
): Promise<OperationResult> {
  const { target } = operation;
  const type = target?.type ?? dataType(operation);
  const handlers = handlersFor(
    execution,
    type,
    `${operation.pointer}/${target === undefined ? 'data' : 'ref'}/type`,
  );
  if (handlers.update === undefined) {
    throw forbidden(
      operation.pointer,
      `"${handlers.resource.type}" does not support update`,
    );
  }
  const targeted =
    target === undefined
      ? undefined
      : targetId(execution, target, `${operation.pointer}/ref`);
  const data = await parseData(
    execution,
    handlers.resource,
    operation,
    'update',
    targeted,
  );
  if (
    target?.lid !== undefined &&
    data.lid !== undefined &&
    data.lid !== target.lid
  ) {
    throw jsonApiError(
      conflict(
        `${operation.pointer}/data/lid`,
        quotable(data.lid) && quotable(target.lid)
          ? `The document's lid "${data.lid}" does not match the target's lid "${target.lid}"`
          : "The document's lid does not match the target's lid",
      ),
    );
  }
  const id = updatedId(execution, operation, type, data, targeted);
  const row = await handlers.update({ id, data }, execution.context);
  return resultOf(handlers.resource, row);
}

/** @ref https://jsonapi.org/ext/atomic/#deleting-resources */
export async function remove<TTransaction, TContext>(
  execution: Execution<TTransaction, TContext>,
  operation: RawOperation,
): Promise<OperationResult> {
  const { target } = operation;
  if (target === undefined) {
    throw jsonApiError(
      invalidDocument(
        operation.pointer,
        'A remove operation must target a resource through ref or href',
      ),
    );
  }
  const handlers = handlersFor(
    execution,
    target.type,
    `${operation.pointer}/ref/type`,
  );
  if (handlers.remove === undefined) {
    throw forbidden(
      operation.pointer,
      `"${handlers.resource.type}" does not support remove`,
    );
  }
  const id = targetId(execution, target, `${operation.pointer}/ref`);
  await handlers.remove({ id }, execution.context);
  return {};
}
