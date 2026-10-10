/**
 * `AnyDeclaredResource`, the constraint of the type helpers (SPEC 1): every
 * resource `declareResource` returns satisfies it, typed or wide, and a
 * value that only carries part of a resource does not.
 */
import type {
  AnyDeclaredResource,
  DeclaredResource,
} from './declared-resource';

import { describe, expectTypeOf, it } from 'vitest';

import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { createDeclareResource } from './create-declare-resource';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});

const Organizations = declareResource('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'create'],
  scope: 'organization',
  fields: { name: { access: 'readWrite' }, email: { access: 'readWrite' } },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
  },
  rules: { contacts_email_unique: { code: 'CONTACT_EMAIL_TAKEN' } },
});

describe('AnyDeclaredResource: the constraint of the type helpers (SPEC 1)', () => {
  it('holds every declared resource, typed or wide', () => {
    expectTypeOf(Organizations).toExtend<AnyDeclaredResource>();
    expectTypeOf(Contacts).toExtend<AnyDeclaredResource>();
    expectTypeOf<DeclaredResource>().toExtend<AnyDeclaredResource>();
  });

  it('refuses a declaration, or an object with only some of the members', () => {
    expectTypeOf<
      typeof Contacts.declaration
    >().not.toExtend<AnyDeclaredResource>();
    expectTypeOf<{
      readonly table: 'contacts';
      readonly declaration: typeof Contacts.declaration;
    }>().not.toExtend<AnyDeclaredResource>();
  });

  it('keeps the members a helper reads', () => {
    expectTypeOf<AnyDeclaredResource['table']>().toEqualTypeOf<string>();
    expectTypeOf<
      NonNullable<(typeof Contacts)['~context']>['catalog']
    >().toEqualTypeOf<typeof contactsCatalog>();
  });
});
