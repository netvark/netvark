/**
 * The contacts application of `fixtures/contacts/`: its extraction
 * configuration, relative to a project directory that holds the
 * `migrations/` folder, and the paths of the files `extract` must produce.
 */
import type { ExtractionConfig } from '@netvark/pg-catalog';

import { fileURLToPath } from 'node:url';

function fixture(path: string): string {
  return fileURLToPath(
    new URL(`../fixtures/contacts/${path}`, import.meta.url),
  );
}

export const MIGRATIONS_DIR: string = fixture('migrations/');
export const EXPECTED_CATALOG: string = fixture('expected/catalog.ts');
export const EXPECTED_PUBLIC: string = fixture('expected/public-catalog.ts');
export const EXPECTED_TYPES: string = fixture('expected/db.ts');
/** The types rendered with `camelCase: true`, for applications that use CamelCasePlugin. */
export const EXPECTED_CAMEL_TYPES: string = fixture('expected/db-camel.ts');

export const PUBLIC_TABLES: ReadonlyArray<string> = [
  'contacts',
  'contact_phones',
  'organizations',
];
export const PGLITE_EXTENSIONS: ReadonlyArray<string> = [
  'pg_trgm',
  'btree_gist',
  'citext',
];

/** The configuration an application would keep in `netvark.config.ts`. */
export const contactsConfig: ExtractionConfig = {
  migrations: 'migrations',
  database: { pglite: { extensions: PGLITE_EXTENSIONS } },
  schemas: ['public', 'audit'],
  out: {
    catalog: 'src/db/catalog.ts',
    public: { file: 'src/db/public-catalog.ts', tables: PUBLIC_TABLES },
    types: 'src/db/db.ts',
  },
};
