/**
 * Every entry point of `@netvark/jsonapi-core`, `@netvark/hono-jsonapi`, and
 * `@netvark/jsonapi-client`, for its declarations only, as `tsconfig.json`
 * beside this file compiles them. `@netvark/tanstack-query-jsonapi` is left
 * out: TanStack Query's own declarations name the DOM library's
 * `VoidFunction`, so its consumers compile with the DOM library.
 */
export type * as JsonApiCore from '@netvark/jsonapi-core';
export type * as JsonApiCoreAtomic from '@netvark/jsonapi-core/atomic';
export type * as HonoJsonApi from '@netvark/hono-jsonapi';
export type * as HonoJsonApiAtomic from '@netvark/hono-jsonapi/atomic';
export type * as JsonApiClient from '@netvark/jsonapi-client';
