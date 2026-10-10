import type { Catalog } from '@netvark/catalog-core';

import type { DeclareResource } from './declare-resource-type';
import type { DeclareContext } from './registries';

import { describe, expectTypeOf, it } from 'vitest';

import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { createDeclareResource } from './create-declare-resource';

declare const fullCatalog: Catalog;

describe('createDeclareResource', () => {
  it('binds declareResource to the catalog and the registries', () => {
    const declareResource = createDeclareResource({
      catalog: contactsCatalog,
      ...TEST_REGISTRIES,
    });
    type Context =
      typeof declareResource extends DeclareResource<infer TContext>
        ? TContext
        : never;
    expectTypeOf<Context['catalog']>().toEqualTypeOf<typeof contactsCatalog>();
    expectTypeOf<
      Context['scopes']['organization']['column']
    >().toEqualTypeOf<'organization_id'>();
    expectTypeOf<keyof Context['codecs']>().toEqualTypeOf<'range' | 'phone'>();
    expectTypeOf<Context>().toExtend<DeclareContext>();
  });

  it('keeps an inline scope column literal', () => {
    const declareResource = createDeclareResource({
      catalog: contactsCatalog,
      scopes: { organization: { column: 'organization_id' } },
    });
    const Contacts = declareResource('contacts', {
      operations: ['get'],
      scope: 'organization',
      fields: { name: { access: 'read' } },
    });
    expectTypeOf(Contacts.declaration.scope).toEqualTypeOf<'organization'>();
  });

  it('refuses a full catalog, which would reach browsers (ADR 0002)', () => {
    // @ts-expect-error a full catalog carries schemas, expressions, and policies
    createDeclareResource({ catalog: fullCatalog });
  });

  it('checks domains against the catalog and the validators (SPEC 3.6)', () => {
    createDeclareResource({
      catalog: contactsCatalog,
      validators: { email: {} },
      domains: { email: { email_check: { validator: 'email' } } },
    });
    createDeclareResource({
      catalog: contactsCatalog,
      validators: { email: {} },
      domains: {
        // @ts-expect-error phone_number is not a domain of the catalog
        phone_number: { phone_number_check: { validator: 'email' } },
      },
    });
    createDeclareResource({
      catalog: contactsCatalog,
      validators: { email: {} },
      domains: {
        short_text: {
          // @ts-expect-error short_text_check has a rule
          short_text_check: { validator: 'email' },
        },
      },
    });
    createDeclareResource({
      catalog: contactsCatalog,
      validators: { email: {} },
      domains: {
        email: {
          // @ts-expect-error phone is not a validator
          email_check: { validator: 'phone' },
        },
      },
    });
  });
});
