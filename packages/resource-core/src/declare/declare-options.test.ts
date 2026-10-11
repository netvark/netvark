import { describe, expect, it } from 'vitest';

import { untypedDeclare } from '../test-support/catalog-builder';
import { typeErrorOf } from '../test-support/failure';

const declare = untypedDeclare();
const base = {
  operations: ['list', 'get'],
  fields: { name: { access: 'read', sort: true } },
};

const withClientIds = (target: string) => () =>
  declare(target, { operations: ['get'], clientIds: true, fields: {} });

const withOperations = (operations: unknown) => () =>
  declare('contacts', { ...base, operations });

const withRules = (target: string, declaration: object, rules: unknown) => () =>
  declare(target, { ...declaration, rules });

/** A meetings declaration that creates, with the given members. */
const createMeetings = (members: object) => () =>
  declare('meetings', { operations: ['create'], fields: {}, ...members });

describe('declareResource: client ids (SPEC 3.4)', () => {
  it('refuses clientIds on a primary key PostgreSQL takes no client value for', () => {
    expect(typeErrorOf(withClientIds('organizations'))).toBe(
      'organizations.clientIds: the primary key is an identity column generated always, which takes no client value',
    );
    expect(typeErrorOf(withClientIds('tags'))).toBe(
      'tags.clientIds: the primary key is a generated column, which takes no client value',
    );
    expect(withClientIds('contacts')).not.toThrow();
    expect(withClientIds('meetings')).not.toThrow();
  });
});

describe('declareResource: scope (SPEC 3.2)', () => {
  it('refuses a scope the definer does not have, or whose column the table lacks', () => {
    expect(
      typeErrorOf(() => declare('contacts', { ...base, scope: 'tenant' })),
    ).toBe('contacts.scope: "tenant" is not a scope of createDeclareResource');
    expect(
      typeErrorOf(() =>
        declare('audit.changes', {
          operations: ['get'],
          scope: 'organization',
          fields: {},
        }),
      ),
    ).toBe(
      'audit.changes.scope: scope organization names column organization_id, which audit.changes does not have',
    );
  });
});

describe('declareResource: operations (SPEC 3.3)', () => {
  it('refuses no operation, an unknown one, and a repeated one', () => {
    expect(typeErrorOf(withOperations([]))).toBe(
      'contacts.operations: list at least one operation',
    );
    expect(typeErrorOf(withOperations(['get', 'delete']))).toBe(
      'contacts.operations[1]: "delete" is not an operation (list, get, create, update, remove)',
    );
    expect(typeErrorOf(withOperations(['get', 'get']))).toBe(
      'contacts.operations[1]: "get" is listed twice',
    );
  });

  it('refuses update when no member is writable on update', () => {
    expect(typeErrorOf(withOperations(['get', 'update']))).toBe(
      'contacts.operations: update needs a field or relationship writable on update',
    );
    expect(() =>
      declare('meetings', {
        operations: ['get', 'update'],
        fields: {},
        relationships: {
          follow_up_of_id: { target: () => null, access: 'readWrite' },
        },
      }),
    ).not.toThrow();
  });
});

describe('declareResource: rules (SPEC 3.5)', () => {
  it('accepts constraint names and NOT NULL keys, and refuses anything else', () => {
    expect(
      withRules('contacts', base, {
        contacts_email_unique: {},
        contacts_name_not_null: {},
      }),
    ).not.toThrow();
    expect(
      typeErrorOf(
        withRules('contacts', base, { contacts_nickname_not_null: {} }),
      ),
    ).toBe(
      'contacts.rules.contacts_nickname_not_null: "contacts_nickname_not_null" is not a constraint or NOT NULL key of contacts',
    );
    expect(
      typeErrorOf(
        withRules(
          'audit.changes',
          { operations: ['get'], fields: {} },
          { 'audit.changes_payload_not_null': {} },
        ),
      ),
    ).toBe(
      'audit.changes.rules.audit.changes_payload_not_null: "audit.changes_payload_not_null" is not a constraint or NOT NULL key of audit.changes',
    );
  });

  it('refuses a validator that is unknown, or that covers a CHECK with a rule or another constraint', () => {
    const meetings = {
      operations: ['create'],
      fields: { room: { access: 'immutable' } },
    };
    expect(
      typeErrorOf(
        withRules('meetings', meetings, {
          meetings_room_check: { validator: 'phone' },
        }),
      ),
    ).toBe(
      'meetings.rules.meetings_room_check.validator: "phone" is not a validator of createDeclareResource',
    );
    expect(
      typeErrorOf(
        withRules('contacts', base, {
          contacts_name_check: { validator: 'room' },
        }),
      ),
    ).toBe(
      'contacts.rules.contacts_name_check.validator: the CHECK has a rule, which enforces it already',
    );
    for (const key of ['contacts_email_unique', 'contacts_name_not_null']) {
      expect(
        typeErrorOf(
          withRules('contacts', base, { [key]: { validator: 'room' } }),
        ),
      ).toBe(
        `contacts.rules.${key}.validator: a validator covers only a CHECK without a rule`,
      );
    }
  });

  it('requires a validator for each written CHECK without a rule, multi-column ones included', () => {
    expect(
      typeErrorOf(
        createMeetings({ fields: { room: { access: 'immutable' } } }),
      ),
    ).toBe(
      'meetings.rules.meetings_room_check: a CHECK without a rule needs a validator',
    );
    expect(
      typeErrorOf(
        createMeetings({
          relationships: {
            contact_id: { target: () => null, access: 'immutable' },
          },
        }),
      ),
    ).toBe(
      'meetings.rules.meetings_contact_or_notes: a CHECK without a rule needs a validator',
    );
    expect(
      createMeetings({ fields: { room: { access: 'read' } } }),
    ).not.toThrow();
    expect(
      createMeetings({
        fields: {
          room: { access: 'immutable' },
          notes: { access: 'immutable' },
        },
        rules: {
          meetings_room_check: { validator: 'room' },
          meetings_contact_or_notes: { validator: 'contactOrNotes' },
        },
      }),
    ).not.toThrow();
  });
});
