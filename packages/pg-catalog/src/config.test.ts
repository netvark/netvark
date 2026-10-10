import type { ExtractionConfig } from './config';

import { describe, expect, it, vi } from 'vitest';

import { defineExtraction } from './config';

const BASE: ExtractionConfig = {
  migrations: 'migrations',
  out: { catalog: 'catalog.ts' },
};

/** What `process.env` gives for a variable nobody set. */
function unsetVariable(): string | undefined {
  return process.env['PG_CATALOG_TEST_UNSET_VARIABLE'];
}

describe('defineExtraction (SPEC 11.1)', () => {
  it('returns a valid configuration unchanged, without calling its URL functions', () => {
    const productionUrl = vi.fn(() => 'postgres://example.invalid/app');
    const setup = vi.fn();
    const full: ExtractionConfig = {
      migrations: 'db/migrations',
      database: {
        pglite: { extensions: ['pg_trgm', { name: 'vector', setup }] },
      },
      schemas: ['public', 'audit'],
      out: {
        catalog: 'src/db/catalog.ts',
        public: { file: 'src/db/public-catalog.ts', tables: ['contacts'] },
        types: {
          file: 'src/db/db.ts',
          overrides: {
            'public.contacts.meta': 'ContactMeta',
            'public.money': { select: 'string', insert: 'string | number' },
          },
          imports: ["import type { ContactMeta } from './meta';"],
          camelCase: { upperCase: false, underscoreBeforeDigits: true },
        },
      },
      drift: {
        production: { url: productionUrl },
        'staging-2': { url: 'postgres://example.invalid/staging' },
      },
    };
    expect(defineExtraction(full)).toBe(full);
    expect(productionUrl).not.toHaveBeenCalled();
    expect(setup).not.toHaveBeenCalled();
  });

  it('accepts a migration function, a server URL function, types as a path, and camelCase as a boolean', () => {
    const valid: ExtractionConfig = {
      migrations: () => [{ name: 'V1__init.sql', sql: 'select 1' }],
      database: { url: unsetVariable },
      out: { catalog: 'catalog.ts', types: { file: 'db.ts', camelCase: true } },
    };
    expect(defineExtraction(valid)).toBe(valid);
    const typesPath: ExtractionConfig = {
      ...BASE,
      out: { catalog: 'catalog.ts', types: 'db.ts' },
    };
    expect(defineExtraction(typesPath)).toBe(typesPath);
  });

  it('throws a TypeError naming the option, before anything runs', () => {
    const misspelled = { ...BASE, postgres: { url: 'postgres://h/d' } };
    expect(() => defineExtraction(misspelled)).toThrow(
      new TypeError('defineExtraction: postgres is not an option'),
    );
  });
});
