/**
 * The resources `openapi` and `surfaceOf` take (SPEC 1, 13): any declared
 * resource, by `AnyDeclaredResource`. Against the wide `DeclaredResource`,
 * TypeScript compared every resource's typed members with the definer
 * context's, which tripled the instantiations and check time of a
 * 111-table schema that called both (SPEC 15.5); a declaration is still
 * refused.
 */
import type { AnyDeclaredResource } from '../declare/declared-resource';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { openapi } from './document';
import { surfaceOf } from './surface';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});

const Organizations = declareResource('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

const Contacts = declareResource('contacts', {
  operations: ['list', 'get'],
  scope: 'organization',
  fields: { name: { access: 'read' } },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
  },
});

describe('the resources openapi and surfaceOf take (SPEC 13)', () => {
  it('are any declared resources, by the cheap constraint', () => {
    expectTypeOf(openapi)
      .parameter(0)
      .toEqualTypeOf<ReadonlyArray<AnyDeclaredResource>>();
    expectTypeOf(surfaceOf)
      .parameter(0)
      .toEqualTypeOf<ReadonlyArray<AnyDeclaredResource>>();
    expectTypeOf([Organizations, Contacts]).toExtend<
      Parameters<typeof openapi>[0]
    >();
  });

  it('refuse a declaration', () => {
    // @ts-expect-error a declaration is not a resource
    surfaceOf([Contacts.declaration]);
    expectTypeOf([Contacts.declaration]).not.toExtend<
      Parameters<typeof surfaceOf>[0]
    >();
  });
});
