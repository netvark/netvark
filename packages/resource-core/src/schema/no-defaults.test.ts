import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { untypedDeclare } from '../test-support/catalog-builder';
import { TEST_REGISTRIES } from '../test-support/definer';
import { forbiddenNodes, registrySchemas } from '../test-support/schema-walk';

const declare = untypedDeclare();
const opaque = registrySchemas(TEST_REGISTRIES);

const Contacts = declare('contacts', {
  operations: ['list', 'get', 'create', 'update'],
  scope: 'organization',
  fields: {
    kind: { access: 'immutable' },
    name: { access: 'readWrite' },
    nickname: { access: 'readWrite' },
    email: { access: 'readWrite' },
    website: { access: 'readWrite' },
    status: { access: 'readWrite' },
    priority: { access: 'readWrite' },
    discount: { access: 'write' },
    tags: { access: 'readWrite' },
    created_at: { access: 'read' },
  },
});

const Meetings = declare('meetings', {
  operations: ['get', 'create', 'update'],
  scope: 'organization',
  clientIds: true,
  fields: {
    room: { access: 'readWrite' },
    during: { access: 'readWrite', codec: 'range' },
    notes: { access: 'readWrite' },
    attendees: { access: 'readWrite' },
    duration_minutes: { access: 'read' },
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

const Changes = declare('audit.changes', {
  operations: ['get', 'create'],
  fields: {
    table_name: { access: 'immutable' },
    operation: { access: 'immutable' },
    row_id: { access: 'immutable' },
    changed_at: { access: 'read' },
    payload: { access: 'immutable' },
  },
});

describe('no composed schema puts a value in place of an omitted one (SPEC 6.2)', () => {
  for (const resource of [Contacts, Meetings, Changes]) {
    for (const name of ['read', 'create', 'update'] as const) {
      it(`${resource.table}: schema.${name} and linkage.${name}`, () => {
        expect(forbiddenNodes(resource.schema[name], opaque)).toEqual([]);
        expect(forbiddenNodes(resource.linkage[name], opaque)).toEqual([]);
      });
    }
  }
});

describe('the walk', () => {
  it('finds every forbidden node, inside arrays, wrappers, and pipes', () => {
    const schema = z.object({
      a: z.string().default('x'),
      b: z.array(z.string().prefault('y')),
      c: z.string().catch('z').nullable(),
      d: z.string().transform((value) => value.trim()),
      e: z.lazy(() => z.number().optional()),
    });
    expect(forbiddenNodes(schema, new Set())).toEqual([
      '$.a: default',
      '$.b[]: prefault',
      '$.c: catch',
      '$.d: pipe',
      '$.d<out>: transform',
    ]);
  });

  it('does not enter the schemas of codecs and validators', () => {
    const codec = z.string().transform((value) => value.trim());
    expect(forbiddenNodes(z.object({ a: codec }), new Set([codec]))).toEqual(
      [],
    );
  });

  it('fails on a node of a kind it does not know', () => {
    expect(() =>
      forbiddenNodes(z.object({ a: z.tuple([z.string()]) }), new Set()),
    ).toThrow('$.a: a tuple node the walk does not know');
  });
});
