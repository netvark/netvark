/**
 * Extraction checks for runtimes with a file system and WebAssembly (Bun
 * and Deno): replay the contacts migrations into PGlite through the built
 * `@netvark/pg-catalog` and compare with the reviewed catalog.
 */
import type { Checks } from './report.ts';

import { extractCatalog, renderCatalogModule } from '@netvark/pg-catalog';

import { catalog } from '../fixtures/contacts/expected/catalog.ts';
import { MIGRATIONS_DIR, PGLITE_EXTENSIONS } from '../support/contacts.ts';
import { check, sameJson } from './report.ts';

export const extractChecks: Checks = {
  'extractCatalog on PGlite reproduces the reviewed catalog': async () => {
    const extracted = await extractCatalog({
      migrations: MIGRATIONS_DIR,
      database: { pglite: { extensions: PGLITE_EXTENSIONS } },
      schemas: ['public', 'audit'],
    });
    sameJson(extracted, catalog, 'catalog');
    check(
      renderCatalogModule(extracted).endsWith(' as const;\n'),
      'module terminator',
    );
  },
};
