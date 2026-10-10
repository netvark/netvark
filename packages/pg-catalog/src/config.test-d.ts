import type { ExtractedFile, ExtractReport } from './commands/extract';
import type { DatabaseConfig, ExtractionConfig } from './config';
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
});

describe('command types (SPEC 10.1)', () => {
  it('reports every file with a closed set of statuses', () => {
    expectTypeOf(extract).returns.resolves.toEqualTypeOf<ExtractReport>();
    expectTypeOf<ExtractedFile['status']>().toEqualTypeOf<
      'written' | 'unchanged' | 'stale' | 'missing'
    >();
    expectTypeOf<ExtractedFile['kind']>().toEqualTypeOf<'catalog' | 'public'>();
  });

  it('accepts an extraction config where extractCatalog options are expected', () => {
    expectTypeOf(extractCatalog).toBeCallableWith({
      migrations: 'db',
      schemas: ['public'],
    });
  });
});
