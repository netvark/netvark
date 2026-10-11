/**
 * Package surface. `@netvark/resource-core` and its `server` and `testing`
 * entries must resolve through the published `exports` map at runtime and
 * export exactly the values the SPEC lists (section 1) for what has
 * shipped. Value imports on purpose: a missing dist file or a wrong
 * `exports` entry fails here before any feature test.
 */
import { describe, expect, it } from 'vitest';

import * as core from '@netvark/resource-core';
import * as server from '@netvark/resource-core/server';
import * as testing from '@netvark/resource-core/testing';

describe('package surface (SPEC 1)', () => {
  it('@netvark/resource-core exports the documented values', () => {
    expect(Object.keys(core).toSorted()).toEqual([
      'ISSUE_KINDS',
      'createDeclareResource',
      'defaultMessages',
      'defineCodec',
      'defineMessages',
      'defineValidator',
      'errorCatalog',
      'localizeErrors',
    ]);
  });

  it('@netvark/resource-core/server exports the documented values', () => {
    expect(Object.keys(server).toSorted()).toEqual([
      'Rejection',
      'constraintError',
      'createDomainDefiners',
      'defineEvent',
      'defineQuota',
      'defineScope',
      'denyAll',
      'quotaExceeded',
      'reject',
      'rejectionError',
      'scopeValues',
    ]);
  });

  it('@netvark/resource-core/testing exports the documented values', () => {
    expect(Object.keys(testing).toSorted()).toEqual([
      'boundaryFixtures',
      'contractFixture',
      'storageContract',
    ]);
  });

  it('resolves package.json through the exports map', async () => {
    const manifest = (await import('@netvark/resource-core/package.json', {
      with: { type: 'json' },
    })) as { default: { name: string } };
    expect(manifest.default.name).toBe('@netvark/resource-core');
  });
});
