import type { Manifest } from './workspace.ts';

import { describe, expect, it } from 'vitest';

import { outsidePeers, peerFloors } from './floors.ts';

function manifest(
  name: string,
  peerDependencies: Record<string, string>,
): Manifest {
  return { name, dependencies: {}, devDependencies: {}, peerDependencies };
}

describe('peerFloors', () => {
  it('takes the lowest version each outside peer range admits', () => {
    expect(
      peerFloors([
        manifest('@x/keyset', {
          'drizzle-orm': '>=0.45.2 <1.0.0',
          '@x/core': '^0.1.0',
        }),
        manifest('@x/core', {
          zod: '^4.5.0',
          '@tanstack/react-query': '~5.89.1',
        }),
      ]),
    ).toEqual([
      {
        package: '@x/core',
        peer: '@tanstack/react-query',
        range: '~5.89.1',
        floor: '5.89.1',
      },
      { package: '@x/core', peer: 'zod', range: '^4.5.0', floor: '4.5.0' },
      {
        package: '@x/keyset',
        peer: 'drizzle-orm',
        range: '>=0.45.2 <1.0.0',
        floor: '0.45.2',
      },
    ]);
  });

  it('leaves out peers that are workspace packages', () => {
    const core = manifest('@x/core', {});
    const binding = manifest('@x/binding', {
      '@x/core': '^0.1.0',
      hono: '>=4.13.7',
    });
    expect(outsidePeers(binding, new Set([core.name, binding.name]))).toEqual([
      ['hono', '>=4.13.7'],
    ]);
    expect(peerFloors([core, binding]).map(({ peer }) => peer)).toEqual([
      'hono',
    ]);
  });

  it.each([
    ['not a range', 'the hono peer range not a range admits no version'],
    ['>2.0.0 <1.0.0', 'the hono peer range >2.0.0 <1.0.0 admits no version'],
  ])('refuses the range %s', (range, message) => {
    expect(() => peerFloors([manifest('@x/a', { hono: range })])).toThrow(
      new TypeError(`@x/a: ${message}`),
    );
  });
});
