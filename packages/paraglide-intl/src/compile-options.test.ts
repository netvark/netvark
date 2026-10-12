import fs from 'node:fs';

import { defaultCompilerOptions } from '@inlang/paraglide-js';
import { describe, expect, it } from 'vitest';

import { compileConfig } from './compile-options';

const BASE = { project: './project.inlang', outdir: './src/paraglide' };

describe('compileConfig (SPEC 6.1, 5)', () => {
  it("merges Paraglide's defaults under the options, without the binding's own", () => {
    const config = compileConfig({
      ...BASE,
      strategy: ['url', 'baseLocale'],
      isolate: ['ar'],
      previousCompilation: { outputHashes: { 'runtime.js': 'abc' } },
    });
    expect(config).toEqual({
      project: BASE.project,
      outdir: BASE.outdir,
      fs,
      isolate: ['ar'],
      previousOutputHashes: { 'runtime.js': 'abc' },
      compilerOptions: {
        ...defaultCompilerOptions,
        ...BASE,
        strategy: ['url', 'baseLocale'],
      },
    });
    expect(config.compilerOptions).not.toHaveProperty('isolate');
    expect(config.compilerOptions).not.toHaveProperty('previousCompilation');
  });

  it('isolates every locale by default, and takes a boolean or a list', () => {
    expect(compileConfig(BASE).isolate).toBe(true);
    expect(compileConfig({ ...BASE, isolate: false }).isolate).toBe(false);
    expect(compileConfig({ ...BASE, isolate: [] }).isolate).toEqual([]);
    expect(compileConfig(BASE).previousOutputHashes).toBeUndefined();
  });

  it('takes the file system it is given, as Paraglide does', () => {
    const memory = { ...fs, promises: { ...fs.promises } };
    expect(compileConfig({ ...BASE, fs: memory }).fs).toBe(memory);
    expect(compileConfig({ ...BASE, fs: memory }).compilerOptions.fs).toBe(
      memory,
    );
  });

  it('throws naming the first option it cannot use', () => {
    const cases: Array<[unknown, string]> = [
      [undefined, 'compile: options is not an object'],
      [[BASE], 'compile: options is not an object'],
      [{ outdir: BASE.outdir }, 'compile: project is not a string'],
      [{ project: BASE.project, outdir: 1 }, 'compile: outdir is not a string'],
      [
        { ...BASE, isolate: 'ar' },
        'compile: isolate is not a boolean or a list of locales',
      ],
      [
        { ...BASE, isolate: ['ar', 1] },
        'compile: isolate is not a boolean or a list of locales',
      ],
      [{ ...BASE, fs: {} }, 'compile: fs is not a file system module'],
    ];
    for (const [options, message] of cases) {
      expect(() => compileConfig(options as never)).toThrow(
        new TypeError(message),
      );
    }
  });
});
