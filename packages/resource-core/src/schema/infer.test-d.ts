import type { ZodType } from 'zod/v4';

import type { DeclaredResource } from '../declare/declared-resource';
import type { Infer } from './infer';
import type { JsonData } from './value-types';

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

const Meetings = declareResource('meetings', {
  operations: ['get', 'create', 'update'],
  scope: 'organization',
  fields: {
    room: { access: 'readWrite' },
    during: { access: 'readWrite', codec: 'range' },
    notes: { access: 'readWrite' },
    attendees: { access: 'readWrite' },
    number: { access: 'immutable' },
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

const Changes = declareResource('audit.changes', {
  operations: ['create'],
  fields: {
    operation: { access: 'immutable' },
    payload: { access: 'immutable' },
    table_name: { access: 'immutable' },
    row_id: { access: 'immutable' },
  },
});

describe('Infer (SPEC 6.2)', () => {
  it('types the read object: every readable field, null where nullable, enums narrowed', () => {
    expectTypeOf<Infer<typeof Contacts>['read']>().toEqualTypeOf<{
      kind: 'person' | 'company';
      name: string;
      nickname: string | null;
      email: string | null;
      status: 'active' | 'archived';
      priority: number | null;
      tags: Array<string>;
      createdAt: string;
    }>();
  });

  it('types create: required members required, the others optional, never undefined', () => {
    expectTypeOf<Infer<typeof Contacts>['create']>().toEqualTypeOf<{
      name: string;
      kind?: 'person' | 'company';
      nickname?: string | null;
      email?: string | null;
      status?: 'active' | 'archived';
      priority?: number | null;
      discount?: string | null;
      tags?: Array<string>;
    }>();
  });

  it('types update: the writable members, all optional', () => {
    expectTypeOf<Infer<typeof Contacts>['update']>().toEqualTypeOf<{
      name?: string;
      nickname?: string | null;
      email?: string | null;
      status?: 'active' | 'archived';
      priority?: number | null;
      discount?: string | null;
      tags?: Array<string>;
    }>();
  });

  it("types a codec field by the codec's output, and a NOT NULL domain as required", () => {
    expectTypeOf<Infer<typeof Meetings>['create']>().toEqualTypeOf<{
      room: string;
      during: { readonly start: string; readonly end: string };
      notes: string;
      attendees?: Array<string>;
      number?: number;
    }>();
  });

  it('types json members as JSON values other than null, and audit enums', () => {
    expectTypeOf<Infer<typeof Changes>['create']>().toEqualTypeOf<{
      operation: 'insert' | 'update' | 'delete';
      tableName: string;
      rowId: string;
      payload?: JsonData;
    }>();
  });

  it("types linkage by the target's public type, null where the key is nullable", () => {
    expectTypeOf<Infer<typeof Contacts>['linkage']['read']>().toEqualTypeOf<{
      organization: { type: 'organizations'; id: string };
    }>();
    expectTypeOf<Infer<typeof Meetings>['linkage']>().toEqualTypeOf<{
      readonly read: {
        contact: { type: 'contacts'; id: string } | null;
        followUpOf: { type: 'meetings'; id: string } | null;
      };
      readonly create: {
        contact?: { type: 'contacts'; id: string } | null;
        followUpOf?: { type: 'meetings'; id: string } | null;
      };
      readonly update: {
        contact?: { type: 'contacts'; id: string } | null;
      };
    }>();
  });
});

describe('the typed members of a declared resource', () => {
  it("parses to Infer's types, and picks a sparse fieldset", () => {
    expectTypeOf(Contacts.schema.read.parse({})).toEqualTypeOf<
      Infer<typeof Contacts>['read']
    >();
    expectTypeOf(
      Contacts.schema.read.pick({ name: true, createdAt: true }).parse({}),
    ).toEqualTypeOf<{ name: string; createdAt: string }>();
    expectTypeOf(Contacts.schema.create.shape.name).toExtend<ZodType<string>>();
  });

  it('types the Standard Schema validators by input and output', () => {
    type Create = NonNullable<
      (typeof Contacts.validate.create)['~standard']['types']
    >;
    expectTypeOf<Create['output']>().toEqualTypeOf<
      Infer<typeof Contacts>['create']
    >();
    expectTypeOf<Create['input']['nickname']>().toEqualTypeOf<
      string | null | undefined
    >();
    type Write = NonNullable<
      (typeof Meetings.write.update)['~standard']['types']
    >;
    expectTypeOf<Write['output']['relationships']>().toEqualTypeOf<
      Infer<typeof Meetings>['linkage']['update']
    >();
  });

  it('stays assignable to the wide DeclaredResource', () => {
    expectTypeOf(Contacts).toExtend<DeclaredResource>();
    expectTypeOf(Meetings).toExtend<DeclaredResource>();
    const resources: ReadonlyArray<DeclaredResource> = [Contacts, Meetings];
    expectTypeOf(resources).toExtend<ReadonlyArray<DeclaredResource>>();
  });
});
