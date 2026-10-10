/**
 * Package surface. `@netvark/resource-core` must resolve through its
 * published `exports` map at runtime and export exactly the values the
 * SPEC lists (section 1) for what has shipped. Value imports on purpose: a
 * missing dist file or a wrong `exports` entry fails here before any
 * feature test.
 */
import { describe, expect, it } from 'vitest';

import * as core from '@netvark/resource-core';

describe('package surface (SPEC 1)', () => {
  it('@netvark/resource-core exports the documented values', () => {
    expect(Object.keys(core).toSorted()).toEqual(['createDeclareResource']);
  });

  it('resolves package.json through the exports map', async () => {
    const manifest = (await import('@netvark/resource-core/package.json', {
      with: { type: 'json' },
    })) as { default: { name: string } };
    expect(manifest.default.name).toBe('@netvark/resource-core');
  });
});
