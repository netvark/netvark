/**
 * What every operation runner shares (SPEC 11.4): the execution state and
 * the lookups and checks the runners make before calling a handler.
 * @packageDocumentation
 */
import type { BanError } from 'ban-kit';

import type { ResourceLinkage, ResourceObject } from '../document/types';
import type { AnyResource } from '../resource/types';
import type { Lids } from './lids';
import type { RawOperation } from './parse-document';
import type {
  AnyResourceHandlers,
  OperationContext,
  OperationTarget,
  ResolvedResourceObject,
} from './types';

import { serializeResource } from '../document/serialize';
import { jsonApiError } from '../errors/json-api-error';
import { isRecord, ownMember } from '../internal/object';
import { invalidDocument } from '../request/identifiers';
import { parseResourceObject } from '../request/resource-document';

/** A result object: `data` when the handler returned a row, else empty. */
export interface OperationResult {
  readonly data?: ResourceObject;
}

export interface Execution<TTransaction, TContext> {
  readonly handlers: ReadonlyMap<
    string,
    AnyResourceHandlers<TTransaction, TContext>
  >;
  readonly lids: Lids;
  readonly context: OperationContext<TTransaction, TContext>;
}

export function forbidden(pointer: string, detail: string): BanError {
  return jsonApiError('FORBIDDEN', { detail, source: { pointer } });
}

export function handlersFor<TTransaction, TContext>(
  execution: Execution<TTransaction, TContext>,
  type: string,
  pointer: string,
): AnyResourceHandlers<TTransaction, TContext> {
  const handlers = execution.handlers.get(type);
  if (handlers === undefined) {
    throw jsonApiError('NOT_FOUND', {
      detail: `No resource type "${type}" exists`,
      source: { pointer },
    });
  }
  return handlers;
}

/** The targeted resource's id, resolving a `lid` from an earlier `add`. */
export function targetId<TTransaction, TContext>(
  execution: Execution<TTransaction, TContext>,
  target: OperationTarget,
  pointer: string,
): string {
  if (target.id !== undefined) {
    return target.id;
  }
  if (target.lid !== undefined) {
    return execution.lids.resolve(target.type, target.lid, `${pointer}/lid`);
  }
  throw jsonApiError(
    invalidDocument(pointer, 'The target must name a resource by id or lid'),
  );
}

export function requireData(operation: RawOperation, what: string): unknown {
  if (!operation.hasData) {
    throw jsonApiError(
      invalidDocument(
        operation.pointer,
        `An operation that ${what} must have a data member`,
      ),
    );
  }
  return operation.data;
}

/** The resource object of `data`, parsed and with local ids resolved. */
export async function parseData<TTransaction, TContext>(
  execution: Execution<TTransaction, TContext>,
  resource: AnyResource,
  operation: RawOperation,
  kind: 'create' | 'update',
  id?: string,
): Promise<ResolvedResourceObject<unknown>> {
  const pointer = `${operation.pointer}/data`;
  const parsed = await parseResourceObject(
    resource,
    requireData(operation, `${kind}s a resource`),
    { operation: kind, id, lids: true, pointer },
  );
  const relationships: Record<string, ResourceLinkage> = {};
  for (const [name, linkage] of Object.entries(parsed.relationships)) {
    relationships[name] = execution.lids.linkage(
      linkage,
      `${pointer}/relationships/${name}/data`,
    );
  }
  return { ...parsed, relationships };
}

export function resultOf(resource: AnyResource, row: unknown): OperationResult {
  return row === undefined ? {} : { data: serializeResource(resource, row) };
}

/** The `type` of `data` when an `add` has no collection target. */
export function dataType(operation: RawOperation): string {
  const data = requireData(operation, 'adds a resource');
  const type = isRecord(data) ? ownMember(data, 'type') : undefined;
  if (typeof type !== 'string') {
    throw jsonApiError(
      invalidDocument(
        `${operation.pointer}/data/type`,
        'A resource object must have a string type',
      ),
    );
  }
  return type;
}
