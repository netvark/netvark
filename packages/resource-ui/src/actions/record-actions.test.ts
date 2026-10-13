/**
 * `recordActions` (resource SPEC 21.2): the variables of the mutation each
 * action's call names (jsonapi SPEC 16.2), the record's id beside an
 * update's values or alone for a removal, and the `TypeError` of a record
 * whose `id` is not a string.
 */
import { describe, expect, it } from 'vitest';

import { text } from '../test-support/messages';
import { Contacts } from '../test-support/resources';
import { recordActions } from './record-actions';

const rows = recordActions(Contacts, {
  actions: {
    archive: {
      label: text('Archivieren', 'Archive'),
      update: {
        attributes: { status: 'archived' },
        relationships: { referredBy: null },
      },
    },
    remove: { label: text('Entfernen', 'Remove'), remove: true },
  },
});
const CONTACT = { type: 'contacts', id: 'c1', name: 'Ada', status: 'active' };

describe('the variables of a record action (resource SPEC 21.2)', () => {
  it("gives an update the record's id beside the values, a new frozen object per call", () => {
    const first = rows.archive.variables(CONTACT);
    const second = rows.archive.variables(CONTACT);

    expect(first).toStrictEqual({
      id: 'c1',
      attributes: { status: 'archived' },
      relationships: { referredBy: null },
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).not.toBe(second);
  });

  it("gives a removal the record's id", () => {
    expect(rows.remove.variables(CONTACT)).toBe('c1');
  });

  it('reads the id of a record read with includes, and nothing else of it', () => {
    const included = {
      ...CONTACT,
      organization: {
        type: 'organizations',
        id: '7',
        name: 'Analytical Engines',
      },
    };

    expect(rows.remove.variables(included)).toBe('c1');
    expect(rows.archive.variables(included)).toMatchObject({ id: 'c1' });
  });

  it.each([
    ['a record without an id', { type: 'contacts' }],
    ['a numeric id', { type: 'contacts', id: 1 }],
    ['an id alone', 'c1'],
    ['null', null],
    ['undefined', undefined],
  ])('refuses %s, naming the action', (_, record) => {
    const untyped =
      (action: { readonly variables: (record: any) => unknown }) => () =>
        action.variables(record);

    expect(untyped(rows.archive)).toThrow(
      new TypeError(
        'recordActions: archive.variables takes a record whose id is a string',
      ),
    );
    expect(untyped(rows.remove)).toThrow(
      new TypeError(
        'recordActions: remove.variables takes a record whose id is a string',
      ),
    );
  });
});
