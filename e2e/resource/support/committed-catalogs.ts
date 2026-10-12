/**
 * The public catalogs packages commit next to the migrations they are
 * extracted from, each as `pg-catalog extract` writes it from a directory
 * holding them as Flyway versions: the storage contract's (resource SPEC
 * 12.9), which `@netvark/resource-core/testing` ships, and the fixture of
 * `@netvark/react-resource`'s unit tests (SPEC 20.8). The suite checks each
 * committed file is current; `pnpm run write:catalogs` in this package
 * rewrites them, the contract's from the built package's migrations, so
 * build first.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extract } from '@netvark/pg-catalog';
import { contractFixture } from '@netvark/resource-core/testing';

import { PACKAGE_DIR } from './paths.ts';

/** A committed public catalog and what it is extracted from. */
export interface CommittedCatalog {
  /** The committed file. */
  readonly file: string;
  /** A directory of Flyway migrations, or the migrations' SQL in the order they apply. */
  readonly migrations: string | ReadonlyArray<string>;
  readonly tables: ReadonlyArray<string>;
  readonly interface: string;
}

const REACT_FIXTURE_DIR = fileURLToPath(
  new URL(
    '../../../packages/react-resource/src/test-support/',
    import.meta.url,
  ),
);

export const COMMITTED_CATALOGS: Readonly<Record<string, CommittedCatalog>> = {
  'the storage contract': {
    file: fileURLToPath(
      new URL(
        '../../../packages/resource-core/src/testing/contract/public-catalog.ts',
        import.meta.url,
      ),
    ),
    migrations: contractFixture.migrations,
    tables: ['workspaces', 'tasks', 'labels', 'logs'],
    interface: 'ContractPublicCatalog',
  },
  "@netvark/react-resource's fixture": {
    file: join(REACT_FIXTURE_DIR, 'public-catalog.ts'),
    migrations: join(REACT_FIXTURE_DIR, 'migrations'),
    tables: ['contacts', 'organizations', 'plans'],
    interface: 'FixturePublicCatalog',
  },
};

/** The directory of `migrations` relative to `dir`, written there as Flyway versions when they are SQL texts. */
async function migrationsDir(
  dir: string,
  migrations: string | ReadonlyArray<string>,
): Promise<string> {
  if (typeof migrations === 'string') {
    return migrations;
  }
  await mkdir(join(dir, 'migrations'));
  for (const [index, sql] of migrations.entries()) {
    const name = `V${String(index + 1)}__migration.sql`;
    await writeFile(join(dir, 'migrations', name), sql);
  }
  return 'migrations';
}

/**
 * Extracts `catalog` into its file and returns the file's status; with
 * `check`, writes nothing, and `unchanged` means the committed file is
 * what extraction gives.
 */
export async function extractCommitted(
  catalog: CommittedCatalog,
  check: boolean,
): Promise<string> {
  await mkdir(join(PACKAGE_DIR, '.tmp'), { recursive: true });
  const dir = await mkdtemp(join(PACKAGE_DIR, '.tmp', 'committed-'));
  try {
    const report = await extract(
      {
        migrations: await migrationsDir(dir, catalog.migrations),
        out: {
          catalog: 'catalog.ts',
          public: {
            file: catalog.file,
            tables: catalog.tables,
            interface: catalog.interface,
          },
        },
      },
      { cwd: dir, check },
    );
    const file = report.files.find((settled) => settled.kind === 'public');
    return file?.status ?? 'missing';
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
