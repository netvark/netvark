/**
 * The property test of SPEC 15.2: over seeded generated catalogs, each
 * declaration that exposes every column it can is held to the model of
 * `test-support/model/`, written from the SPEC apart from the code: what
 * `schema.create` requires, what `schema.read` and `resource.attributes`
 * hold, the codes of `errors`, the `limits` of `fields`, the fields of
 * `keyset`, and each member's nullability, requiredness, and options. A
 * failing test names its seed: `PROPERTY_SEEDS=7,42` runs those seeds
 * again, and `PROPERTY_RUNS=500` adds as many random ones.
 */
import type { GeneratedApplication } from '../test-support/generated/application';
import type { PropertyProblems } from '../test-support/model/check-resource';
import type { DeclaredResource } from './declared-resource';

import { describe, expect, it } from 'vitest';

import {
  declareApplication,
  domainCodesOf,
  generateApplication,
  modelDeclarationOf,
} from '../test-support/generated/application';
import { propertyProblems } from '../test-support/model/check-resource';

const FIXED_SEEDS = Array.from({ length: 300 }, (_, index) => index + 1);
const SEED_RANGE = 2 ** 31;

function seeds(): ReadonlyArray<number> {
  const listed = process.env['PROPERTY_SEEDS'];
  if (listed !== undefined && listed !== '') {
    return listed.split(',').map(Number);
  }
  const runs = Number(process.env['PROPERTY_RUNS'] ?? '0');
  const random = Array.from({ length: runs }, () =>
    Math.floor(Math.random() * SEED_RANGE),
  );
  return [...FIXED_SEEDS, ...random];
}

interface Declared {
  readonly app: GeneratedApplication;
  readonly resources: ReadonlyMap<string, DeclaredResource>;
}

const declared = new Map<number, Declared>();

function declaredFor(seed: number): Declared {
  const known = declared.get(seed);
  if (known !== undefined) {
    return known;
  }
  const app = generateApplication(seed);
  const result = { app, resources: declareApplication(app) };
  declared.set(seed, result);
  return result;
}

/** Each table's disagreements on `property`, prefixed with the table. */
function problems(
  seed: number,
  property: keyof PropertyProblems,
): Array<string> {
  const { app, resources } = declaredFor(seed);
  return app.tables.flatMap((choices) =>
    propertyProblems(
      app.catalog,
      resources.get(choices.table)!,
      modelDeclarationOf(choices),
      domainCodesOf(app),
    )[property].map((problem) => `${choices.table}: ${problem}`),
  );
}

describe.each(seeds())('generated catalog, seed %i', (seed) => {
  it('declares every table', () => {
    expect(() => declaredFor(seed)).not.toThrow();
  });

  it('requires on create exactly the members SPEC 6.3 requires, and nothing on update', () => {
    expect(problems(seed, 'create')).toEqual([]);
  });

  it('reads exactly the readable fields, and lists every field as an attribute', () => {
    expect(problems(seed, 'read')).toEqual([]);
  });

  it('carries one code per constraint SPEC 9.1 selects, with the status of its kind', () => {
    expect(problems(seed, 'codes')).toEqual([]);
  });

  it('states as limits the fold of each type bound and rule', () => {
    expect(problems(seed, 'limits')).toEqual([]);
  });

  it('defines in keyset exactly the filtered and sorted members with their keyset types', () => {
    expect(problems(seed, 'keyset')).toEqual([]);
  });

  it("describes each member's nullability, requiredness, and options", () => {
    expect(problems(seed, 'meta')).toEqual([]);
  });
});
