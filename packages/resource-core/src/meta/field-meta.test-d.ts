/**
 * The compile-time twin of `field-meta.test.ts` (SPEC 8): `fields` keyed by
 * public name, and each entry's kind, access, nullability, requirement on
 * create, options, elements, target, filter, sort, and codec typed by the
 * declaration and the catalog, wide for a resource whose table TypeScript
 * does not know.
 */
import type { DeclaredResource } from '../declare/declared-resource';
import type { FieldMeta, ItemMeta } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { unenforcedCatalog } from '../test-support/unenforced';

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
    name: { access: 'readWrite', filter: ['eq', 'containsi'], sort: true },
    kind: { access: 'immutable' },
    status: { access: 'readWrite' },
    discount: { access: 'write' },
    tags: { access: 'readWrite' },
    created_at: { access: 'read', as: 'addedAt' },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
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
    contact_id: {
      target: () => Contacts,
      access: 'readWrite',
      filter: ['eq', 'isNull'],
    },
  },
  rules: {
    meetings_room_check: { validator: 'room' },
    meetings_contact_or_notes: { validator: 'contactOrNotes' },
  },
});

describe('fields in types (SPEC 8)', () => {
  it('keys the members by public name', () => {
    expectTypeOf<keyof typeof Contacts.fields>().toEqualTypeOf<
      | 'name'
      | 'kind'
      | 'status'
      | 'discount'
      | 'tags'
      | 'addedAt'
      | 'organization'
    >();
    // @ts-expect-error a column name is not a public name
    expectTypeOf(Contacts.fields.created_at).toBeObject();
  });

  it("types the declaration's facts of a field", () => {
    const { name } = Contacts.fields;
    expectTypeOf(name.name).toEqualTypeOf<'name'>();
    expectTypeOf(name.column).toEqualTypeOf<'name'>();
    expectTypeOf(name.kind).toEqualTypeOf<'attribute'>();
    expectTypeOf(name.access).toEqualTypeOf<'readWrite'>();
    expectTypeOf(name.filter).toEqualTypeOf<readonly ['eq', 'containsi']>();
    expectTypeOf(name.sortable).toEqualTypeOf<true>();
    expectTypeOf(name.codec).toEqualTypeOf<null>();
    expectTypeOf(name.target).toEqualTypeOf<null>();
    expectTypeOf(Contacts.fields.addedAt.column).toEqualTypeOf<'created_at'>();
    expectTypeOf(Contacts.fields.addedAt.filter).toEqualTypeOf<readonly []>();
    expectTypeOf(Contacts.fields.addedAt.sortable).toEqualTypeOf<false>();
  });

  it('types nullability and the requirement on create as the schemas do (SPEC 6.2, 6.3)', () => {
    expectTypeOf(Contacts.fields.name.nullable).toEqualTypeOf<false>();
    expectTypeOf(Contacts.fields.name.required).toEqualTypeOf<true>();
    expectTypeOf(Contacts.fields.kind.required).toEqualTypeOf<false>();
    expectTypeOf(Contacts.fields.discount.nullable).toEqualTypeOf<true>();
    expectTypeOf(Contacts.fields.discount.required).toEqualTypeOf<false>();
    expectTypeOf(Contacts.fields.addedAt.required).toEqualTypeOf<false>();
    expectTypeOf(Meetings.fields.notes.nullable).toEqualTypeOf<false>();
    expectTypeOf(Meetings.fields.notes.required).toEqualTypeOf<true>();
    expectTypeOf(Meetings.fields.room.required).toEqualTypeOf<true>();
  });

  it('types options as the literal values, and null where any value goes', () => {
    expectTypeOf(Contacts.fields.kind.options).toEqualTypeOf<
      ReadonlyArray<'person' | 'company'>
    >();
    expectTypeOf(Contacts.fields.status.options).toEqualTypeOf<
      ReadonlyArray<'active' | 'archived'>
    >();
    expectTypeOf(Contacts.fields.name.options).toEqualTypeOf<null>();
    expectTypeOf(Contacts.fields.name.items).toEqualTypeOf<null>();
  });

  it("types an array's elements and leaves a codec's value to the codec", () => {
    expectTypeOf(Contacts.fields.tags.options).toEqualTypeOf<null>();
    expectTypeOf(Contacts.fields.tags.items).toEqualTypeOf<ItemMeta<null>>();
    expectTypeOf(Meetings.fields.attendees.items).toEqualTypeOf<
      ItemMeta<null>
    >();
    expectTypeOf(Meetings.fields.during.codec).toEqualTypeOf<'range'>();
    expectTypeOf(Meetings.fields.during.options).toEqualTypeOf<null>();
    expectTypeOf(Meetings.fields.during.items).toEqualTypeOf<null>();
  });

  it("types a relationship's target, access, requirement, and operators", () => {
    const { organization } = Contacts.fields;
    expectTypeOf(organization.kind).toEqualTypeOf<'relationship'>();
    expectTypeOf(organization.target).toEqualTypeOf<'organizations'>();
    expectTypeOf(organization.access).toEqualTypeOf<'read'>();
    expectTypeOf(organization.required).toEqualTypeOf<false>();
    expectTypeOf(organization.sortable).toEqualTypeOf<false>();
    expectTypeOf(organization.codec).toEqualTypeOf<null>();
    const { contact } = Meetings.fields;
    expectTypeOf(contact.target).toEqualTypeOf<'contacts'>();
    expectTypeOf(contact.nullable).toEqualTypeOf<true>();
    expectTypeOf(contact.filter).toEqualTypeOf<readonly ['eq', 'isNull']>();
  });

  it('gives every entry the wide FieldMeta members', () => {
    expectTypeOf(Contacts.fields.name).toExtend<FieldMeta>();
    expectTypeOf(Meetings.fields.contact).toExtend<FieldMeta>();
    expectTypeOf(Contacts.fields.name.limits.maxLength).toEqualTypeOf<
      number | null
    >();
    expectTypeOf(Contacts.fields.name.example).toBeUnknown();
  });

  it('is wide for a resource whose table TypeScript does not know', () => {
    const resource = Contacts as DeclaredResource;
    expectTypeOf(resource.fields).toEqualTypeOf<
      Readonly<Record<string, FieldMeta>>
    >();
  });
});

