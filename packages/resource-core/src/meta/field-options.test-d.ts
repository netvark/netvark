/**
 * Options in types (SPEC 8): the elements of an enum array and of a domain
 * array, none from a NOT ENFORCED CHECK, and `TypedFieldOptions`, which
 * messages read instead of `fields`, listing what `fields` lists.
 */
import type { DeclaredResource } from '../declare/declared-resource';
import type { TypedFieldOptions } from './field-meta-types';
import type { ItemMeta } from './types';

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
  operations: ['get', 'create'],
  scope: 'organization',
  fields: {
    name: { access: 'readWrite' },
    kind: { access: 'immutable' },
    status: { access: 'readWrite' },
    tags: { access: 'readWrite' },
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
    contact_id: { target: () => Contacts, access: 'readWrite' },
  },
  rules: {
    meetings_room_check: { validator: 'room' },
    meetings_contact_or_notes: { validator: 'contactOrNotes' },
  },
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

/** The options `fields` lists for each attribute, or for its elements. */
type MetaOptions<TFields> = {
  readonly [
    K in keyof TFields as TFields[K] extends {
      readonly kind: 'attribute';
    }
      ? K
      : never
  ]: TFields[K] extends {
    readonly options: ReadonlyArray<infer TValue extends string>;
  }
    ? TValue
    : TFields[K] extends {
          readonly items: {
            readonly options: ReadonlyArray<infer TValue extends string>;
          };
        }
      ? TValue
      : never;
};

type TwinOf<TResource> =
  TResource extends DeclaredResource<infer TContext, infer TTable, infer TDecl>
    ? TypedFieldOptions<TContext, TTable, TDecl>
    : never;

describe('TypedFieldOptions, the options of fields without the rest', () => {
  it('lists what fields lists: enums, rules, elements, codecs, NOT ENFORCED CHECKs', () => {
    expectTypeOf<TwinOf<typeof Contacts>>().toEqualTypeOf<
      MetaOptions<typeof Contacts.fields>
    >();
    expectTypeOf<TwinOf<typeof Meetings>>().toEqualTypeOf<
      MetaOptions<typeof Meetings.fields>
    >();
    expectTypeOf<TwinOf<typeof Moods>>().toEqualTypeOf<
      MetaOptions<typeof Moods.fields>
    >();
    expectTypeOf<TwinOf<typeof Imported>>().toEqualTypeOf<
      MetaOptions<typeof Imported.fields>
    >();
    expectTypeOf<TwinOf<typeof Contacts>['kind']>().toEqualTypeOf<
      'person' | 'company'
    >();
  });
});
