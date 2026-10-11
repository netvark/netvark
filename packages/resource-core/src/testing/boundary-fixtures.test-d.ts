/**
 * The resource `boundaryFixtures` takes (SPEC 15.3): any declared
 * resource, by `AnyDeclaredResource`. Against the wide `DeclaredResource`,
 * TypeScript compared every typed resource's members with the definer
 * context's, which tripled the instantiations and check time of a
 * 111-table schema that took the fixtures of each resource (SPEC 15.5); a
 * declaration is still refused.
 */
import type { AnyDeclaredResource } from '../declare/declared-resource';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { boundaryFixtures } from './boundary-fixtures';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});

const Organizations = declareResource('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

describe('the resource boundaryFixtures takes (SPEC 15.3)', () => {
  it('is any declared resource, by the cheap constraint', () => {
    expectTypeOf(boundaryFixtures)
      .parameter(0)
      .toEqualTypeOf<AnyDeclaredResource>();
    expectTypeOf(Organizations).toExtend<
      Parameters<typeof boundaryFixtures>[0]
    >();
  });

  it('refuses a declaration', () => {
    // @ts-expect-error a declaration is not a resource
    boundaryFixtures(Organizations.declaration);
    expectTypeOf(Organizations.declaration).not.toExtend<
      Parameters<typeof boundaryFixtures>[0]
    >();
  });
});
