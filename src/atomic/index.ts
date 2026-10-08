/**
 * hono-jsonapi/atomic: the Atomic Operations extension for Hono.
 * @ref https://jsonapi.org/ext/atomic/
 * @packageDocumentation
 */
export type { OperationResult } from './execute';
export type { OperationsResultDocument } from './handler';
export type { RawOperation } from './parse-document';
export type {
  AnyResourceHandlers,
  AtomicOptions,
  MaybePromise,
  OperationCode,
  OperationContext,
  OperationTarget,
  RelationshipHandlers,
  ResolvedResourceObject,
  ResourceHandlers,
} from './types';

export { atomicOperations } from './handler';
export { parseOperationsDocument } from './parse-document';
