import type { ExtractedFile, ExtractReport } from './commands/extract';
import type {
  DatabaseConfig,
  ExtractionConfig,
  OutputConfig,
  TypeOverride,
} from './config';
import type { PgliteExtension } from './target/pglite';

import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { describe, expectTypeOf, it } from 'vitest';

import { extract, extractCatalog } from './commands/extract';

describe('configuration types (SPEC 11.1)', () => {
  it('accepts the extension objects PGlite exports, so they can be passed through', () => {
    expectTypeOf(pg_trgm).toExtend<PgliteExtension>();
    expectTypeOf(uuid_ossp).toExtend<PgliteExtension>();
    expectTypeOf<{
      pglite: { extensions: [typeof pg_trgm, 'citext'] };
    }>().toExtend<DatabaseConfig>();
  });

  it('takes a URL as a string or as a function read only when needed', () => {
    expectTypeOf<{ url: string }>().toExtend<DatabaseConfig>();
    expectTypeOf<{
      url: () => string | undefined;
    }>().toExtend<DatabaseConfig>();
    expectTypeOf<{ url: number }>().not.toExtend<DatabaseConfig>();
  });

  it('takes migrations as a directory or a synchronous or asynchronous function', () => {
    expectTypeOf<{
      migrations: 'db';
      out: { catalog: 'c.ts' };
    }>().toExtend<ExtractionConfig>();
    expectTypeOf<{
      migrations: () => Promise<ReadonlyArray<{ name: string; sql: string }>>;
      out: { catalog: 'c.ts' };
    }>().toExtend<ExtractionConfig>();
    expectTypeOf<{ migrations: 'db' }>().not.toExtend<ExtractionConfig>();
  });

  it('takes the Kysely types file as a path, or with overrides by position and imports', () => {
    expectTypeOf<{
      catalog: 'c.ts';
      types: 'db.ts';
    }>().toExtend<OutputConfig>();
    expectTypeOf<{
      catalog: 'c.ts';
      types: {
        file: 'db.ts';
        overrides: {
          int8: 'bigint';
          jsonb: { select: 'Doc'; insert: 'string' };
        };
        imports: ["import type { Doc } from './doc';"];
      };
    }>().toExtend<OutputConfig>();
    expectTypeOf<{
      catalog: 'c.ts';
      types: { file: 'db.ts'; camelCase: true };
    }>().toExtend<OutputConfig>();
    expectTypeOf<{
      catalog: 'c.ts';
      types: { file: 'db.ts'; camelCase: { underscoreBeforeDigits: true } };
    }>().toExtend<OutputConfig>();
    expectTypeOf<{
      catalog: 'c.ts';
      types: { file: 'db.ts'; camelCase: 'yes' };
    }>().not.toExtend<OutputConfig>();
    expectTypeOf<{ insert: 'string' }>().not.toExtend<TypeOverride>();
    expectTypeOf<{
      catalog: 'c.ts';
      types: { overrides: { int8: 'bigint' } };
    }>().not.toExtend<OutputConfig>();
  });
});

describe('output types (SPEC 9.1, 11.1)', () => {
  it('takes the catalog as a path or with the interface it exports, and the public interface beside its tables', () => {
    expectTypeOf<{
      catalog: { file: 'c.ts'; interface: 'SternCatalog' };
      public: { file: 'p.ts'; tables: ['contacts']; interface: 'SternPublic' };
    }>().toExtend<OutputConfig>();
    expectTypeOf<{ catalog: { file: 'c.ts' } }>().toExtend<OutputConfig>();
    expectTypeOf<{
      catalog: { interface: 'SternCatalog' };
    }>().not.toExtend<OutputConfig>();
    expectTypeOf<{
      catalog: { file: 'c.ts'; interface: 7 };
    }>().not.toExtend<OutputConfig>();
  });
});

describe('command types (SPEC 10.1)', () => {
  it('reports every file with a closed set of statuses', () => {
    expectTypeOf(extract).returns.resolves.toEqualTypeOf<ExtractReport>();
    expectTypeOf<ExtractedFile['status']>().toEqualTypeOf<
      'written' | 'unchanged' | 'stale' | 'missing'
    >();
    expectTypeOf<ExtractedFile['kind']>().toEqualTypeOf<
      'catalog' | 'public' | 'types'
    >();
  });

  it('accepts an extraction config where extractCatalog options are expected', () => {
    expectTypeOf(extractCatalog).toBeCallableWith({
      migrations: 'db',
      schemas: ['public'],
    });
  });
});
