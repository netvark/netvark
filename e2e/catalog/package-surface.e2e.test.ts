/**
 * Package surface. Both packages must resolve through their published
 * `exports` maps at runtime and export exactly the values the SPEC lists
 * (section 1) for what has shipped. Value imports on purpose: a missing
 * dist file or a wrong `exports` entry fails here before any feature test.
 */
import { describe, expect, it } from 'vitest';

import * as core from '@netvark/catalog-core';
import * as pgCatalog from '@netvark/pg-catalog';

function names(module: object): Array<string> {
  return Object.keys(module).toSorted();
}

const CORE = [
  'CATALOG_FORMAT',
  'diffCatalogs',
  'toCamelCase',
  'toPublicCatalog',
  'toSnakeCase',
].toSorted();

const PG_CATALOG = [
  'PgCatalogError',
  'defineExtraction',
  'drift',
  'extract',
  'extractCatalog',
  'formatDiff',
  'introspectCatalog',
  'isPgCatalogError',
  'parseCatalogModule',
  'renderCatalogModule',
  'renderKyselyTypes',
  'renderPublicCatalogModule',
].toSorted();

describe('package surface (SPEC 1)', () => {
  it('@netvark/catalog-core exports the documented values', () => {
    expect(names(core)).toEqual(CORE);
  });

  it('@netvark/pg-catalog re-exports the core bindings themselves and adds its own', () => {
    expect(names(pgCatalog)).toEqual([...CORE, ...PG_CATALOG].toSorted());
    expect(pgCatalog.toPublicCatalog).toBe(core.toPublicCatalog);
    expect(pgCatalog.diffCatalogs).toBe(core.diffCatalogs);
    expect(pgCatalog.CATALOG_FORMAT).toBe(core.CATALOG_FORMAT);
    expect(pgCatalog.toCamelCase).toBe(core.toCamelCase);
    expect(pgCatalog.toSnakeCase).toBe(core.toSnakeCase);
  });

  it('resolves package.json through the exports maps', async () => {
    const corePackage = (await import('@netvark/catalog-core/package.json', {
      with: { type: 'json' },
    })) as {
      default: { name: string };
    };
    const pgPackage = (await import('@netvark/pg-catalog/package.json', {
      with: { type: 'json' },
    })) as {
      default: { name: string };
    };
    expect(corePackage.default.name).toBe('@netvark/catalog-core');
    expect(pgPackage.default.name).toBe('@netvark/pg-catalog');
  });
});
