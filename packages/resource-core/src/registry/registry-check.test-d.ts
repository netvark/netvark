import type { DeclaredResource } from '../declare/declared-resource';
import type { Requirement } from '../declare/requirement';
import type { RegistryCheck } from './registry-check';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';
import { errorCatalog } from '../errors/error-catalog';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});

const Organizations = declareResource('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

const Contacts = declareResource('contacts', {
  operations: ['get'],
  scope: 'organization',
  fields: { name: { access: 'read' } },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
  },
});

const Meetings = declareResource('meetings', {
  operations: ['get'],
  fields: { room: { access: 'read' } },
  relationships: {
    organization_id: {
      target: () => Contacts,
      access: 'read',
      as: 'organization',
    },
    follow_up_of_id: { target: () => Meetings, access: 'read' },
  },
});

describe('the registry check in types (SPEC 3.8, 4.2)', () => {
  it('accepts a list holding every target, a resource targeting itself among them', () => {
    expectTypeOf<
      RegistryCheck<readonly [typeof Organizations, typeof Contacts]>
    >().toEqualTypeOf<readonly [unknown, unknown]>();
    errorCatalog([Organizations, Contacts]);
  });

  it('requires every target to be listed, reported at the resource with the runtime message', () => {
    expectTypeOf<RegistryCheck<readonly [typeof Contacts]>>().toEqualTypeOf<
      readonly [
        Requirement<'relationship contacts.organization targets organizations, which is not listed'>,
      ]
    >();
    // @ts-expect-error organizations is not listed
    errorCatalog([Contacts]);
  });

  it('requires a target of the table the foreign key references, which a declaration cannot check', () => {
    expectTypeOf<
      RegistryCheck<
        readonly [typeof Organizations, typeof Contacts, typeof Meetings]
      >
    >().toEqualTypeOf<
      readonly [
        unknown,
        unknown,
        Requirement<'meetings.relationships.organization_id.target: the target is a resource of contacts; the foreign key references organizations'>,
      ]
    >();
  });

  it('leaves resources whose tables TypeScript does not know to the runtime', () => {
    expectTypeOf<
      RegistryCheck<ReadonlyArray<DeclaredResource>>
    >().toEqualTypeOf<ReadonlyArray<unknown>>();
  });
});
