/**
 * `@netvark/hono-jsonapi/atomic`: the Atomic Operations endpoint for Hono. The
 * processor and every type come from `@netvark/jsonapi-core/atomic`, re-exported
 * here; `atomicOperations()` wraps the processor as a Hono handler.
 * @ref https://jsonapi.org/ext/atomic/
 * @packageDocumentation
 */
export * from '@netvark/jsonapi-core/atomic';

export { atomicOperations } from './handler';
