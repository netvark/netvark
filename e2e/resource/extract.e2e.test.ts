/**
 * The catalogs the declarations read are current (resource SPEC 15.4):
 * `pg-catalog extract --check`, run in the contacts application's database
 * directory as its CI would, replays the migrations into PGlite and finds
 * the committed catalog.ts and public-catalog.ts unchanged.
 */
import { describe, expect, it } from 'vitest';

import { CONTACTS_DIR } from './support/paths';
import { binPath, runBin } from './support/run-bin';

describe('the extracted catalogs', () => {
  it('pass extract --check against the migrations', async () => {
    const run = await runBin(
      await binPath('@netvark/pg-catalog', 'pg-catalog'),
      ['extract', '--check'],
      CONTACTS_DIR,
    );
    expect(run.stderr).toBe('');
    expect(run.stdout).toBe(
      'unchanged catalog.ts\nunchanged public-catalog.ts\n',
    );
    expect(run.code).toBe(0);
  });
});
