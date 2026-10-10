/**
 * `fields` on a declared resource (SPEC 8) over the unit-test catalog: one
 * entry per public member, keyed by public name, the fields and then the
 * relationships in declaration order; what a create must carry, as
 * `schema.create` and `linkage.create` say; a relationship described by its
 * id; and a record that is frozen and built on first read.
 */
import type { z } from 'zod/v4';

import type { DeclaredResource } from '../declare/declared-resource';

import { describe, expect, it } from 'vitest';

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
    name: {
      access: 'readWrite',
      filter: ['eq', 'containsi'],
      sort: true,
      description: 'What the contact is called.',
      example: 'Ada Lovelace',
    },
    kind: { access: 'immutable', filter: ['eq', 'in'] },
    status: { access: 'readWrite' },
    priority: { access: 'readWrite' },
    discount: { access: 'write' },
    tags: { access: 'readWrite' },
    created_at: { access: 'read', sort: true },
  },
  relationships: {
    organization_id: {
      target: () => Organizations,
      access: 'read',
      filter: ['eq'],
      description: 'The organization the contact belongs to.',
    },
  },
});

const Meetings = declareResource('meetings', {
  operations: ['get', 'create'],
  scope: 'organization',
  fields: {
    room: { access: 'readWrite' },
    notes: { access: 'readWrite' },
    during: { access: 'readWrite', codec: 'range' },
    attendees: { access: 'readWrite' },
  },
  relationships: {
    contact_id: { target: () => Contacts, access: 'readWrite' },
    follow_up_of_id: { target: () => Meetings, access: 'immutable' },
  },
  rules: {
    meetings_room_check: { validator: 'room' },
    meetings_contact_or_notes: { validator: 'contactOrNotes' },
  },
});

/** The members a parse of `{}` reports missing: those a create must carry. */
function missing(schema: z.ZodType): ReadonlyArray<PropertyKey | undefined> {
  return schema.safeParse({}).error?.issues.map((issue) => issue.path[0]) ?? [];
}

const NO_LIMITS = {
  minLength: null,
  maxLength: null,
  minimum: null,
  exclusiveMinimum: null,
  maximum: null,
  exclusiveMaximum: null,
  multipleOf: null,
  patterns: [],
};

describe('fields (SPEC 8)', () => {
  it('keys the fields and then the relationships by public name, in declaration order', () => {
    expect(Object.keys(Contacts.fields)).toEqual([
      'name',
      'kind',
      'status',
      'priority',
      'discount',
      'tags',
      'createdAt',
      'organization',
    ]);
  });

  it('describes a field from its column, its CHECKs, and its declaration', () => {
    expect(Contacts.fields.name).toEqual({
      name: 'name',
      column: 'name',
      kind: 'attribute',
      access: 'readWrite',
      wire: 'string',
      format: null,
      fractionDigits: null,
      nullable: false,
      required: true,
      default: null,
      limits: { ...NO_LIMITS, minLength: 1, maxLength: 200 },
      options: null,
      items: null,
      target: null,
      filter: ['eq', 'containsi'],
      sortable: true,
      codec: null,
      description: 'What the contact is called.',
      example: 'Ada Lovelace',
    });
  });

  it("lists an enum's labels and an enum rule's values, with the defaults that make them optional", () => {
    expect(Contacts.fields.kind).toMatchObject({
      options: ['person', 'company'],
      default: { literal: 'person' },
      required: false,
    });
    expect(Contacts.fields.status).toMatchObject({
      options: ['active', 'archived'],
      default: { literal: 'active' },
      required: false,
    });
  });

  it("folds a domain's numeric(5,2) and its range into one bound per keyword", () => {
    expect(Contacts.fields.discount).toMatchObject({
      wire: 'string',
      format: 'decimal',
      nullable: true,
      default: { literal: '0' },
      limits: {
        ...NO_LIMITS,
        minimum: '0',
        maximum: '100',
        multipleOf: '0.01',
      },
    });
    expect(Contacts.fields.priority.limits).toEqual({
      ...NO_LIMITS,
      minimum: '1',
      maximum: '5',
    });
  });

  it('describes a read-only date-time with an expression default', () => {
    expect(Contacts.fields.createdAt).toMatchObject({
      access: 'read',
      wire: 'string',
      format: 'date-time',
      fractionDigits: 6,
      required: false,
      default: { literal: null },
      sortable: true,
    });
  });

  it("describes an array by its elements, a domain's included", () => {
    expect(Contacts.fields.tags).toMatchObject({
      wire: 'array',
      default: { literal: '{}' },
      items: { wire: 'string', format: null, options: null },
    });
    expect(Meetings.fields.attendees.items).toEqual({
      wire: 'string',
      format: null,
      fractionDigits: null,
      limits: NO_LIMITS,
      options: null,
    });
  });

  it("leaves a codec field's value to its codec", () => {
    expect(Meetings.fields.during).toMatchObject({
      wire: 'any',
      format: null,
      codec: 'range',
      limits: NO_LIMITS,
      options: null,
      items: null,
    });
  });

  it("states no validator: a validator's constraint shows in the error responses", () => {
    expect(Meetings.fields.room).toMatchObject({
      wire: 'string',
      limits: NO_LIMITS,
      required: true,
    });
  });
});

