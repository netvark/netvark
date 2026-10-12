import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { paraglideSdk, paraglideSdkPath, toInlangSdk } from './paraglide-sdk';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The manifest of the package named `name` that holds `file`. */
function manifestAbove(file: string, name: string): Record<string, unknown> {
  for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir)) {
    try {
      const manifest: unknown = JSON.parse(
        readFileSync(join(dir, 'package.json'), 'utf8'),
      );
      if (isRecord(manifest) && manifest['name'] === name) {
        return manifest;
      }
    } catch {
      // No manifest in this directory; keep walking up.
    }
  }
  throw new Error(`no ${name} manifest above ${file}`);
}

/** The refusal of a module that lacks `names`. */
function lacks(names: string): TypeError {
  return new TypeError(
    `compile: the @inlang/sdk that @inlang/paraglide-js depends on lacks ${names}`,
  );
}

describe('paraglideSdk (SPEC 6.1)', () => {
  it('loads the SDK major that Paraglide depends on, from Paraglide', async () => {
    const paraglide = manifestAbove(
      createRequire(import.meta.url).resolve('@inlang/paraglide-js'),
      '@inlang/paraglide-js',
    );
    const dependencies = paraglide['dependencies'];
    const range = isRecord(dependencies) ? dependencies['@inlang/sdk'] : '';
    const sdk = manifestAbove(paraglideSdkPath(), '@inlang/sdk');
    const major = String(sdk['version']).split('.')[0];
    expect(String(range).replace(/^\D+/u, '').split('.')[0]).toBe(major);

    const loaded = await paraglideSdk();
    expect(typeof loaded.loadProjectFromDirectory).toBe('function');
    expect(typeof loaded.selectBundleNested).toBe('function');
    expect(typeof loaded.upsertBundleNested).toBe('function');
  });

  it('refuses a module without the functions it calls, naming each one', () => {
    expect(() => toInlangSdk({ loadProjectFromDirectory: vi.fn() })).toThrow(
      lacks('selectBundleNested, upsertBundleNested'),
    );
    expect(() => toInlangSdk(null)).toThrow(
      lacks('loadProjectFromDirectory, selectBundleNested, upsertBundleNested'),
    );
    const sdk = {
      loadProjectFromDirectory: vi.fn(),
      selectBundleNested: vi.fn(),
      upsertBundleNested: vi.fn(),
    };
    expect(toInlangSdk(sdk)).toBe(sdk);
  });
});
