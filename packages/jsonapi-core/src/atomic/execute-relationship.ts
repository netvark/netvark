/**
 * Relationship operations (SPEC 11.4): `update` replaces a to-one or
 * to-many relationship, `add` and `remove` change a to-many relationship's
 * membership. The operation targets the relationship through `ref` or
 * `href`.
 * @ref https://jsonapi.org/ext/atomic/#updating-to-one-relationships
 * @ref https://jsonapi.org/ext/atomic/#updating-to-many-relationships
 * @packageDocumentation
 */
import type { BanError, ErrorItem } from '@netvark/ban-core';

import type { RelationshipDefinition } from '../resource/types';
import type { Execution, OperationResult } from './execute-support';
import type { RawOperation } from './parse-document';
import type {
  AnyResourceHandlers,
  OperationTarget,
  RelationshipHandlers,
} from './types';

import { jsonApiError } from '../errors/json-api-error';
import { invalidDocument, parseLinkage } from '../request/identifiers';
import {
  forbidden,
  handlersFor,
  requireData,
  targetId,
} from './execute-support';

function relationshipDefinition<TTransaction, TContext>(
  handlers: AnyResourceHandlers<TTransaction, TContext>,
  operation: RawOperation,
  name: string,
): RelationshipDefinition {
  const { resource } = handlers;
  const definition = Object.hasOwn(resource.relationships, name)
    ? resource.relationships[name]
    : undefined;
  if (definition === undefined) {
    throw jsonApiError(
      invalidDocument(
        `${operation.pointer}/ref/relationship`,
        `"${resource.type}" has no relationship "${name}"`,
      ),
    );
  }
  if (operation.op !== 'update' && definition.cardinality === 'one') {
    throw jsonApiError(
      invalidDocument(
        `${operation.pointer}/op`,
        'Only update applies to a to-one relationship',
      ),
    );
  }
  return definition;
}

/**
 * A relationship target: `update` replaces (to-one or to-many), `add` and
 * `remove` change a to-many relationship's membership.
 * @ref https://jsonapi.org/ext/atomic/#updating-to-one-relationships
 * @ref https://jsonapi.org/ext/atomic/#updating-to-many-relationships
 */
export async function relationship<TTransaction, TContext>(
  execution: Execution<TTransaction, TContext>,
  operation: RawOperation,
  target: OperationTarget,
  name: string,
): Promise<OperationResult> {
  const handlers = handlersFor(
    execution,
    target.type,
    `${operation.pointer}/ref/type`,
  );
  const definition = relationshipDefinition(handlers, operation, name);
  const relationshipHandlers: RelationshipHandlers<TTransaction, TContext> =
    handlers.relationships?.[name] ?? {};
  const id = targetId(execution, target, `${operation.pointer}/ref`);
  const pointer = `${operation.pointer}/data`;
  const data = requireData(operation, 'changes a relationship');
  const options = { lids: true, type: definition.type };
  const errors: Array<ErrorItem> = [];
  const unsupported = (): BanError =>
    forbidden(
      operation.pointer,
      `"${target.type}.${name}" does not support ${operation.op}`,
    );
  // A relationship the definition's updates do not write takes no change,
  // whatever handlers the host registered (SPEC 9.2, `writable`).
  if (!handlers.resource.writable.update.has(name)) {
    throw unsupported();
  }
  if (operation.op === 'update') {
    const handler = relationshipHandlers.update;
    if (handler === undefined) {
      throw unsupported();
    }
    const linkage = parseLinkage(
      data,
      pointer,
      definition.cardinality,
      options,
      errors,
    );
    if (linkage === undefined) {
      throw jsonApiError(errors);
    }
    await handler(
      { id, data: execution.lids.linkage(linkage, pointer) },
      execution.context,
    );
    return {};
  }
  const handler = relationshipHandlers[operation.op];
  if (handler === undefined) {
    throw unsupported();
  }
  const identifiers = parseLinkage(data, pointer, 'many', options, errors);
  if (identifiers === undefined) {
    throw jsonApiError(errors);
  }
  await handler(
    { id, data: execution.lids.identifiers(identifiers, pointer) },
    execution.context,
  );
  return {};
}
