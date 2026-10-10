import type { DeclaredResource } from '../declare/declared-resource';
import type { ErrorEntry } from './error-entry';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';
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
  operations: ['list', 'get', 'create', 'update'],
  scope: 'organization',
  fields: {
    kind: { access: 'immutable' },
    name: { access: 'readWrite' },
    nickname: { access: 'readWrite' },
    email: { access: 'readWrite' },
    status: { access: 'readWrite' },
    priority: { access: 'readWrite' },
    discount: { access: 'write' },
    tags: { access: 'readWrite' },
    created_at: { access: 'read' },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
  },
});

describe('errors in types (SPEC 9.1)', () => {
  it('keys each derived code with its literal entry, as the runtime derives them', () => {
    expectTypeOf(Contacts.errors).toEqualTypeOf<{
      readonly CONTACTS_EMAIL_UNIQUE: ErrorEntry<'unique', 'email'>;
      readonly CONTACTS_NAME_CHECK: ErrorEntry<'check', 'name'>;
      readonly CONTACTS_NICKNAME_CHECK: ErrorEntry<'check', 'nickname'>;
      readonly CONTACTS_PRIORITY_CHECK: ErrorEntry<'check', 'priority'>;
      readonly CONTACTS_STATUS_CHECK: ErrorEntry<'check', 'status'>;
      readonly CONTACTS_KIND_NOT_NULL: ErrorEntry<'notNull', 'kind'>;
      readonly CONTACTS_NAME_NOT_NULL: ErrorEntry<'notNull', 'name'>;
      readonly CONTACTS_STATUS_NOT_NULL: ErrorEntry<'notNull', 'status'>;
      readonly CONTACTS_TAGS_NOT_NULL: ErrorEntry<'notNull', 'tags'>;
      readonly EMAIL_CHECK: ErrorEntry<'check', 'email'>;
      readonly PERCENTAGE_CHECK: ErrorEntry<'check', 'discount'>;
    }>();
  });

  it("types each entry's status and title by its kind", () => {
    expectTypeOf(
      Contacts.errors.CONTACTS_EMAIL_UNIQUE.status,
    ).toEqualTypeOf<409>();
    expectTypeOf(
      Contacts.errors.CONTACTS_NAME_CHECK.title,
    ).toEqualTypeOf<'Invalid Attribute'>();
    expectTypeOf(Contacts.errors.CONTACTS_KIND_NOT_NULL.fields).toEqualTypeOf<
      ReadonlyArray<'kind'>
    >();
    // @ts-expect-error a code the resource does not derive
    expectTypeOf(Contacts.errors.CONTACTS_WEBSITE_CHECK).toBeObject();
  });

  it('derives no code from the scope column, and points at it only when the declaration has no scope', () => {
    const Unscoped = declareResource('contacts', {
      operations: ['get', 'create'],
      fields: { email: { access: 'readWrite', as: 'emailAddress' } },
      relationships: {
        organization_id: { target: () => Organizations, access: 'readWrite' },
      },
    });
    expectTypeOf(Unscoped.errors).toEqualTypeOf<{
      readonly CONTACTS_EMAIL_UNIQUE: ErrorEntry<
        'unique',
        'organization' | 'emailAddress'
      >;
      readonly CONTACTS_ORGANIZATION_ID_FKEY: ErrorEntry<
        'foreignKey',
        'organization'
      >;
      readonly CONTACTS_ORGANIZATION_ID_NOT_NULL: ErrorEntry<
        'notNull',
        'organization'
      >;
      readonly EMAIL_CHECK: ErrorEntry<'check', 'emailAddress'>;
    }>();
  });

  it('types the primary key with clientIds, an exclusion, a multi-member CHECK, and domain CHECKs through arrays', () => {
    const Meetings = declareResource('meetings', {
      operations: ['get', 'create'],
      scope: 'organization',
      clientIds: true,
      fields: {
        room: { access: 'readWrite' },
        during: { access: 'readWrite', codec: 'range' },
        notes: { access: 'readWrite' },
        attendees: { access: 'readWrite' },
      },
      relationships: {
        contact_id: { target: () => Contacts, access: 'readWrite' },
      },
      rules: {
        meetings_room_check: { validator: 'room' },
        meetings_contact_or_notes: { validator: 'contactOrNotes' },
      },
    });
    expectTypeOf(Meetings.errors.MEETINGS_PKEY).toEqualTypeOf<
      ErrorEntry<'primaryKey', 'id'>
    >();
    expectTypeOf(Meetings.errors.MEETINGS_NO_DOUBLE_BOOKING).toEqualTypeOf<
      ErrorEntry<'exclusion', 'room' | 'during'>
    >();
    expectTypeOf(Meetings.errors.MEETINGS_CONTACT_OR_NOTES).toEqualTypeOf<
      ErrorEntry<'check', 'contact' | 'notes'>
    >();
    expectTypeOf(Meetings.errors.EMAIL_CHECK).toEqualTypeOf<
      ErrorEntry<'check', 'attendees'>
    >();
    expectTypeOf(Meetings.errors.REQUIRED_NOTE_CHECK).toEqualTypeOf<
      ErrorEntry<'check', 'notes'>
    >();
  });

  it('uses the codes rules and domain rules give', () => {
    const declareCoded = createDeclareResource({
      catalog: contactsCatalog,
      ...TEST_REGISTRIES,
      domains: {
        email: { email_check: { validator: 'email', code: 'EMAIL_INVALID' } },
      },
    });
    const Coded = declareCoded('contacts', {
      operations: ['get', 'create'],
      fields: { name: { access: 'readWrite' }, email: { access: 'readWrite' } },
      rules: {
        contacts_name_check: { code: 'NAME_LENGTH' },
        contacts_name_not_null: { code: 'NAME_REQUIRED' },
      },
    });
    expectTypeOf<keyof typeof Coded.errors>().toEqualTypeOf<
      | 'CONTACTS_EMAIL_UNIQUE'
      | 'NAME_LENGTH'
      | 'NAME_REQUIRED'
      | 'EMAIL_INVALID'
    >();
  });

  it('is a record of entries for a resource whose table TypeScript does not know', () => {
    expectTypeOf<DeclaredResource['errors']>().toEqualTypeOf<
      Readonly<Record<string, ErrorEntry>>
    >();
  });
});
