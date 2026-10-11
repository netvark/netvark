/**
 * `@netvark/pg-catalog`: replays your migrations into a throwaway
 * PostgreSQL (PGlite in-process, or a server), reads `pg_catalog`, and
 * writes the catalog as an `as const` TypeScript module exported through a
 * named interface, with Kysely types rendered from it when configured;
 * `drift` compares a live database with the committed catalog;
 * `checkRules` runs the fixtures of the declared resources of
 * `@netvark/resource-core` through their schemas and the replayed
 * database; `defineExtraction` checks the configuration the `pg-catalog`
 * bin reads.
 * It re-exports all of `@netvark/catalog-core`, the model and the pure
 * functions over it. See `docs/catalog/SPEC.md` for the contract.
 * @packageDocumentation
 */
export * from '@netvark/catalog-core';
export type {
  CatalogFileConfig,
  DatabaseConfig,
  DriftEnvironment,
  ExtractionConfig,
  OutputConfig,
  PublicFileConfig,
  RulesConfig,
  RulesStorageCodec,
  TypeOverride,
  TypesConfig,
} from './config';
export { defineExtraction } from './config';
export type {
  ExtractCatalogOptions,
  ExtractedFile,
  ExtractOptions,
  ExtractReport,
} from './commands/extract';
export { extract, extractCatalog } from './commands/extract';
export type {
  DriftOptions,
  DriftReport,
  IntrospectOptions,
} from './commands/drift';
export { drift, introspectCatalog } from './commands/drift';
export { formatDiff } from './commands/format-diff';
export type { RulesOptions } from './commands/rules';
export { checkRules } from './commands/rules';
export { formatRules } from './commands/format-rules';
export type {
  RuleCaseReport,
  RuleDisagreement,
  RulesReport,
} from './oracle/report';
export type { PgCatalogErrorCode } from './errors';
export { isPgCatalogError, PgCatalogError } from './errors';
export type { Migration, MigrationSource } from './migrations/load';
export type { CatalogModuleOptions } from './render/catalog-module';
export {
  parseCatalogModule,
  renderCatalogModule,
  renderPublicCatalogModule,
} from './render/catalog-module';
export type { KyselyTypesOptions } from './render/kysely-types';
export { renderKyselyTypes } from './render/kysely-types';
export type { PgliteExtension } from './target/pglite';