const declareImported = createDeclareResource({ catalog: unenforcedCatalog });

const Imported = declareImported('imported_contacts', {
  operations: ['get'],
  fields: { status: { access: 'read' }, nickname: { access: 'read' } },
});

const Moods = createDeclareResource({
  catalog: {
    format: 3,
    enums: { mood: ['calm', 'tense'] },
    domains: {
      label: {
        schema: 'public',
        name: 'label',
        type: 'text',
        typeKind: 'base',
        array: false,
        sqlType: 'text',
        maxLength: null,
        precision: null,
        scale: null,
        nullable: true,
        default: null,
        constraints: {
          label_check: {
            kind: 'check',
            rule: { kind: 'enum', values: ['a', 'b'] },
          },
        },
      },
    },
    tables: {
      moods: {
        schema: 'public',
        name: 'moods',
        primaryKey: ['id'],
        columns: {
          id: {
            type: 'uuid',
            typeKind: 'base',
            array: false,
            sqlType: 'uuid',
            maxLength: null,
            precision: null,
            scale: null,
            nullable: false,
            default: null,
            identity: null,
            generated: null,
          },
          moods: {
            type: 'mood',
            typeKind: 'enum',
            array: true,
            sqlType: 'mood[]',
            maxLength: null,
            precision: null,
            scale: null,
            nullable: true,
            default: null,
            identity: null,
            generated: null,
          },
          labels: {
            type: 'label',
            typeKind: 'domain',
            array: true,
            sqlType: 'label[]',
            maxLength: null,
            precision: null,
            scale: null,
            nullable: true,
            default: null,
            identity: null,
            generated: null,
          },
        },
        constraints: { moods_pkey: { kind: 'primaryKey', columns: ['id'] } },
      },
    },
  },
})('moods', {
  operations: ['get'],
  fields: { moods: { access: 'read' }, labels: { access: 'read' } },
});

describe('options from enums, domains, and enforced CHECKs only', () => {
  it("types an enum array's and a domain array's elements", () => {
    expectTypeOf(Moods.fields.moods.items).toEqualTypeOf<
      ItemMeta<ReadonlyArray<'calm' | 'tense'>>
    >();
    expectTypeOf(Moods.fields.labels.items).toEqualTypeOf<
      ItemMeta<ReadonlyArray<'a' | 'b'>>
    >();
  });

  it('takes no option or nullability from a NOT ENFORCED CHECK (catalog ADR 0010)', () => {
    expectTypeOf(Imported.fields.status.options).toEqualTypeOf<null>();
    expectTypeOf(Imported.fields.nickname.nullable).toEqualTypeOf<true>();
  });
});
