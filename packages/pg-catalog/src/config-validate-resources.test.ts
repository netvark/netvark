/**
 * validateConfig on `resources` (SPEC 11.1): a registry function, which is
 * not called, storage codecs, each with a `read` and a `write` function,
 * and the surface file's path.
 */
import { describe, expect, it } from 'vitest';

import { validateConfig } from './config-validate';

const BASE = { migrations: 'migrations', out: { catalog: 'catalog.ts' } };
const CODEC = { read: (stored: string) => stored, write: () => '' };

function withResources(resources: unknown): unknown {
  return { ...BASE, resources };
}

describe('validateConfig on resources (SPEC 11.1)', () => {
  it('accepts a registry function and storage codecs, without calling the registry', () => {
    let called = false;
    const registry = () => {
      called = true;
      return [];
    };
    expect(() => {
      validateConfig(
        withResources({
          registry,
          storage: { range: CODEC },
          surface: 'api-surface.json',
        }),
      );
    }).not.toThrow();
    expect(called).toBe(false);
  });

  it('treats storage set to undefined as absent', () => {
    expect(() => {
      validateConfig(withResources({ registry: () => [], storage: undefined }));
    }).not.toThrow();
  });

  const mistakes: ReadonlyArray<readonly [string, unknown, string]> = [
    [
      'resources that are not an object',
      'registry.ts',
      'resources must be an object',
    ],
    [
      'a misspelled option',
      { registry: () => [], storages: {} },
      'resources.storages is not an option',
    ],
    ['no registry', {}, 'resources.registry must be a function'],
    [
      'a registry that is not a function',
      { registry: [] },
      'resources.registry must be a function',
    ],
    [
      'storage that is not an object',
      { registry: () => [], storage: [] },
      'resources.storage must be an object',
    ],
    [
      'a storage codec that is not an object',
      { registry: () => [], storage: { range: 'text' } },
      'resources.storage.range must be an object',
    ],
    [
      'a storage codec without read',
      { registry: () => [], storage: { range: { write: CODEC.write } } },
      'resources.storage.range.read must be a function',
    ],
    [
      'a storage codec whose write is not a function',
      {
        registry: () => [],
        storage: { range: { read: CODEC.read, write: 'text' } },
      },
      'resources.storage.range.write must be a function',
    ],
    [
      'a surface that is not a string',
      { registry: () => [], surface: ['api-surface.json'] },
      'resources.surface must be a string',
    ],
    [
      'an empty surface',
      { registry: () => [], surface: '' },
      'resources.surface must not be empty',
    ],
    [
      'a storage codec with another member',
      {
        registry: () => [],
        storage: { range: { ...CODEC, parse: CODEC.read } },
      },
      'resources.storage.range.parse is not an option',
    ],
  ];

  it.each(mistakes)('refuses %s', (_name, resources, message) => {
    expect(() => {
      validateConfig(withResources(resources));
    }).toThrow(new TypeError(`defineExtraction: ${message}`));
  });
});
