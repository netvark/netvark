import { describe, expect, it } from 'vitest';

import { untypedDeclare } from '../test-support/catalog-builder';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { issuesOf, outputOf } from '../test-support/validation';

const declare = untypedDeclare();

const Meetings = declare('meetings', {
  operations: ['get', 'create', 'update'],
  scope: 'organization',
  fields: {
    room: { access: 'readWrite' },
    during: { access: 'readWrite', codec: 'range' },
    notes: { access: 'readWrite' },
    attendees: { access: 'readWrite' },
    number: { access: 'immutable' },
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
    payload: { access: 'immutable' },
  },
});

const DURING = { start: '2026-01-05T09:00:00Z', end: '2026-01-05T10:00:00Z' };
const MEETING = { room: 'a-12', during: DURING, notes: 'Agenda' };
const CHANGE = { tableName: 'contacts', operation: 'insert', rowId: '1' };

describe('field values in the object schemas (SPEC 6.1)', () => {
  it('takes a codec member through the codec schema and reports its issues as the codec format', () => {
    expect(outputOf(Meetings.validate.create, MEETING)).toEqual(MEETING);
    expect(
      issuesOf(Meetings.validate.create, {
        ...MEETING,
        during: { start: 'soon', end: DURING.end },
      }),
    ).toEqual([
      { code: 'format', expected: 'range', path: ['during', 'start'] },
    ]);
    expect(
      issuesOf(Meetings.validate.create, { ...MEETING, during: 'all day' }),
    ).toEqual([{ code: 'format', expected: 'range', path: ['during'] }]);
  });

  it('requires a NOT NULL codec member and refuses null for it', () => {
    const { during: _during, ...withoutDuring } = MEETING;
    expect(issuesOf(Meetings.validate.create, withoutDuring)).toEqual([
      { code: 'required', path: ['during'] },
    ]);
    expect(issuesOf(Meetings.validate.update, { during: null })).toEqual([
      { code: 'required', path: ['during'] },
    ]);
  });

  it('runs a domain validator on each element of an array of the domain', () => {
    expect(
      outputOf(Meetings.validate.update, { attendees: ['ada@example.com'] }),
    ).toEqual({ attendees: ['ada@example.com'] });
    expect(
      issuesOf(Meetings.validate.update, {
        attendees: ['ada@example.com', 'grace', null],
      }),
    ).toEqual([
      { code: 'EMAIL_CHECK', path: ['attendees', 1] },
      { code: 'type', expected: 'string', path: ['attendees', 2] },
    ]);
  });

  it("runs a column CHECK's validator and a NOT NULL domain's requirement", () => {
    expect(issuesOf(Meetings.validate.update, { room: 'x-1' })).toEqual([
      { code: 'MEETINGS_ROOM_CHECK', path: ['room'] },
    ]);
    const { notes: _notes, ...withoutNotes } = MEETING;
    expect(issuesOf(Meetings.validate.create, withoutNotes)).toEqual([
      { code: 'required', path: ['notes'] },
    ]);
  });

  it('takes an identity BY DEFAULT member as optional on create', () => {
    expect(
      outputOf(Meetings.validate.create, { ...MEETING, number: 7 }),
    ).toEqual({ ...MEETING, number: 7 });
    expect(
      issuesOf(Meetings.validate.create, { ...MEETING, number: 7.5 }),
    ).toEqual([{ code: 'type', expected: 'integer', path: ['number'] }]);
  });

  it('takes any JSON value for jsonb, refusing null at the top and U+0000 anywhere', () => {
    expect(outputOf(Changes.validate.create, CHANGE)).toEqual(CHANGE);
    expect(
      outputOf(Changes.validate.create, { ...CHANGE, payload: [1, null] }),
    ).toEqual({ ...CHANGE, payload: [1, null] });
    expect(
      issuesOf(Changes.validate.create, { ...CHANGE, payload: null }),
    ).toEqual([{ code: 'required', path: ['payload'] }]);
    expect(
      issuesOf(Changes.validate.create, {
        ...CHANGE,
        payload: { note: 'a\u0000b' },
      }),
    ).toEqual([
      { code: 'format', expected: 'text', path: ['payload', 'note'] },
    ]);
  });

  it('takes an enum member as one of its labels', () => {
    expect(
      issuesOf(Changes.validate.create, { ...CHANGE, operation: 'upsert' }),
    ).toEqual([
      {
        code: 'enum',
        expected: '["insert","update","delete"]',
        path: ['operation'],
      },
    ]);
  });
});

describe('domain CHECK codes (SPEC 3.6, 6.4)', () => {
  it('carries the code the definer gives a domain CHECK, in place of the constraint name', () => {
    const declareRenamed = untypedDeclare(contactsCatalog, {
      ...TEST_REGISTRIES,
      domains: {
        email: { email_check: { validator: 'email', code: 'EMAIL_INVALID' } },
      },
    });
    const Contacts = declareRenamed('contacts', {
      operations: ['update'],
      scope: 'organization',
      fields: { email: { access: 'readWrite' } },
    });
    expect(issuesOf(Contacts.validate.update, { email: 'ada' })).toEqual([
      { code: 'EMAIL_INVALID', path: ['email'] },
    ]);
  });
});
