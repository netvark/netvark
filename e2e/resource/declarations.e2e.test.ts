/**
 * The contacts application's declarations at runtime (resource SPEC 3,
 * 14), through the built package: each is a frozen copy keyed by the
 * table, targets resolve lazily to the declared resources, and JavaScript
 * callers get a `TypeError` naming the option for every mistake
 * `fails/` proves TypeScript refuses (those of `fails/names.ts` in
 * `names.e2e.test.ts`).
 */
import { describe, expect, it } from 'vitest';

import { catalog } from './fixtures/contacts/catalog.ts';
import { publicCatalog } from './fixtures/contacts/public-catalog.ts';
import { Contacts } from './resources/contacts.ts';
import { Meetings } from './resources/meetings.ts';
import { Notes } from './resources/notes.ts';
import { Organizations } from './resources/organizations.ts';
import {
  configureUntyped,
  declareUntyped,
  typeErrorOf,
} from './support/untyped.ts';

const RESOURCES = [Organizations, Contacts, Meetings, Notes];

describe('the declared resources', () => {
  it('hold their table, a frozen copy of the declaration, their names, their codes, and their field metadata', () => {
    expect(RESOURCES.map((resource) => resource.table)).toEqual([
      'organizations',
      'contacts',
      'meetings',
      'notes',
    ]);
    for (const resource of RESOURCES) {
      expect(Object.keys(resource).toSorted()).toEqual([
        'declaration',
        'errors',
        'fields',
        'keyset',
        'linkage',
        'names',
        'resource',
        'schema',
        'table',
        'validate',
        'write',
      ]);
      expect(Object.isFrozen(resource)).toBe(true);
      expect(Object.isFrozen(resource.names)).toBe(true);
      expect(Object.isFrozen(resource.errors)).toBe(true);
      expect(Object.isFrozen(resource.fields)).toBe(true);
      expect(Object.isFrozen(resource.keyset)).toBe(true);
      expect(Object.isFrozen(resource.declaration)).toBe(true);
      expect(Object.isFrozen(resource.declaration.fields)).toBe(true);
    }
    expect(Contacts.declaration.search).toEqual({
      column: 'search',
      config: 'simple',
      mode: 'websearch',
    });
    expect(Meetings.declaration.fields.during.codec).toBe('timeRange');
  });

  it('resolve relationship targets to the declared resources', () => {
    expect(Meetings.declaration.relationships.contact_id.target()).toBe(
      Contacts,
    );
    expect(Meetings.declaration.relationships.organization_id.target()).toBe(
      Organizations,
    );
    expect(Contacts.declaration.relationships.organization_id.target()).toBe(
      Organizations,
    );
    expect(Notes.declaration.relationships.author.target()).toBe(Contacts);
  });
});

