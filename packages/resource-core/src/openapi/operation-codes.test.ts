import type { DeclaredResource } from '../declare/declared-resource';
import type { DocumentOperation, OperationCodes } from './operation-codes';

import { describe, expect, it } from 'vitest';

import { internalsOf } from '../declare/declared-resource';
import { untypedDeclare } from '../test-support/catalog-builder';
import { Contacts, Organizations } from '../test-support/definition-resources';
import { operationCodes } from './operation-codes';

const declare = untypedDeclare();
const ALWAYS = [
  'NOT_ACCEPTABLE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL_SERVER_ERROR',
];

function codesOf(
  resource: DeclaredResource,
  operation: DocumentOperation,
  codes?: OperationCodes,
): ReadonlyArray<string> {
  const internals = internalsOf(resource);
  if (internals === undefined) {
    throw new Error('not a declared resource');
  }
  return operationCodes(internals, operation, codes);
}

/** The meetings of the unit-test catalog, whose primary key gets a code only with client ids. */
function meetings(clientIds: boolean): DeclaredResource {
  return declare('meetings', {
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
    },
    rules: {
      meetings_room_check: { validator: 'room' },
      meetings_contact_or_notes: { validator: 'contactOrNotes' },
    },
  });
}

const OPERATIONS: ReadonlyArray<DocumentOperation> = [
  { kind: 'list' },
  { kind: 'get' },
  { kind: 'create' },
  { kind: 'update' },
  { kind: 'remove' },
  { kind: 'relationship', name: 'organization' },
  { kind: 'related', name: 'organization' },
  { kind: 'relationshipUpdate', name: 'organization' },
];

describe('operationCodes', () => {
  it.each(OPERATIONS)(
    'answers negotiation and unexpected failures, each code once: %o',
    (operation) => {
      const codes = codesOf(Contacts, operation);
      expect(codes.slice(0, ALWAYS.length)).toEqual(ALWAYS);
      expect(new Set(codes).size).toBe(codes.length);
    },
  );

  it('answers the query parser on a list and a get, RANGE_PAGINATION_NOT_SUPPORTED only without range pages', () => {
    for (const kind of ['list', 'get'] as const) {
      expect(codesOf(Contacts, { kind })).toEqual(
        expect.arrayContaining([
          'INVALID_QUERY_PARAMETER',
          'UNKNOWN_QUERY_PARAMETER',
          'RANGE_PAGINATION_NOT_SUPPORTED',
        ]),
      );
    }
    const ranged = declare('organizations', {
      operations: ['list'],
      fields: { name: { access: 'read', sort: true } },
      page: { range: true },
    });
    expect(codesOf(ranged, { kind: 'list' })).not.toContain(
      'RANGE_PAGINATION_NOT_SUPPORTED',
    );
  });

  it('answers a denied list with FORBIDDEN, and a get with it only when it can include', () => {
    expect(codesOf(Organizations, { kind: 'list' })).toContain('FORBIDDEN');
    expect(codesOf(Contacts, { kind: 'get' })).toContain('FORBIDDEN');
    expect(codesOf(Organizations, { kind: 'get' })).not.toContain('FORBIDDEN');
  });

  it('refuses a client id on a create without clientIds, and answers a taken one with the primary key code otherwise', () => {
    const own = codesOf(meetings(false), { kind: 'create' });
    expect(own).toContain('CLIENT_GENERATED_ID_NOT_SUPPORTED');
    expect(own).not.toContain('MEETINGS_PKEY');
    const clients = codesOf(meetings(true), { kind: 'create' });
    expect(clients).toContain('MEETINGS_PKEY');
    expect(clients).not.toContain('CLIENT_GENERATED_ID_NOT_SUPPORTED');
    expect(codesOf(meetings(true), { kind: 'update' })).not.toContain(
      'MEETINGS_PKEY',
    );
  });

  it('answers on an update only the NOT NULL keys of members it writes, and FORBIDDEN only for a member it refuses', () => {
    const create = codesOf(Contacts, { kind: 'create' });
    const update = codesOf(Contacts, { kind: 'update' });
    expect(create).toEqual(
      expect.arrayContaining([
        'CONTACTS_KIND_NOT_NULL',
        'CONTACTS_NAME_NOT_NULL',
      ]),
    );
    expect(update).toContain('CONTACTS_NAME_NOT_NULL');
    expect(update).not.toContain('CONTACTS_KIND_NOT_NULL');
    expect(update).toContain('FORBIDDEN');
    const writable = declare('organizations', {
      operations: ['get', 'update'],
      fields: { name: { access: 'readWrite' } },
    });
    expect(codesOf(writable, { kind: 'update' })).not.toContain('FORBIDDEN');
  });

  it('answers a relationship update with the codes over that relationship alone', () => {
    const codes = codesOf(Contacts, {
      kind: 'relationshipUpdate',
      name: 'organization',
    });
    expect(codes).toEqual(
      expect.arrayContaining([
        'CONTACTS_EMAIL_UNIQUE',
        'CONTACTS_ORGANIZATION_ID_FKEY',
        'CONTACTS_ORGANIZATION_ID_NOT_NULL',
        'NOT_FOUND',
      ]),
    );
    expect(codes).not.toContain('CONTACTS_NAME_CHECK');
    expect(codes).not.toContain('FORBIDDEN');
  });

  it('answers a remove, a relationship, and a related resource with what reading the row can raise', () => {
    expect(codesOf(Contacts, { kind: 'remove' }).slice(ALWAYS.length)).toEqual([
      'NOT_FOUND',
      'CONFLICT',
    ]);
    for (const kind of ['relationship', 'related'] as const) {
      expect(
        codesOf(Contacts, { kind, name: 'organization' }).slice(ALWAYS.length),
      ).toEqual(['NOT_FOUND']);
    }
  });

  it("adds the application's codes by the operation whose rules run, and its codes for every operation", () => {
    const codes: OperationCodes = {
      all: ['UNAUTHORIZED', 'NOT_FOUND'],
      resources: {
        contacts: { get: ['CONTACT_HIDDEN'], update: ['CONTACT_ARCHIVED'] },
      },
    };
    const of = (resource: DeclaredResource, operation: DocumentOperation) =>
      codesOf(resource, operation, codes);
    const organization = { name: 'organization' } as const;
    for (const operation of [
      { kind: 'get' },
      { kind: 'relationship', ...organization },
      { kind: 'related', ...organization },
    ] as const) {
      expect(of(Contacts, operation)).toContain('CONTACT_HIDDEN');
      expect(of(Contacts, operation)).not.toContain('CONTACT_ARCHIVED');
    }
    for (const operation of [
      { kind: 'update' },
      { kind: 'relationshipUpdate', ...organization },
    ] as const) {
      expect(of(Contacts, operation)).toContain('CONTACT_ARCHIVED');
      expect(of(Contacts, operation)).not.toContain('CONTACT_HIDDEN');
    }
    expect(of(Organizations, { kind: 'get' })).not.toContain('CONTACT_HIDDEN');
    for (const operation of OPERATIONS) {
      const all = of(Contacts, operation);
      expect(all).toContain('UNAUTHORIZED');
      expect(
        all.filter((code) => code === 'NOT_FOUND').length,
      ).toBeLessThanOrEqual(1);
    }
  });
});
