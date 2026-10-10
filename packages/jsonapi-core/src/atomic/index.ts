/**
 * jsonapi-kit/atomic: the Atomic Operations extension, framework-free. An
 * HTTP adapter checks the method and `Content-Type`, reads the body, and
 * hands it to the processor; `hono-jsonapi/atomic` does that for Hono.
 * @ref https://jsonapi.org/ext/atomic/
 * @packageDocumentation
 */
export type { OperationResult } from './execute';
export type { RawOperation } from './parse-document';
export type {
  OperationsOutcome,
  OperationsProcessor,
  OperationsResultDocument,
} from './process';
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

export { assertOperationsContentType } from './content-type';
export { parseOperationsDocument } from './parse-document';
export { operationsProcessor } from './process';
