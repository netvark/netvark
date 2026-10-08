/**
 * hono-jsonapi/atomic: the Atomic Operations endpoint for Hono. The
 * processor and every type come from `jsonapi-kit/atomic`, re-exported
 * here; `atomicOperations()` wraps the processor as a Hono handler.
 * @ref https://jsonapi.org/ext/atomic/
 * @packageDocumentation
 */
export * from 'jsonapi-kit/atomic';

export { atomicOperations } from './handler';
