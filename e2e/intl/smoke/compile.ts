/**
 * Compiles the fixture catalogs with the built binding into `.tmp/smoke/`,
 * which the smoke checks import as `#compiled-messages` (SPEC 7.3). It runs on
 * the runtime under test, Bun or Deno, and on Node ahead of workerd, which
 * runs compiled messages but does not compile them: a Workers project
 * compiles in its build. On Deno before 2.6.10 a compile never lets the
 * process exit (SPEC 8), so the script refuses to start there.
 * @ref https://github.com/denoland/deno/pull/32161
 */
import { fileURLToPath } from 'node:url';

import { compile } from '@netvark/paraglide-intl';

import { CATALOGS } from '../support/catalogs.ts';
import { writeProject } from '../support/project.ts';
import { denoVersion, runtime } from './runtime.ts';

const DENO_FLOOR = [2, 6, 10];
const OUTDIR = fileURLToPath(new URL('../.tmp/smoke', import.meta.url));

function belowFloor(version: ReadonlyArray<number>): boolean {
  for (const [index, floor] of DENO_FLOOR.entries()) {
    const part = version[index] ?? 0;
    if (part !== floor) {
      return part < floor;
    }
  }
  return false;
}

const deno = denoVersion();
if (deno !== undefined && belowFloor(deno)) {
  throw new Error(
    `the smoke compile needs Deno ${DENO_FLOOR.join('.')} or later, not ${deno.join('.')}`,
  );
}
const { project } = await writeProject(CATALOGS);
const { warnings } = await compile({ project, outdir: OUTDIR });
if (warnings.length > 0) {
  throw new Error(
    `the smoke compile warned: ${warnings.map((warning) => warning.message).join('; ')}`,
  );
}
console.log(`@netvark/intl smoke: compiled the fixture on ${runtime()}`);
