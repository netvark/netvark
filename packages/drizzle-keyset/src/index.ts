/**
 * `@netvark/drizzle-keyset`: keyset pagination for Drizzle ORM on
 * PostgreSQL. Everything `@netvark/keyset-core` exports is re-exported, so
 * an application imports from one package; on top come `renderTarget` and
 * `renderPredicate`, which turn the core's plan into Drizzle `sql` over the
 * application's schema objects (SPEC 14).
 * @ref https://orm.drizzle.team/docs/sql
 * @packageDocumentation
 */
export * from '@netvark/keyset-core';

export type { KeysetSchema, RenderContext } from './types';

export { renderPredicate } from './render/predicate';
export { renderTarget } from './render/target';
