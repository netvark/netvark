/**
 * `pnpm run check:floors`: every peer range on a package outside the
 * workspace has a job in `.github/workflows/ci.yml` that runs the package's
 * typecheck and tests on its floor with one copy of the peer (root ADRs 0007
 * and 0008). Prints each floor and its job, and exits 1 when one has none.
 * @packageDocumentation
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { parse } from 'yaml';

import { peerFloors } from './floors.ts';
import { floorJobs, workflowRuns } from './jobs.ts';
import { readWorkspace } from './workspace.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const WORKFLOW = '.github/workflows/ci.yml';
const EXIT_MISSING = 1;

const manifests = readWorkspace(ROOT);
const workflow: unknown = parse(readFileSync(join(ROOT, WORKFLOW), 'utf8'));
const results = floorJobs(
  peerFloors(manifests),
  workflowRuns(workflow, manifests),
);
for (const result of results) {
  const { package: name, peer, floor } = result.floor;
  if ('job' in result) {
    process.stdout.write(`${name}: ${peer}@${floor} in ${result.job}\n`);
  } else {
    process.stderr.write(`${name}: ${result.problem}\n`);
  }
}
process.exitCode = results.every((result) => 'job' in result)
  ? 0
  : EXIT_MISSING;
