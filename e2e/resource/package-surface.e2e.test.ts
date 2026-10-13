/**
 * Package surface. `@netvark/resource-core` and its `server`, `testing`, and
 * `openapi` entries, `@netvark/kysely-resource`, `@netvark/hono-resource`,
 * `@netvark/resource-ui`, and `@netvark/tanstack-form-resource` must
 * resolve through the published `exports` map at runtime and export exactly
 * the values the SPEC lists (sections 1, 18.1, 19.1, and 20.1) for what has
 * shipped. Value imports on purpose: a missing dist file or a wrong
 * `exports` entry fails here before any feature test.
 */
import { describe, expect, it } from 'vitest';

import * as routes from '@netvark/hono-resource';
import * as runtime from '@netvark/kysely-resource';
import * as core from '@netvark/resource-core';
import * as openapi from '@netvark/resource-core/openapi';
import * as server from '@netvark/resource-core/server';
import * as testing from '@netvark/resource-core/testing';
import * as ui from '@netvark/resource-ui';
import * as form from '@netvark/tanstack-form-resource';

describe('package surface (SPEC 1, 18.1, 19.1, 20.1)', () => {
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
      'localizeIssues',
    ]);
  });

  it('@netvark/resource-core/server exports the documented values', () => {
    expect(Object.keys(server).toSorted()).toEqual([
      'PARTITION_ROOT_SQL',
      'Rejection',
      'constraintError',
      'createDomainDefiners',
      'defineEvent',
      'defineQuota',
      'defineScope',
      'denyAll',
      'filterParameters',
      'isResourceBehavior',
      'keysetRequest',
      'partitionViolation',
      'quotaExceeded',
      'reject',
      'rejectionError',
      'relationshipTargets',
      'scopeColumnOf',
      'scopeValues',
    ]);
  });

  it('@netvark/resource-core/testing exports the documented values', () => {
    expect(Object.keys(testing).toSorted()).toEqual([
      'boundaryFixtures',
      'contractFixture',
      'oracleCases',
      'storageContract',
    ]);
  });

  it('@netvark/resource-core/openapi exports the documented values', () => {
    expect(Object.keys(openapi).toSorted()).toEqual([
      'SURFACE_FORMAT',
      'diffSurfaces',
      'openapi',
      'parseSurface',
      'surfaceOf',
    ]);
  });

  it('@netvark/hono-resource exports the documented values', () => {
    expect(Object.keys(routes).toSorted()).toEqual([
      'jsonApiRoutes',
      'resourceTypeOf',
    ]);
  });

  it('@netvark/kysely-resource exports the documented values', () => {
    expect(Object.keys(runtime).toSorted()).toEqual([
      'BootError',
      'checkResourceRuntime',
      'createKyselyStorage',
      'createResourceRuntime',
      'relayOutbox',
    ]);
  });

  it('@netvark/resource-ui exports the documented values', () => {
    expect(Object.keys(ui).toSorted()).toEqual([
      'fieldsOf',
      'resourceForm',
      'resourceList',
    ]);
  });

  it('@netvark/tanstack-form-resource exports the documented values', () => {
    expect(Object.keys(form).toSorted()).toEqual([
      'bindResponseErrors',
      'resourceFormOptions',
    ]);
  });

  it('resolves package.json through the exports map', async () => {
    const manifest = (await import('@netvark/resource-core/package.json', {
      with: { type: 'json' },
    })) as { default: { name: string } };
    expect(manifest.default.name).toBe('@netvark/resource-core');
    const runtimeManifest = (await import(
      '@netvark/kysely-resource/package.json',
      { with: { type: 'json' } }
    )) as { default: { name: string } };
    expect(runtimeManifest.default.name).toBe('@netvark/kysely-resource');
    const formManifest = (await import(
      '@netvark/tanstack-form-resource/package.json',
      { with: { type: 'json' } }
    )) as { default: { name: string } };
    expect(formManifest.default.name).toBe('@netvark/tanstack-form-resource');
  });
});
