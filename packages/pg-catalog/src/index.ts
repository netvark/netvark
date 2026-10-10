/**
 * `@netvark/pg-catalog`: replays your migrations into a throwaway
 * PostgreSQL (PGlite in-process, or a server), reads `pg_catalog`, and
 * writes the catalog as an `as const` TypeScript module, with Kysely types
 * rendered from it when configured. It re-exports all of
 * `@netvark/catalog-core`, the model and the pure functions over it. See
 * `docs/catalog/SPEC.md` for the contract.
 * @packageDocumentation
 */
export * from '@netvark/catalog-core';
export type {
  CamelCaseOptions,
  DatabaseConfig,
  ExtractionConfig,
  OutputConfig,
  TypeOverride,
  TypesConfig,
} from './config';
export type {
  ExtractCatalogOptions,
  ExtractedFile,
  ExtractOptions,
  ExtractReport,
} from './commands/extract';
export { extract, extractCatalog } from './commands/extract';
export type { PgCatalogErrorCode } from './errors';
export { isPgCatalogError, PgCatalogError } from './errors';
export type { Migration, MigrationSource } from './migrations/load';
export {
  parseCatalogModule,
  renderCatalogModule,
  renderPublicCatalogModule,
} from './render/catalog-module';
export type { KyselyTypesOptions } from './render/kysely-types';
export { renderKyselyTypes } from './render/kysely-types';
export type { PgliteExtension } from './target/pglite';
