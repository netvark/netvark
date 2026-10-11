/**
 * The public catalog of the storage contract's migrations (resource SPEC
 * 12.9), extracted as `pg-catalog extract` would from a directory holding
 * them as Flyway versions. The suite checks the committed file is current;
 * `pnpm run contract:catalog` in this package rewrites it from the built
 * package's migrations, so build first.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extract } from '@netvark/pg-catalog';
import { contractFixture } from '@netvark/resource-core/testing';

import { PACKAGE_DIR } from './paths.ts';

/** The committed public catalog of the contract, which `@netvark/resource-core/testing` ships. */
export const CONTRACT_CATALOG: string = fileURLToPath(
  new URL(
    '../../../packages/resource-core/src/testing/contract/public-catalog.ts',
    import.meta.url,
  ),
);

/**
 * Extracts the contract's catalog into `CONTRACT_CATALOG` and returns the
 * file's status; with `check`, writes nothing, and `unchanged` means the
 * committed file is what extraction gives.
 */
export async function extractContractCatalog(check: boolean): Promise<string> {
  await mkdir(join(PACKAGE_DIR, '.tmp'), { recursive: true });
  const dir = await mkdtemp(join(PACKAGE_DIR, '.tmp', 'contract-'));
  try {
    await mkdir(join(dir, 'migrations'));
    for (const [index, sql] of contractFixture.migrations.entries()) {
      const name = `V${String(index + 1)}__contract.sql`;
      await writeFile(join(dir, 'migrations', name), sql);
    }
    const report = await extract(
      {
        migrations: 'migrations',
        out: {
          catalog: 'catalog.ts',
          public: { file: CONTRACT_CATALOG, tables: ['workspaces', 'tasks'] },
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
