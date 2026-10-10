import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { check, conflict, missing, notNull } from '../test-support/errors';

const declare = untypedDeclare();

const Organizations = declare('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

const Contacts = declare('contacts', {
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

function meetings(clientIds: boolean) {
  const resource = declare('meetings', {
    operations: ['get', 'create', 'update'],
    scope: 'organization',
    clientIds,
    fields: {
      room: { access: 'readWrite' },
      during: { access: 'readWrite', codec: 'range' },
      notes: { access: 'readWrite' },
      attendees: { access: 'readWrite' },
    },
    relationships: {
      contact_id: { target: () => Contacts, access: 'readWrite' },
      follow_up_of_id: { target: () => resource, access: 'immutable' },
    },
    rules: {
      meetings_room_check: { validator: 'room' },
      meetings_contact_or_notes: { validator: 'contactOrNotes' },
    },
  });
  return resource;
}

describe('errors: the derived codes of a declared resource (SPEC 9.1)', () => {
  it('maps each constraint over a member, each NOT NULL key of a written member, and each domain CHECK to its entry', () => {
    expect(Contacts.errors).toEqual({
      CONTACTS_EMAIL_UNIQUE: conflict('unique', 'email'),
      CONTACTS_NAME_CHECK: check('name'),
      CONTACTS_NICKNAME_CHECK: check('nickname'),
      CONTACTS_PRIORITY_CHECK: check('priority'),
      CONTACTS_STATUS_CHECK: check('status'),
      CONTACTS_KIND_NOT_NULL: notNull('kind'),
      CONTACTS_NAME_NOT_NULL: notNull('name'),
      CONTACTS_STATUS_NOT_NULL: notNull('status'),
      CONTACTS_TAGS_NOT_NULL: notNull('tags'),
      EMAIL_CHECK: check('email'),
      PERCENTAGE_CHECK: check('discount'),
    });
  });

  it('orders the codes: constraints in catalog order, NOT NULL keys in column order, then domain CHECKs', () => {
    expect(Object.keys(Contacts.errors)).toEqual([
      'CONTACTS_EMAIL_UNIQUE',
      'CONTACTS_NAME_CHECK',
      'CONTACTS_NICKNAME_CHECK',
      'CONTACTS_PRIORITY_CHECK',
      'CONTACTS_STATUS_CHECK',
      'CONTACTS_KIND_NOT_NULL',
      'CONTACTS_NAME_NOT_NULL',
      'CONTACTS_STATUS_NOT_NULL',
      'CONTACTS_TAGS_NOT_NULL',
      'EMAIL_CHECK',
      'PERCENTAGE_CHECK',
    ]);
  });

  it('derives no code from the scope column and never points at it, since the server writes it; without a scope the column is a member like any other', () => {
    expect(
      Object.hasOwn(Contacts.errors, 'CONTACTS_ORGANIZATION_ID_FKEY'),
    ).toBe(false);
    expect(Contacts.errors['CONTACTS_EMAIL_UNIQUE']).toEqual(
      conflict('unique', 'email'),
    );
    const unscoped = declare('contacts', {
      operations: ['get', 'create'],
      fields: { email: { access: 'readWrite' } },
      relationships: {
        organization_id: { target: () => Organizations, access: 'readWrite' },
      },
    });
    expect(unscoped.errors).toEqual({
      CONTACTS_EMAIL_UNIQUE: conflict('unique', 'organization', 'email'),
      CONTACTS_ORGANIZATION_ID_FKEY: missing('organization'),
      CONTACTS_ORGANIZATION_ID_NOT_NULL: notNull('organization'),
      EMAIL_CHECK: check('email'),
    });
  });

  it('gives the primary key a code only with clientIds, pointing at id', () => {
    expect(meetings(true).errors['MEETINGS_PKEY']).toEqual(
      conflict('primaryKey', 'id'),
    );
    expect(Object.hasOwn(meetings(false).errors, 'MEETINGS_PKEY')).toBe(false);
  });

  it('points an exclusion, a foreign key, and a CHECK over a relationship and a field at their public members', () => {
    const { errors } = meetings(false);
    expect(errors['MEETINGS_NO_DOUBLE_BOOKING']).toEqual(
      conflict('exclusion', 'room', 'during'),
    );
    expect(errors['MEETINGS_CONTACT_ID_FKEY']).toEqual(missing('contact'));
    expect(errors['MEETINGS_FOLLOW_UP_OF_ID_FKEY']).toEqual(
      missing('followUpOf'),
    );
    expect(errors['MEETINGS_CONTACT_OR_NOTES']).toEqual(
      check('contact', 'notes'),
    );
    expect(errors['MEETINGS_ROOM_CHECK']).toEqual(check('room'));
  });

  it("derives a domain's CHECKs through an array, and a NOT NULL check rule like any other", () => {
    const { errors } = meetings(false);
    expect(errors['EMAIL_CHECK']).toEqual(check('attendees'));
    expect(errors['REQUIRED_NOTE_CHECK']).toEqual(check('notes'));
  });

  it('keeps the codes of a read member but derives no NOT NULL key for it', () => {
    const resource = declare('contacts', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
    });
    expect(resource.errors).toEqual({ CONTACTS_NAME_CHECK: check('name') });
  });

  it('names members by their public names, as given', () => {
    const resource = declare('contacts', {
      operations: ['get', 'create'],
      scope: 'organization',
      fields: { email: { access: 'readWrite', as: 'emailAddress' } },
    });
    expect(resource.errors).toEqual({
      CONTACTS_EMAIL_UNIQUE: conflict('unique', 'emailAddress'),
      EMAIL_CHECK: check('emailAddress'),
    });
  });

  it("uses the code a rule gives in place of the rule key's", () => {
    const resource = declare('contacts', {
      operations: ['get', 'create'],
      scope: 'organization',
      fields: { name: { access: 'readWrite' }, email: { access: 'readWrite' } },
      rules: {
        contacts_email_unique: { code: 'CONTACT_EMAIL_TAKEN' },
        contacts_name_not_null: { code: 'NAME_REQUIRED' },
      },
    });
    expect(Object.keys(resource.errors)).toEqual([
      'CONTACT_EMAIL_TAKEN',
      'CONTACTS_NAME_CHECK',
      'NAME_REQUIRED',
      'EMAIL_CHECK',
    ]);
  });

  it('derives a code from a partial unique index as from a UNIQUE constraint, and takes the code a rule gives', () => {
    const tools = table(
      'tools',
      {
        id: column({ nullable: false }),
        organization_id: column(),
        name: column({ nullable: false }),
      },
      {
        tools_pkey: { kind: 'primaryKey', columns: ['id'] },
        tools_org_name_unique: {
          kind: 'unique',
          columns: ['organization_id', 'name'],
          nullsDistinct: true,
          partial: true,
        },
      },
    );
    const declareTools = untypedDeclare(catalogOf({ tools }));
    const fields = { name: { access: 'readWrite' } };
    expect(
      declareTools('tools', { operations: ['get', 'create'], fields }).errors,
    ).toEqual({
      TOOLS_ORG_NAME_UNIQUE: conflict('unique', 'name'),
      TOOLS_NAME_NOT_NULL: notNull('name'),
    });
    const renamed = declareTools('tools', {
      operations: ['get', 'create'],
      fields,
      rules: { tools_org_name_unique: { code: 'TOOL_NAME_TAKEN' } },
    });
    expect(Object.keys(renamed.errors)).toEqual([
      'TOOL_NAME_TAKEN',
      'TOOLS_NAME_NOT_NULL',
    ]);
  });

  it("uses the code the definer's domain rule gives, the code its validator's issues carry", () => {
    const resource = untypedDeclare(contactsCatalog, {
      ...TEST_REGISTRIES,
      domains: {
        email: { email_check: { validator: 'email', code: 'EMAIL_INVALID' } },
      },
    })('contacts', {
      operations: ['get', 'create'],
      fields: { email: { access: 'readWrite' } },
    });
    expect(resource.errors['EMAIL_INVALID']).toEqual(check('email'));
    expect(Object.hasOwn(resource.errors, 'EMAIL_CHECK')).toBe(false);
  });

  it('freezes the codes, each entry, and each list of fields', () => {
    const entry = Contacts.errors['CONTACTS_EMAIL_UNIQUE'];
    expect(Object.isFrozen(Contacts.errors)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry?.fields)).toBe(true);
  });
});
