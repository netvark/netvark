/**
 * The packages' declarations as a Node.js consumer without the DOM library
 * reads them: `tsc`, run as a consumer runs it against the built packages,
 * with `lib: ["es2023"]`, `types: ["node"]`, and `skipLibCheck` off
 * (`node-types/tsconfig.json`), checks the declarations of every entry
 * point and of everything they import, and reports nothing. Node's types
 * declare `Headers`, `Request`, and `Response` but none of the DOM
 * library's aliases, so a name only the DOM library declares, such as
 * `HeadersInit`, fails here; a consumer who skips the check would read it
 * as `any`.
 * @ref https://www.typescriptlang.org/tsconfig/#lib
 * @ref https://www.typescriptlang.org/tsconfig/#skipLibCheck
 */
import type { Run } from './support/run-bin';

import { beforeAll, describe, expect, it } from 'vitest';

import { PACKAGE_DIR, binPath, runBin } from './support/run-bin';

let run: Run;

beforeAll(async () => {
  const tsc = await binPath('typescript', 'tsc');
  run = await runBin(
    tsc,
    ['-p', 'node-types/tsconfig.json', '--pretty', 'false'],
    PACKAGE_DIR,
  );
});

describe('declarations without the DOM library', () => {
  it('compile on Node.js types with no diagnostics', () => {
    expect(run.stdout).toBe('');
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
  });
});
