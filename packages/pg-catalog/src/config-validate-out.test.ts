import { describe, expect, it } from 'vitest';

import { validateConfig } from './config-validate';

const BASE = { migrations: 'migrations', out: { catalog: 'catalog.ts' } };

/** `BASE` with `changes` merged into `out`, untyped: these are the mistakes a JavaScript configuration can make. */
function out(changes: Record<string, unknown>): unknown {
  return { ...BASE, out: { ...BASE.out, ...changes } };
}

describe('validateConfig: out (SPEC 11.1)', () => {
  it('accepts the catalog as a path or with its interface, and either interface absent', () => {
    for (const catalog of [
      'catalog.ts',
      { file: 'catalog.ts' },
      { file: 'catalog.ts', interface: 'SternCatalog' },
      { file: 'catalog.ts', interface: undefined },
    ]) {
      const valid = out({
        catalog,
        public: { file: 'p.ts', tables: ['contacts'], interface: undefined },
      });
      expect(() => {
        validateConfig(valid);
      }).not.toThrow();
    }
    const named = out({
      catalog: { file: 'catalog.ts', interface: 'Stern_Catalog2' },
      public: { file: 'p.ts', tables: ['contacts'], interface: 'SternPublic' },
    });
    expect(() => {
      validateConfig(named);
    }).not.toThrow();
  });

  const mistakes: ReadonlyArray<readonly [string, unknown, string]> = [
    ['no out', { migrations: 'migrations' }, 'out must be an object'],
    [
      'no catalog path',
      { ...BASE, out: {} },
      'out.catalog must be a string or an object',
    ],
    [
      'an empty catalog path',
      out({ catalog: '' }),
      'out.catalog must not be empty',
    ],
    [
      'a catalog without a file',
      out({ catalog: { interface: 'SternCatalog' } }),
      'out.catalog.file must be a string',
    ],
    [
      'a misspelled catalog option',
      out({ catalog: { file: 'catalog.ts', name: 'SternCatalog' } }),
      'out.catalog.name is not an option',
    ],
    [
      'a lowercase interface',
      out({ catalog: { file: 'catalog.ts', interface: 'sternCatalog' } }),
      'out.catalog.interface must be an ASCII identifier that starts with an uppercase letter',
    ],
    [
      'an interface that is not a string',
      out({ public: { file: 'p.ts', tables: ['contacts'], interface: 7 } }),
      'out.public.interface must be a string',
    ],
    [
      'an interface with a hyphen',
      out({ public: { file: 'p.ts', tables: ['contacts'], interface: 'A-B' } }),
      'out.public.interface must be an ASCII identifier that starts with an uppercase letter',
    ],
    [
      'both modules under one interface',
      out({
        catalog: { file: 'catalog.ts', interface: 'Stern' },
        public: { file: 'p.ts', tables: ['contacts'], interface: 'Stern' },
      }),
      "out.public.interface must differ from the catalog's interface, Stern",
    ],
    [
      "the public module under the catalog's default interface",
      out({
        public: {
          file: 'p.ts',
          tables: ['contacts'],
          interface: 'ExtractedCatalog',
        },
      }),
      "out.public.interface must differ from the catalog's interface, ExtractedCatalog",
    ],
    [
      'a misspelled output',
      out({ type: 'db.ts' }),
      'out.type is not an option',
    ],
    [
      'a public slice without a file',
      out({ public: { tables: ['contacts'] } }),
      'out.public.file must be a string',
    ],
    [
      'a public slice without tables',
      out({ public: { file: 'public.ts', tables: [] } }),
      'out.public.tables must not be empty',
    ],
    [
      'a duplicate public table',
      out({ public: { file: 'public.ts', tables: ['contacts', 'contacts'] } }),
      'out.public.tables lists contacts twice',
    ],
    ['an empty types path', out({ types: '' }), 'out.types must not be empty'],
    [
      'types without a file',
      out({ types: { camelCase: true } }),
      'out.types.file must be a string',
    ],
    [
      'an unknown driver',
      out({ types: { file: 'db.ts', driver: 'postgres.js' } }),
      'out.types.driver must be "node-postgres" or "pglite"',
    ],
    [
      'a driver that is not a string',
      out({ types: { file: 'db.ts', driver: ['pglite'] } }),
      'out.types.driver must be "node-postgres" or "pglite"',
    ],
    [
      'a driver named like an inherited property',
      out({ types: { file: 'db.ts', driver: 'toString' } }),
      'out.types.driver must be "node-postgres" or "pglite"',
    ],
    [
      'a misspelled types option',
      out({ types: { file: 'db.ts', camelcase: true } }),
      'out.types.camelcase is not an option',
    ],
    [
      'overrides that are an array',
      out({ types: { file: 'db.ts', overrides: [] } }),
      'out.types.overrides must be an object',
    ],
    [
      'an empty override',
      out({ types: { file: 'db.ts', overrides: { 'public.money': '' } } }),
      'out.types.overrides.public.money must not be empty',
    ],
    [
      'an override without select',
      out({
        types: {
          file: 'db.ts',
          overrides: { 'public.money': { insert: 'string' } },
        },
      }),
      'out.types.overrides.public.money.select must be a string',
    ],
    [
      'an override with an unknown position',
      out({
        types: {
          file: 'db.ts',
          overrides: { 'public.money': { select: 'string', where: 'string' } },
        },
      }),
      'out.types.overrides.public.money.where is not an option',
    ],
    [
      'an override with an update that is not a string',
      out({
        types: {
          file: 'db.ts',
          overrides: { 'public.money': { select: 'string', update: 1 } },
        },
      }),
      'out.types.overrides.public.money.update must be a string',
    ],
    [
      'a duplicate import',
      out({ types: { file: 'db.ts', imports: ['import a;', 'import a;'] } }),
      'out.types.imports lists import a; twice',
    ],
    [
      'camelCase as a string',
      out({ types: { file: 'db.ts', camelCase: 'yes' } }),
      'out.types.camelCase must be an object',
    ],
    [
      'a misspelled camelCase option',
      out({ types: { file: 'db.ts', camelCase: { upper: true } } }),
      'out.types.camelCase.upper is not an option',
    ],
    [
      'a camelCase option that is not a boolean',
      out({ types: { file: 'db.ts', camelCase: { upperCase: 'true' } } }),
      'out.types.camelCase.upperCase must be a boolean',
    ],
  ];

  it.each(mistakes)(
    'rejects %s with a TypeError naming the option',
    (_, value, message) => {
      expect(() => {
        validateConfig(value);
      }).toThrow(new TypeError(`defineExtraction: ${message}`));
    },
  );
});
