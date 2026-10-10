/**
 * The compile-time twins of `not-enforced.test.ts` (catalog ADR 0010; SPEC
 * 3.5, 6.1, 9.1): no validator to name, none to give, no code to rename,
 * no type narrowed by a rule the database does not apply, and the
 * relationship over an unenforced foreign key.
 */
import type { ErrorEntry } from '../errors/error-entry';
import type { Infer } from '../schema/infer';

import { describe, expectTypeOf, it } from 'vitest';

import { TEST_REGISTRIES } from '../test-support/definer';
import { unenforcedCatalog } from '../test-support/unenforced';
import { createDeclareResource } from './create-declare-resource';

const declareResource = createDeclareResource({
  catalog: unenforcedCatalog,
  validators: TEST_REGISTRIES.validators,
});

const Owners = declareResource('owners', { operations: ['get'], fields: {} });

// Writes the columns of three unenforced CHECKs without a rule, and names
// no validator: none is required.
const ImportedContacts = declareResource('imported_contacts', {
  operations: ['get', 'create', 'update'],
  fields: {
    name: { access: 'readWrite' },
    nickname: { access: 'readWrite' },
    email: { access: 'readWrite' },
    status: { access: 'readWrite' },
    score: { access: 'readWrite' },
  },
  relationships: {
    owner_id: { target: () => Owners, access: 'readWrite' },
  },
});

describe('NOT ENFORCED in types', () => {
  it('refuses a validator on an unenforced CHECK, with or without a rule', () => {
    declareResource('imported_contacts', {
      operations: ['create'],
      fields: {
        name: { access: 'readWrite' },
        email: { access: 'readWrite' },
        status: { access: 'readWrite' },
      },
      rules: {
        // @ts-expect-error validator: PostgreSQL does not enforce this CHECK (NOT ENFORCED), so no validator covers it
        imported_contacts_email_check: { validator: 'email' },
        // @ts-expect-error validator: PostgreSQL does not enforce this CHECK (NOT ENFORCED), so no validator covers it
        imported_contacts_status_check: { validator: 'email' },
      },
    });
  });

  it('refuses code on an unenforced CHECK or foreign key', () => {
    declareResource('imported_contacts', {
      operations: ['create'],
      fields: { name: { access: 'readWrite' }, email: { access: 'readWrite' } },
      relationships: {
        owner_id: { target: () => Owners, access: 'readWrite' },
      },
      rules: {
        // @ts-expect-error code: the key has no code, since clients cannot violate it
        imported_contacts_email_check: { code: 'IMPORT_FAILED' },
        // @ts-expect-error code: the key has no code, since clients cannot violate it
        imported_contacts_owner_id_fkey: { code: 'OWNER_MISSING' },
      },
    });
  });

  it('types the errors without the unenforced constraints', () => {
    expectTypeOf(ImportedContacts.errors).toEqualTypeOf<{
      readonly IMPORTED_CONTACTS_SCORE_CHECK: ErrorEntry<'check', 'score'>;
      readonly IMPORTED_CONTACTS_NAME_NOT_NULL: ErrorEntry<'notNull', 'name'>;
    }>();
  });

  it('narrows no type and requires no member by a rule the database does not apply', () => {
    expectTypeOf<Infer<typeof ImportedContacts>['create']>().toEqualTypeOf<{
      name: string;
      nickname?: string | null;
      email?: string | null;
      status?: string | null;
      score?: number | null;
    }>();
  });

  it('declares the relationship over the unenforced foreign key', () => {
    expectTypeOf<
      Infer<typeof ImportedContacts>['linkage']['create']
    >().toEqualTypeOf<{
      owner?: { type: 'owners'; id: string } | null;
    }>();
  });
});
