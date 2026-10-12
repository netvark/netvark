/**
 * Declarations a consumer emits for modules that export definitions:
 * `tsc --declaration`, run as a consumer runs it against the built
 * packages, over the blog's definitions and `declarations/definitions.ts`
 * reports nothing, and every type the emitted declarations name is
 * imported from a package entry point, so a package of shared definitions
 * can be published for a client to import.
 * @ref https://www.typescriptlang.org/tsconfig/#declaration
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PACKAGE_DIR = import.meta.dirname;

interface Run {
  readonly code: number | null;
  readonly output: string;
}

/** Runs the installed TypeScript's `tsc` bin with `args` in this package. */
async function tsc(args: ReadonlyArray<string>): Promise<Run> {
  const manifest = JSON.parse(
    await readFile(
      join(PACKAGE_DIR, 'node_modules/typescript/package.json'),
      'utf8',
    ),
  ) as { readonly bin: { readonly tsc: string } };
  const bin = join(PACKAGE_DIR, 'node_modules/typescript', manifest.bin.tsc);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd: PACKAGE_DIR });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, output });
    });
  });
}

let outDir: string;
let run: Run;

beforeAll(async () => {
  await mkdir(join(PACKAGE_DIR, '.tmp'), { recursive: true });
  outDir = await mkdtemp(join(PACKAGE_DIR, '.tmp', 'declarations-'));
  run = await tsc([
    '-p',
    'declarations/tsconfig.json',
    '--pretty',
    'false',
    '--outDir',
    outDir,
  ]);
});

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('declarations of exported definitions', () => {
  it('compile with no diagnostics', () => {
    expect(run.output).toBe('');
    expect(run.code).toBe(0);
  });

  it.each(['declarations/definitions.d.ts', 'support/resources.d.ts'])(
    '%s names types only through package entry points',
    async (file) => {
      const emitted = await readFile(join(outDir, file), 'utf8');
      expect(emitted).toContain('import("@netvark/jsonapi-core"');
      expect(emitted).not.toMatch(/node_modules|\/dist\//u);
    },
  );
});