describe('relationships in fields (SPEC 3.4, 3.8, 8)', () => {
  it("describes a relationship by its id, a string in its key's format, and its target", () => {
    expect(Contacts.fields.organization).toEqual({
      name: 'organization',
      column: 'organization_id',
      kind: 'relationship',
      access: 'read',
      wire: 'string',
      format: 'int64',
      fractionDigits: null,
      nullable: false,
      required: false,
      default: null,
      limits: {
        ...NO_LIMITS,
        minimum: '-9223372036854775808',
        maximum: '9223372036854775807',
      },
      options: null,
      items: null,
      target: 'organizations',
      filter: ['eq'],
      sortable: false,
      codec: null,
      description: 'The organization the contact belongs to.',
      example: undefined,
    });
    expect(Meetings.fields.contact).toMatchObject({
      format: 'uuid',
      nullable: true,
      target: 'contacts',
    });
    expect(Meetings.fields.followUpOf).toMatchObject({
      format: 'int64',
      target: 'meetings',
    });
  });

  it('says a create must carry exactly what schema.create and linkage.create require', () => {
    const resources: ReadonlyArray<DeclaredResource> = [Contacts, Meetings];
    for (const resource of resources) {
      const required = Object.values(resource.fields)
        .filter((meta) => meta.required)
        .map((meta) => meta.name);
      expect(required).toEqual([
        ...missing(resource.schema.create),
        ...missing(resource.linkage.create),
      ]);
    }
    expect(Meetings.fields.contact.required).toBe(false);
    expect(Meetings.fields.notes.required).toBe(true);
  });
});

describe('the fields record', () => {
  it('is frozen through its entries, bounds, and lists', () => {
    const { name } = Contacts.fields;
    expect(Object.isFrozen(Contacts.fields)).toBe(true);
    expect(Object.isFrozen(name)).toBe(true);
    expect(Object.isFrozen(name.limits)).toBe(true);
    expect(Object.isFrozen(name.limits.patterns)).toBe(true);
    expect(Object.isFrozen(name.filter)).toBe(true);
    expect(Object.isFrozen(Contacts.fields.kind.default)).toBe(true);
  });

  it('is built on first read, which reads every target', () => {
    let target: unknown = null;
    const Notes = declareResource('meetings', {
      operations: ['get'],
      fields: {},
      relationships: { contact_id: { target: () => target, access: 'read' } },
    });
    expect(() => Notes.fields).toThrow(
      new TypeError(
        'meetings.relationships.contact_id.target: must return the declared resource of contacts',
      ),
    );
    target = Contacts;
    expect(Notes.fields.contact.target).toBe('contacts');
    expect(Notes.fields).toBe(Notes.fields);
  });
});
