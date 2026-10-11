/**
 * The fixtures `oracleCases` cannot write (SPEC 7.3): a validator's value
 * with no text form, one JSON writes as another, and one that is not the
 * object of members' values a CHECK over several needs, each reported for
 * its own reason and never sent as another value.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineValidator } from '../../codecs/define-validator';
import { untypedDeclare } from '../../test-support/catalog-builder';
import { contactsCatalog } from '../../test-support/contacts';
import { TEST_REGISTRIES } from '../../test-support/definer';
import { oracleCases } from './oracle-cases';
import { unwritableReason } from './unwritable';

const REJECTED = Symbol('rejected');

/** A validator that accepts anything but `REJECTED`, its fixtures `accept` and `REJECTED`. */
function standIn(accept: readonly [unknown, ...Array<unknown>]) {
  return defineValidator({
    schema: z.unknown().refine((value) => value !== REJECTED),
    fixtures: { accept, reject: [REJECTED] },
  });
}

function casesWith(validators: object) {
  const declare = untypedDeclare(contactsCatalog, {
    ...TEST_REGISTRIES,
    validators: { ...TEST_REGISTRIES.validators, ...validators },
  });
  const organizations = declare('organizations', {
    operations: ['get'],
    fields: { name: { access: 'read' } },
  });
  const contacts = declare('contacts', {
    operations: ['get'],
    scope: 'organization',
    fields: { name: { access: 'read' } },
    relationships: {
      organization_id: { target: () => organizations, access: 'read' },
    },
  });
  const meetings = declare('meetings', {
    operations: ['get', 'create'],
    scope: 'organization',
    fields: { room: { access: 'readWrite' }, notes: { access: 'readWrite' } },
    relationships: {
      contact_id: { target: () => contacts, access: 'readWrite' },
    },
    rules: {
      meetings_room_check: { validator: 'room' },
      meetings_contact_or_notes: { validator: 'contactOrNotes' },
    },
  });
  return oracleCases([organizations, contacts, meetings]);
}

function fixturesOf(subject: string, validators: object) {
  const found = casesWith(validators).find((each) => each.subject === subject);
  if (found === undefined) {
    throw new Error(`no case ${subject}`);
  }
  return found.fixtures;
}

describe('fixtures oracleCases cannot write', () => {
  it('reports a value with no text form instead of sending another', () => {
    const fixtures = fixturesOf(
      'meetings CHECK meetings_room_check (validator room)',
      { room: standIn(['a-12', undefined, Number.NaN]) },
    );
    expect(fixtures).toEqual([
      expect.objectContaining({ label: 'accept[0]', texts: ['a-12'] }),
      {
        label: 'accept[1]',
        value: undefined,
        unwritable: 'it has no text form',
      },
      expect.objectContaining({ label: 'accept[2]', texts: ['NaN'] }),
      {
        label: 'reject[0]',
        value: REJECTED,
        unwritable: 'it has no text form',
      },
    ]);
  });

  it("reports a value that is not an object of a CHECK's members, and writes a missing member as NULL", () => {
    const fixtures = fixturesOf(
      'meetings CHECK meetings_contact_or_notes (validator contactOrNotes)',
      { contactOrNotes: standIn([{ notes: 'Lobby' }, 'Lobby']) },
    );
    expect(fixtures).toEqual([
      expect.objectContaining({ label: 'accept[0]', texts: [null, 'Lobby'] }),
      {
        label: 'accept[1]',
        value: 'Lobby',
        unwritable: 'it is not an object of contact, notes',
      },
      {
        label: 'reject[0]',
        value: REJECTED,
        unwritable: 'it is not an object of contact, notes',
      },
    ]);
  });

  it("reports a member's value with no text form inside a CHECK's object", () => {
    const fixtures = fixturesOf(
      'meetings CHECK meetings_contact_or_notes (validator contactOrNotes)',
      { contactOrNotes: standIn([{ notes: () => 'Lobby' }]) },
    );
    expect(fixtures[0]).toMatchObject({ unwritable: 'it has no text form' });
  });
});

describe('unwritableReason', () => {
  it('gives what a storage codec throws after naming the storage codec, a thrown value as text', () => {
    expect(unwritableReason(new RangeError('no range'))).toBe(
      'the storage codec cannot write it: no range',
    );
    expect(unwritableReason('no range')).toBe(
      'the storage codec cannot write it: no range',
    );
  });
});
