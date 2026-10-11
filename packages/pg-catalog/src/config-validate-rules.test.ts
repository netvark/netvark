/**
 * validateConfig on `rules` (SPEC 11.1): a registry function, which is not
 * called, and storage codecs, each with a `read` and a `write` function.
 */
import { describe, expect, it } from 'vitest';

import { validateConfig } from './config-validate';

const BASE = { migrations: 'migrations', out: { catalog: 'catalog.ts' } };
const CODEC = { read: (stored: string) => stored, write: () => '' };

function withRules(rules: unknown): unknown {
  return { ...BASE, rules };
}

describe('validateConfig on rules (SPEC 11.1)', () => {
  it('accepts a registry function and storage codecs, without calling the registry', () => {
    let called = false;
    const registry = () => {
      called = true;
      return [];
    };
    expect(() => {
      validateConfig(withRules({ registry, storage: { range: CODEC } }));
    }).not.toThrow();
    expect(called).toBe(false);
  });

  it('treats storage set to undefined as absent', () => {
    expect(() => {
      validateConfig(withRules({ registry: () => [], storage: undefined }));
    }).not.toThrow();
  });

  const mistakes: ReadonlyArray<readonly [string, unknown, string]> = [
    ['rules that are not an object', 'registry.ts', 'rules must be an object'],
    [
      'a misspelled option',
      { registry: () => [], storages: {} },
      'rules.storages is not an option',
    ],
    ['no registry', {}, 'rules.registry must be a function'],
    [
      'a registry that is not a function',
      { registry: [] },
      'rules.registry must be a function',
    ],
    [
      'storage that is not an object',
      { registry: () => [], storage: [] },
      'rules.storage must be an object',
    ],
    [
      'a storage codec that is not an object',
      { registry: () => [], storage: { range: 'text' } },
      'rules.storage.range must be an object',
    ],
    [
      'a storage codec without read',
      { registry: () => [], storage: { range: { write: CODEC.write } } },
      'rules.storage.range.read must be a function',
    ],
    [
      'a storage codec whose write is not a function',
      {
        registry: () => [],
        storage: { range: { read: CODEC.read, write: 'text' } },
      },
      'rules.storage.range.write must be a function',
    ],
    [
      'a storage codec with another member',
      {
        registry: () => [],
        storage: { range: { ...CODEC, parse: CODEC.read } },
      },
      'rules.storage.range.parse is not an option',
    ],
  ];

  it.each(mistakes)('refuses %s', (_name, rules, message) => {
    expect(() => {
      validateConfig(withRules(rules));
    }).toThrow(new TypeError(`defineExtraction: ${message}`));
  });
});