/** The mistakes of `fails/`, as JavaScript makes them: `[table, declaration, message]`. */
const DECLARATION_ERRORS: ReadonlyArray<readonly [string, object, string]> = [
  [
    'contact_phones',
    { operations: ['get'], fields: {} },
    'contact_phones: a resource needs a single-column primary key',
  ],
  [
    'import_batches',
    { operations: ['get'], fields: {} },
    "import_batches: the primary key's type jsonb cannot carry a resource id",
  ],
  [
    'import_rows',
    {
      operations: ['get'],
      fields: {},
      relationships: { batch: { target: () => Organizations, access: 'read' } },
    },
    'import_rows.relationships.batch: type jsonb cannot carry a resource id',
  ],
  [
    'audit.changes',
    { operations: ['get'], fields: {} },
    'declareResource: "audit.changes" is not a table of the public catalog',
  ],
  [
    'organizations',
    {
      operations: ['create'],
      clientIds: true,
      fields: { name: { access: 'immutable' } },
    },
    'organizations.clientIds: the primary key is an identity column generated always, which takes no client value',
  ],
  [
    'contacts',
    { operations: ['get'], fields: { id: { access: 'read' } } },
    'contacts.fields.id: the primary key is the resource id',
  ],
  [
    'contacts',
    { operations: ['get'], fields: { kind: { access: 'immutable' } } },
    'contacts.fields.kind.access: immutable needs the create operation',
  ],
  [
    'meetings',
    { operations: ['get'], fields: { during: { access: 'read' } } },
    'meetings.fields.during: type tstzrange has no wire form; name a codec',
  ],
  [
    'meetings',
    {
      operations: ['get'],
      fields: { room: { access: 'read', codec: 'timeRange' } },
    },
    'meetings.fields.room.codec: codec "timeRange" does not accept type text',
  ],
  [
    'contacts',
    {
      operations: ['create'],
      scope: 'organization',
      fields: {},
      relationships: {
        organization_id: { target: () => Organizations, access: 'immutable' },
      },
    },
    'contacts.relationships.organization_id.access: the scope column is read-only',
  ],
  [
    'meetings',
    {
      operations: ['get'],
      fields: {},
      relationships: {
        organization_id: { target: Organizations, access: 'read' },
      },
    },
    "meetings.relationships.organization_id.target: must be a function returning the target's declared resource",
  ],
  [
    'contacts',
    { operations: ['get', 'update'], fields: { name: { access: 'read' } } },
    'contacts.operations: update needs a field or relationship writable on update',
  ],
  [
    'contacts',
    {
      operations: ['list'],
      fields: {},
      search: { column: 'search', config: 'english' },
    },
    'contacts.search.config: the column is generated with config "simple"',
  ],
  [
    'meetings',
    { operations: ['create'], fields: { room: { access: 'immutable' } } },
    'meetings.rules.meetings_room_lowercase: a CHECK without a rule needs a validator',
  ],
  [
    'meetings',
    {
      operations: ['create'],
      fields: {},
      relationships: {
        contact_id: { target: () => Contacts, access: 'immutable' },
      },
    },
    'meetings.rules.meetings_contact_or_notes: a CHECK without a rule needs a validator',
  ],
  [
    'contacts',
    {
      operations: ['list'],
      fields: {},
      rules: { contacts_name_check: { validator: 'lowercase' } },
    },
    'contacts.rules.contacts_name_check.validator: the CHECK has a rule, which enforces it already',
  ],
  [
    'contacts',
    {
      operations: ['list'],
      fields: { tags: { access: 'read', filter: ['gt'] } },
    },
    'contacts.fields.tags.filter: operator "gt" is not available for array fields',
  ],
  [
    'contacts',
    {
      operations: ['list'],
      fields: { name: { access: 'read', filter: ['isNull'] } },
    },
    'contacts.fields.name.filter: operator "isNull" is not available for non-null fields',
  ],
  [
    'contacts',
    { operations: ['list'], fields: { tags: { access: 'read', sort: true } } },
    'contacts.fields.tags.sort: an array field is not sortable',
  ],
  [
    'import_rows',
    {
      operations: ['list'],
      fields: { payload: { access: 'read', filter: ['eq'] } },
    },
    'import_rows.fields.payload.filter: type jsonb is not filterable',
  ],
];

describe('declarations JavaScript gets wrong', () => {
  it.each(DECLARATION_ERRORS)('%s: %j', (table, declaration, message) => {
    expect(typeErrorOf(() => declareUntyped(table, declaration))).toBe(message);
  });

  it('a definer without the domain validators refuses a written email', () => {
    const withoutDomains = configureUntyped({ catalog: publicCatalog }) as (
      table: string,
      declaration: object,
    ) => unknown;
    expect(
      typeErrorOf(() =>
        withoutDomains('contacts', {
          operations: ['create'],
          fields: { email: { access: 'immutable' } },
        }),
      ),
    ).toBe(
      "contacts.fields.email: domain email's CHECK email_check has no rule; give it a validator in createDeclareResource domains",
    );
  });

  it('the definer refuses the full catalog', () => {
    expect(typeErrorOf(() => configureUntyped({ catalog }))).toBe(
      'createDeclareResource.catalog: a full catalog; pass the public catalog (toPublicCatalog), since declarations reach browsers',
    );
  });
});
