import { describe, expect, it } from 'vitest';

import { validateConfig } from './config-validate';

const BASE = { migrations: 'migrations', out: { catalog: 'catalog.ts' } };
const LONGEST_SCHEMA_BYTES = 63;

/** `BASE` with `changes` merged in, untyped: these are the mistakes a JavaScript configuration can make. */
function config(changes: Record<string, unknown>): unknown {
  return { ...BASE, ...changes };
}

describe('validateConfig (SPEC 11.1)', () => {
  it('treats options set to undefined as absent, as a JavaScript configuration may write them', () => {
    const valid = config({
      database: undefined,
      schemas: undefined,
      drift: undefined,
      out: { catalog: 'catalog.ts', public: undefined, types: undefined },
    });
    expect(() => {
      validateConfig(valid);
    }).not.toThrow();
  });

  it('accepts a schema name of exactly 63 bytes', () => {
    const valid = config({ schemas: ['s'.repeat(LONGEST_SCHEMA_BYTES)] });
    expect(() => {
      validateConfig(valid);
    }).not.toThrow();
  });

  const mistakes: ReadonlyArray<readonly [string, unknown, string]> = [
    ['not an object', null, 'the configuration must be an object'],
    ['an array', [], 'the configuration must be an object'],
    [
      'a misspelled option',
      config({ postgres: {} }),
      'postgres is not an option',
    ],
    [
      'no migrations',
      { out: BASE.out },
      'migrations must be a string or a function',
    ],
    [
      'empty migrations',
      config({ migrations: '' }),
      'migrations must not be empty',
    ],
    [
      'a database with both targets',
      config({ database: { pglite: {}, url: 'postgres://h/d' } }),
      'database needs exactly one of pglite and url',
    ],
    [
      'a database with neither target',
      config({ database: {} }),
      'database needs exactly one of pglite and url',
    ],
    [
      'a misspelled database target',
      config({ database: { postgres: 'postgres://h/d' } }),
      'database.postgres is not an option',
    ],
    [
      'a database that is a string',
      config({ database: 'postgres://h/d' }),
      'database must be an object',
    ],
    [
      'an empty database URL',
      config({ database: { url: '' } }),
      'database.url must not be empty',
    ],
    [
      'a database URL that is a number',
      config({ database: { url: 5432 } }),
      'database.url must be a string or a function',
    ],
    [
      'a misspelled PGlite option',
      config({ database: { pglite: { extension: [] } } }),
      'database.pglite.extension is not an option',
    ],
    [
      'extensions that are not an array',
      config({ database: { pglite: { extensions: 'pg_trgm' } } }),
      'database.pglite.extensions must be an array',
    ],
    [
      'an empty extension name',
      config({ database: { pglite: { extensions: [''] } } }),
      'database.pglite.extensions[0] must not be empty',
    ],
    [
      'an extension object without setup',
      config({
        database: { pglite: { extensions: ['citext', { name: 'vector' }] } },
      }),
      'database.pglite.extensions[1].setup must be a function',
    ],
    [
      'an extension object without a name',
      config({ database: { pglite: { extensions: [{ setup: () => null }] } } }),
      'database.pglite.extensions[0].name must be a string',
    ],
    [
      'schemas that are a string',
      config({ schemas: 'public' }),
      'schemas must be an array',
    ],
    ['no schemas', config({ schemas: [] }), 'schemas must not be empty'],
    [
      'an empty schema name',
      config({ schemas: ['public', ''] }),
      'schemas[1] must not be empty',
    ],
    [
      'a duplicate schema',
      config({ schemas: ['app', 'audit', 'app'] }),
      'schemas lists app twice',
    ],
    [
      'a schema name over 63 bytes',
      config({ schemas: ['s'.repeat(LONGEST_SCHEMA_BYTES + 1)] }),
      'schemas[0] is longer than 63 bytes',
    ],
    [
      'a schema name of 32 characters and 64 bytes',
      config({ schemas: ['é'.repeat(32)] }),
      'schemas[0] is longer than 63 bytes',
    ],
    [
      'a pg_ schema',
      config({ schemas: ['public', 'pg_catalog'] }),
      'schemas[1] is a system schema',
    ],
    [
      'information_schema',
      config({ schemas: ['information_schema'] }),
      'schemas[0] is a system schema',
    ],
    [
      'drift that is an array',
      config({ drift: [] }),
      'drift must be an object',
    ],
    [
      'an environment name with a space',
      config({ drift: { 'prod env': { url: 'postgres://h/d' } } }),
      'drift environment "prod env" must match ^[A-Za-z0-9][A-Za-z0-9_-]*$',
    ],
    [
      'an environment name starting with a dash',
      config({ drift: { '-prod': { url: 'postgres://h/d' } } }),
      'drift environment "-prod" must match ^[A-Za-z0-9][A-Za-z0-9_-]*$',
    ],
    [
      'an environment that is a string',
      config({ drift: { production: 'postgres://h/d' } }),
      'drift.production must be an object',
    ],
    [
      'an environment with schemas of its own',
      config({
        drift: { production: { url: 'postgres://h/d', schemas: ['public'] } },
      }),
      'drift.production.schemas is not an option',
    ],
    [
      'an environment without a URL',
      config({ drift: { production: {} } }),
      'drift.production.url must be a string or a function',
    ],
    [
      'an environment with an empty URL',
      config({ drift: { production: { url: '' } } }),
      'drift.production.url must not be empty',
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
