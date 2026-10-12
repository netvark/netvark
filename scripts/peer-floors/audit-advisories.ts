/**
 * `pnpm run audit:floors`: no published advisory in GitHub's advisory
 * database affects the floor of a peer range on a package outside the
 * workspace (root ADRs 0007 and 0008). Reads `GITHUB_TOKEN` when it is set.
 * Prints each floor and what affects it; exits 1 when an advisory affects
 * one, and 2 when the database could not be read.
 * @packageDocumentation
 */
import { join } from 'node:path';
import process from 'node:process';

import { floorAdvisories, githubPages } from './advisories.ts';
import { peerFloors } from './floors.ts';
import { readWorkspace } from './workspace.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const EXIT_AFFECTED = 1;
const EXIT_FAILED = 2;

const floors = peerFloors(readWorkspace(ROOT));
try {
  const found = await floorAdvisories(
    floors,
    githubPages(fetch, process.env['GITHUB_TOKEN']),
  );
  let affected = false;
  for (const { package: name, peer, floor } of floors) {
    const advisories = found.get(`${peer}@${floor}`) ?? [];
    if (advisories.length === 0) {
      process.stdout.write(
        `${name}: ${peer}@${floor}, no published advisory\n`,
      );
    }
    for (const advisory of advisories) {
      affected = true;
      const fix =
        advisory.patched === undefined
          ? 'no fixed release'
          : `fixed in ${advisory.patched}`;
      process.stderr.write(
        `${name}: ${peer}@${floor} is affected by ${advisory.id} (${fix}): ${advisory.summary} ${advisory.url}\n`,
      );
    }
  }
  process.exitCode = affected ? EXIT_AFFECTED : 0;
} catch (error) {
  process.stderr.write(
    `audit:floors: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = EXIT_FAILED;
}
