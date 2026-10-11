/**
 * The compile errors of SPEC 3.2 to 3.7 and 14 for the declaration's
 * options, each as a `@ts-expect-error` where TypeScript reports it.
 */
import { describe, it } from 'vitest';
import { z } from 'zod';

import { defineValidator } from '../codecs/define-validator';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { createDeclareResource } from './create-declare-resource';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});
const withoutDomains = createDeclareResource({ catalog: contactsCatalog });

/** `meetings_contact_or_notes` over the old linkage input and over a non-null contact: neither takes what the CHECK's members hold. */
const linkageOrNotes = defineValidator({
  schema: z.object({
    contact: z.object({ type: z.string(), id: z.string() }).nullable(),
    notes: z.string().nullable(),
  }),
  fixtures: {
    accept: [{ contact: null, notes: 'Lobby' }],
    reject: [{ contact: null, notes: 1 as unknown as string }],
  },
});
const contactAndNotes = defineValidator({
  schema: z.object({ contact: z.string(), notes: z.string().nullable() }),
  fixtures: {
    accept: [{ contact: 'c', notes: null }],
    reject: [{ contact: 1 as unknown as string, notes: null }],
  },
});
const contactOrMemo = defineValidator({
  schema: z.object({
    contact: z.string().nullable(),
    memo: z.string().nullable(),
  }),
  fixtures: {
    accept: [{ contact: null, memo: 'Lobby' }],
    reject: [{ contact: null, memo: 1 as unknown as string }],
  },
});
const checked = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
  validators: {
    ...TEST_REGISTRIES.validators,
    linkageOrNotes,
    contactAndNotes,
    contactOrMemo,
  },
});
const Contacts = checked('contacts', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

describe('declareResource: identity, scope, and operations', () => {
  it('rejects a table without a single-column primary key', () => {
    // @ts-expect-error contact_phones has a two-column primary key
    declareResource('contact_phones', { operations: ['get'], fields: {} });
  });

  it('rejects a primary key that cannot carry a resource id', () => {
    // @ts-expect-error documents is keyed by a jsonb column
    declareResource('documents', { operations: ['get'], fields: {} });
  });

  it('rejects clientIds on a primary key that takes no client value', () => {
    declareResource('organizations', {
      operations: ['create'],
      // @ts-expect-error an identity column generated always takes no client value
      clientIds: true,
      fields: { name: { access: 'immutable' } },
    });
    declareResource('tags', {
      operations: ['get'],
      // @ts-expect-error a generated column takes no client value
      clientIds: true,
      fields: { label: { access: 'read' } },
    });
  });

  it('rejects a scope whose column the table does not have', () => {
    declareResource('audit.changes', {
      operations: ['get'],
      // @ts-expect-error audit.changes has no organization_id
      scope: 'organization',
      fields: {},
    });
  });

  it('rejects empty, repeated, and unwritable operations', () => {
    // @ts-expect-error at least one operation
    declareResource('contacts', { operations: [], fields: {} });
    // @ts-expect-error get is listed twice
    declareResource('contacts', { operations: ['get', 'get'], fields: {} });
    declareResource('contacts', {
      // @ts-expect-error update needs a member writable on update
      operations: ['update'],
      fields: { name: { access: 'read' } },
    });
  });
});

describe('declareResource: search and sort', () => {
  it('rejects a search column that is not a tsvector, and a mismatched config', () => {
    declareResource('contacts', {
      operations: ['list'],
      fields: {},
      // @ts-expect-error name is not a tsvector column
      search: { column: 'name' },
    });
    declareResource('contacts', {
      operations: ['list'],
      fields: {},
      // @ts-expect-error search is generated with config simple
      search: { column: 'search', config: 'english' },
    });
  });

  it('rejects a default sort over a field without sort: true', () => {
    declareResource('contacts', {
      operations: ['list'],
      fields: { name: { access: 'read' } },
      // @ts-expect-error name is not declared with sort: true
      sort: { default: ['-name'] },
    });
  });

  it('rejects a default sort that names a field twice', () => {
    declareResource('contacts', {
      operations: ['list'],
      fields: { name: { access: 'read', sort: true } },
      // @ts-expect-error name is listed twice
      sort: { default: ['-name', { field: 'name', direction: 'asc' }] },
    });
  });
});

describe('declareResource: rules and domains', () => {
  it('rejects a written CHECK without a rule and without a validator', () => {
    // @ts-expect-error meetings_room_check needs a validator
    declareResource('meetings', {
      operations: ['create'],
      fields: { room: { access: 'immutable' } },
    });
    // @ts-expect-error meetings_contact_or_notes needs a validator once notes is written
    declareResource('meetings', {
      operations: ['create'],
      fields: { notes: { access: 'immutable' } },
    });
  });

  it('checks the rest of a declaration whose relationships and rules are undefined', () => {
    // @ts-expect-error meetings_room_check needs a validator
    declareResource('meetings', {
      operations: ['create'],
      fields: { room: { access: 'immutable' } },
      relationships: undefined,
      rules: undefined,
    });
    declareResource('meetings', {
      // @ts-expect-error update needs a member writable on update
      operations: ['update'],
      fields: { room: { access: 'read' } },
      relationships: undefined,
    });
  });

  it('rejects a validator on a CHECK with a rule, or on another constraint', () => {
    declareResource('contacts', {
      operations: ['get'],
      fields: {},
      rules: {
        // @ts-expect-error contacts_name_check has a rule
        contacts_name_check: { validator: 'room' },
        // @ts-expect-error a unique constraint takes no validator
        contacts_email_unique: { validator: 'room' },
      },
    });
  });

  it('rejects a written field whose domain CHECK the definer does not cover', () => {
    withoutDomains('contacts', {
      operations: ['create'],
      fields: {
        // @ts-expect-error email_check has no rule and no validator in domains
        email: { access: 'immutable' },
      },
    });
    withoutDomains('contacts', {
      operations: ['get'],
      fields: { email: { access: 'read' } },
    });
  });

  it('rejects a validator whose input does not take what its CHECK holds (SPEC 7.2)', () => {
    checked('meetings', {
      operations: ['create'],
      fields: { room: { access: 'immutable' } },
      // @ts-expect-error contactOrNotes takes an object; room is a string
      rules: { meetings_room_check: { validator: 'contactOrNotes' } },
    });
    const members = {
      fields: { notes: { access: 'immutable' } },
      relationships: {
        contact_id: { target: () => Contacts, access: 'immutable' },
      },
    } as const;
    checked('meetings', {
      operations: ['create'],
      ...members,
      // @ts-expect-error room takes a string; the CHECK holds { contact, notes }
      rules: { meetings_contact_or_notes: { validator: 'room' } },
    });
    checked('meetings', {
      operations: ['create'],
      ...members,
      // @ts-expect-error a relationship enters as its id, not its linkage
      rules: { meetings_contact_or_notes: { validator: 'linkageOrNotes' } },
    });
    checked('meetings', {
      operations: ['create'],
      ...members,
      // @ts-expect-error contact_id is nullable, so contact may be null
      rules: { meetings_contact_or_notes: { validator: 'contactAndNotes' } },
    });
    checked('meetings', {
      operations: ['create'],
      ...members,
      rules: { meetings_contact_or_notes: { validator: 'contactOrNotes' } },
    });
  });

  it('keys a CHECK object by public names, and skips a CHECK that never runs', () => {
    const relationships = {
      contact_id: { target: () => Contacts, access: 'immutable' },
    } as const;
    checked('meetings', {
      operations: ['create'],
      fields: { notes: { access: 'immutable', as: 'memo' } },
      relationships,
      rules: { meetings_contact_or_notes: { validator: 'contactOrMemo' } },
    });
    checked('meetings', {
      operations: ['create'],
      fields: { notes: { access: 'immutable', as: 'memo' } },
      relationships,
      // @ts-expect-error the field is named memo, not notes
      rules: { meetings_contact_or_notes: { validator: 'contactOrNotes' } },
    });
    checked('meetings', {
      operations: ['create'],
      fields: { notes: { access: 'immutable' } },
      rules: { meetings_contact_or_notes: { validator: 'room' } },
    });
  });
});
