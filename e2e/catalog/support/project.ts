/**
 * A temporary project directory holding a copy of the fixture migrations,
 * so a test can add migrations without touching the fixture.
 */
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MIGRATIONS_DIR } from './contacts';

export interface Project {
  readonly dir: string;
  remove(): Promise<void>;
}

export async function createProject(): Promise<Project> {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-e2e-'));
  await cp(MIGRATIONS_DIR, join(dir, 'migrations'), { recursive: true });
  return {
    dir,
    remove: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}
