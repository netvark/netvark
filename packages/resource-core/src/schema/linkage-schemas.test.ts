import { describe, expect, it } from 'vitest';

import { untypedDeclare } from '../test-support/catalog-builder';
import { typeErrorOf } from '../test-support/failure';
import { issuesOf, outputOf } from '../test-support/validation';

const declare = untypedDeclare();

const CONTACT_ID = '7c1b0c6e-2a4b-4d0b-9f3a-1e2d3c4b5a69';

const Organizations = declare('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

const Contacts = declare('contacts', {
  operations: ['get'],
  scope: 'organization',
  fields: { name: { access: 'read' } },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
  },
});

const Meetings = declare('meetings', {
  operations: ['get', 'create', 'update'],
  scope: 'organization',
  fields: { room: { access: 'readWrite' }, number: { access: 'immutable' } },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
    contact_id: { target: () => Contacts, access: 'readWrite' },
    follow_up_of_id: { target: () => Meetings, access: 'immutable' },
  },
  rules: {
    meetings_room_check: { validator: 'room' },
    meetings_contact_or_notes: { validator: 'contactOrNotes' },
  },
});

const LINKAGE = {
  organization: { type: 'organizations', id: '1' },
  contact: { type: 'contacts', id: CONTACT_ID },
  followUpOf: null,
};

function write(relationships: object, attributes: object) {
  return { attributes, relationships };
}

const ROOM = { room: 'a-1' };

describe('linkage (SPEC 6.2)', () => {
  it('holds each relationship as a resource identifier, by public name', () => {
    expect(Object.keys(Meetings.linkage.read.shape)).toEqual([
      'organization',
      'contact',
      'followUpOf',
    ]);
    expect(Meetings.linkage.read.parse(LINKAGE)).toEqual(LINKAGE);
  });

  it("strips an identifier's other members, such as meta", () => {
    expect(
      Meetings.linkage.read.parse({
        ...LINKAGE,
        contact: { type: 'contacts', id: CONTACT_ID, meta: { primary: true } },
      }),
    ).toEqual(LINKAGE);
  });

  it('takes null only for an effectively nullable foreign key', () => {
    expect(
      Meetings.linkage.read.safeParse({ ...LINKAGE, organization: null })
        .success,
    ).toBe(false);
    expect(
      Meetings.linkage.read.safeParse({ ...LINKAGE, contact: null }).success,
    ).toBe(true);
  });

  it("holds create's and update's relationships by access", () => {
    expect(Object.keys(Meetings.linkage.create.shape)).toEqual([
      'contact',
      'followUpOf',
    ]);
    expect(Object.keys(Meetings.linkage.update.shape)).toEqual(['contact']);
  });

  it('checks the target type and the id in the foreign key column form', () => {
    expect(
      issuesOf(
        Meetings.write.create,
        write(
          {
            contact: { type: 'people', id: 'not-a-uuid' },
            followUpOf: { type: 'meetings', id: '01' },
          },
          ROOM,
        ),
      ),
    ).toEqual([
      {
        code: 'enum',
        expected: '["contacts"]',
        path: ['relationships', 'contact', 'type'],
      },
      {
        code: 'format',
        expected: 'uuid',
        path: ['relationships', 'contact', 'id'],
      },
      {
        code: 'format',
        expected: 'int64',
        path: ['relationships', 'followUpOf', 'id'],
      },
    ]);
  });

  it('reports a missing id or a wrong shape at the linkage', () => {
    expect(
      issuesOf(
        Meetings.write.update,
        write({ contact: { type: 'contacts' } }, {}),
      ),
    ).toEqual([{ code: 'required', path: ['relationships', 'contact', 'id'] }]);
    expect(
      issuesOf(Meetings.write.update, write({ contact: CONTACT_ID }, {})),
    ).toEqual([
      {
        code: 'type',
        expected: 'object',
        path: ['relationships', 'contact'],
      },
    ]);
  });

  it('rejects a relationship the operation does not write', () => {
    expect(
      issuesOf(
        Meetings.write.update,
        write({ organization: LINKAGE.organization, followUpOf: null }, {}),
      ),
    ).toEqual([
      {
        code: 'additionalProperties',
        path: ['relationships', 'organization'],
      },
      {
        code: 'additionalProperties',
        path: ['relationships', 'followUpOf'],
      },
    ]);
  });
});

describe('required relationships (SPEC 6.2, 6.3)', () => {
  const Teams = declare('teams', {
    operations: ['create'],
    fields: { name: { access: 'readWrite' }, slug: { access: 'readWrite' } },
    relationships: { lead_id: { target: () => People, access: 'readWrite' } },
  });
  const People = declare('people', {
    operations: ['create'],
    fields: { name: { access: 'readWrite' } },
    relationships: { team_id: { target: () => Teams, access: 'readWrite' } },
  });

  it('requires a relationship whose column is required on insert, and refuses null for it', () => {
    expect(issuesOf(People.write.create, write({}, { name: 'Ada' }))).toEqual([
      { code: 'required', path: ['relationships', 'team'] },
    ]);
    expect(
      issuesOf(People.write.create, write({ team: null }, { name: 'Ada' })),
    ).toEqual([{ code: 'required', path: ['relationships', 'team'] }]);
    expect(
      outputOf(Teams.write.create, write({}, { name: 'Core', slug: 'core' })),
    ).toEqual(write({}, { name: 'Core', slug: 'core' }));
  });

  it('builds the linkage of declarations that reference each other', () => {
    expect(
      outputOf(
        People.write.create,
        write({ team: { type: 'teams', id: CONTACT_ID } }, { name: 'Ada' }),
      ),
    ).toEqual(
      write({ team: { type: 'teams', id: CONTACT_ID } }, { name: 'Ada' }),
    );
    expect(Teams.linkage.read.shape).toHaveProperty('lead');
  });
});

describe('targets (SPEC 3.8)', () => {
  it('refuses a target of another table on first read', () => {
    const Wrong = declare('contacts', {
      operations: ['get'],
      scope: 'organization',
      fields: { name: { access: 'read' } },
      relationships: {
        organization_id: { target: () => Meetings, access: 'read' },
      },
    });
    expect(typeErrorOf(() => Wrong.linkage)).toBe(
      'contacts.relationships.organization_id.target: the target is a resource of meetings; the foreign key references organizations',
    );
  });

  it('refuses a target that is not a declared resource', () => {
    const Lookalike = declare('contacts', {
      operations: ['get'],
      scope: 'organization',
      fields: { name: { access: 'read' } },
      relationships: {
        organization_id: {
          target: () => ({ table: 'organizations' }),
          access: 'read',
        },
      },
    });
    expect(typeErrorOf(() => Lookalike.linkage)).toBe(
      'contacts.relationships.organization_id.target: must return the declared resource of organizations',
    );
  });

  it('reads a target again after a failed read, as when its module has not loaded yet', () => {
    const loaded: { target?: unknown } = {};
    const Early = declare('contacts', {
      operations: ['get'],
      scope: 'organization',
      fields: { name: { access: 'read' } },
      relationships: {
        organization_id: {
          target: () => {
            if (loaded.target === undefined) {
              throw new ReferenceError('Organizations is not initialized');
            }
            return loaded.target;
          },
          access: 'read',
        },
      },
    });
    expect(() => Early.linkage).toThrow(ReferenceError);
    loaded.target = Organizations;
    expect(Object.keys(Early.linkage.read.shape)).toEqual(['organization']);
  });
});
