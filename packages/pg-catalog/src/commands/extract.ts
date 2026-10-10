/**
 * `extractCatalog` and `extract` (SPEC 10.1): replay the migrations into a
 * fresh database, read its catalog, and write or check the generated files.
 * @packageDocumentation
 */
import type { Catalog } from '@netvark/catalog-core';

import type { DatabaseConfig, ExtractionConfig, TypesConfig } from '../config';
import type { MigrationSource } from '../migrations/load';
import type { SqlSession } from '../target/session';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { toPublicCatalog } from '@netvark/catalog-core';

import { DEFAULT_SCHEMAS } from '../config';
import { PgCatalogError } from '../errors';
import { readCatalog } from '../extract/read-catalog';
import { loadMigrations } from '../migrations/load';
import {
  renderCatalogModule,
  renderPublicCatalogModule,
} from '../render/catalog-module';
import { renderKyselyTypes } from '../render/kysely-types';
import { replay } from '../replay';
import { openPglite } from '../target/pglite';
import { openThrowawayDatabase } from '../target/server';
import { useSession } from '../target/session';

/** What `extractCatalog` needs: the subset of `ExtractionConfig` that produces a catalog. */
export interface ExtractCatalogOptions {
  readonly migrations: string | MigrationSource;
  readonly database?: DatabaseConfig;
  readonly schemas?: ReadonlyArray<string>;
  /** The directory relative paths resolve against; default the process's working directory. */
  readonly cwd?: string;
}

export interface ExtractOptions {
  /** Compare only: write nothing and report each file as `unchanged`, `stale`, or `missing`. */
  readonly check?: boolean;
  readonly cwd?: string;
}

/** One generated file and what `extract` did with it. */
export interface ExtractedFile {
  readonly kind: 'catalog' | 'public' | 'types';
  /** The absolute path. */
  readonly path: string;
  readonly status: 'written' | 'unchanged' | 'stale' | 'missing';
}

export interface ExtractReport {
  readonly catalog: Catalog;
  /** In the order catalog, public, types. */
  readonly files: ReadonlyArray<ExtractedFile>;
}

async function openTarget(
  database: DatabaseConfig | undefined,
): Promise<SqlSession> {
  if (database === undefined) {
    return openPglite();
  }
  if ('pglite' in database) {
    return openPglite(database.pglite.extensions);
  }
  const url =
    typeof database.url === 'function' ? database.url() : database.url;
  if (url === undefined || url === '') {
    throw new PgCatalogError(
      'config_invalid',
      'database.url returned no URL; set the environment variable it reads, or use the PGlite target',
    );
  }
  return openThrowawayDatabase(url);
}

/**
 * Loads the migrations, replays them into a fresh database (PGlite unless
 * `database.url` is set), and reads the catalog of `schemas`. The database
 * is closed, and a server's throwaway database dropped, before it returns;
 * a failed drop fails an otherwise successful extraction.
 */
export async function extractCatalog(
  options: ExtractCatalogOptions,
): Promise<Catalog> {
  const migrations = await loadMigrations(
    options.migrations,
    options.cwd ?? process.cwd(),
  );
  return useSession(await openTarget(options.database), async (session) => {
    await replay(session, migrations);
    return readCatalog(session, options.schemas ?? DEFAULT_SCHEMAS);
  });
}

function publicModule(catalog: Catalog, tables: ReadonlyArray<string>): string {
  try {
    return renderPublicCatalogModule(toPublicCatalog(catalog, tables));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    throw new PgCatalogError(
      'public_table_unknown',
      `out.public.tables: ${reason}`,
      { cause: error },
    );
  }
}

async function readExisting(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function settle(
  kind: ExtractedFile['kind'],
  path: string,
  text: string,
  check: boolean,
): Promise<ExtractedFile> {
  const expected = Buffer.from(text, 'utf8');
  const existing = await readExisting(path);
  if (existing?.equals(expected) === true) {
    return { kind, path, status: 'unchanged' };
  }
  if (check) {
    return { kind, path, status: existing === null ? 'missing' : 'stale' };
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, expected);
  return { kind, path, status: 'written' };
}

function typesConfig(types: string | TypesConfig): TypesConfig {
  return typeof types === 'string' ? { file: types } : types;
}

/**
 * Extracts the catalog of `config` and settles the configured files: the
 * catalog module, the public module when `out.public` is set, and the
 * Kysely types when `out.types` is set. Without `check` it writes the files
 * whose bytes differ (creating directories); with `check` it writes
 * nothing. A public table the catalog does not hold fails with
 * `public_table_unknown`, and two objects with one TypeScript name with
 * `name_collision`, before any file is written.
 */
export async function extract(
  config: ExtractionConfig,
  options: ExtractOptions = {},
): Promise<ExtractReport> {
  const cwd = options.cwd ?? process.cwd();
  const check = options.check ?? false;
  const catalog = await extractCatalog({ ...config, cwd });
  const outputs: Array<[ExtractedFile['kind'], string, string]> = [
    ['catalog', resolve(cwd, config.out.catalog), renderCatalogModule(catalog)],
  ];
  if (config.out.public !== undefined) {
    outputs.push([
      'public',
      resolve(cwd, config.out.public.file),
      publicModule(catalog, config.out.public.tables),
    ]);
  }
  if (config.out.types !== undefined) {
    const types = typesConfig(config.out.types);
    outputs.push([
      'types',
      resolve(cwd, types.file),
      renderKyselyTypes(catalog, types),
    ]);
  }
  const files: Array<ExtractedFile> = [];
  for (const [kind, path, text] of outputs) {
    files.push(await settle(kind, path, text, check));
  }
  return { catalog, files };
}
