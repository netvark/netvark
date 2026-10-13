/**
 * The `TypeError`s of an action a JavaScript caller got wrong (resource SPEC
 * 21.4): its write, which the declaration must serve, and each of its
 * functions, each message naming the function, the action, and the member,
 * never a value.
 */
import { describe, expect, it } from 'vitest';

import { message, text } from '../test-support/messages';
import { Contacts, Organizations, Plans } from '../test-support/resources';
import { bulkActions } from './bulk-actions';
import { recordActions } from './record-actions';

/** A JavaScript caller's arguments, which the types would refuse. */
const untypedRecord = recordActions as (...args: Array<any>) => unknown;
const untypedBulk = bulkActions as (...args: Array<any>) => unknown;

const archive = text('Archivieren', 'Archive');
const remove = text('Entfernen', 'Remove');
const tooMany = message<{ max: number }>(
  ({ max }) => `Höchstens ${max} auf einmal.`,
  ({ max }) => `At most ${max} at once.`,
);
const ARCHIVED = { attributes: { status: 'archived' } };

describe('the TypeErrors of an action (resource SPEC 21.4)', () => {
  it.each([
    ['an action that is no object', 'archive', ' must be an object'],
    [
      'both writes',
      { label: archive, remove: true, update: ARCHIVED },
      ' gives both remove and update',
    ],
    ['neither write', { label: archive }, ' gives neither remove nor update'],
    [
      'a remove that is not true',
      { label: archive, remove: 'yes' },
      '.remove must be true',
    ],
    ['no label', { update: ARCHIVED }, '.label must be a function'],
    [
      'a label that is a text',
      { label: 'Archive', update: ARCHIVED },
      '.label must be a function',
    ],
    [
      'a tone that is neither tone',
      { label: archive, update: ARCHIVED, tone: 'warning' },
      '.tone must be neutral or danger',
    ],
    [
      'a confirmation that is no object',
      { label: archive, update: ARCHIVED, confirm: 'Sure?' },
      '.confirm must be an object',
    ],
    [
      'a confirmation without a title',
      { label: archive, update: ARCHIVED, confirm: {} },
      '.confirm.title must be a function',
    ],
    [
      'a confirmation body that is a text',
      {
        label: archive,
        update: ARCHIVED,
        confirm: { title: archive, body: 'Sure?' },
      },
      '.confirm.body must be a function',
    ],
    [
      'a button label that is a text',
      {
        label: archive,
        update: ARCHIVED,
        confirm: { title: archive, confirm: 'OK' },
      },
      '.confirm.confirm must be a function',
    ],
    [
      'a member of no confirmation',
      {
        label: archive,
        update: ARCHIVED,
        confirm: { title: archive, cancel: archive },
      },
      '.confirm.cancel is not a member of a confirmation',
    ],
    [
      'a done that is a text',
      { label: archive, update: ARCHIVED, done: 'Archived.' },
      '.done must be a function',
    ],
    [
      'a disabled that is a boolean',
      { label: archive, update: ARCHIVED, disabled: true },
      '.disabled must be a function',
    ],
  ])(
    'refuses %s in both functions, naming the action and the member',
    (_, action, refusal) => {
      const actions = { archive: action };
      expect(() => untypedRecord(Contacts, { actions })).toThrow(
        new TypeError(`recordActions: options.actions.archive${refusal}`),
      );
      expect(() => untypedBulk(Contacts, { actions, tooMany })).toThrow(
        new TypeError(`bulkActions: options.actions.archive${refusal}`),
      );
    },
  );

  it("refuses a member of no action of the function's, a bulk action's hidden among them", () => {
    expect(() =>
      untypedRecord(Contacts, {
        actions: {
          archive: { label: archive, update: ARCHIVED, color: 'red' },
        },
      }),
    ).toThrow(
      new TypeError(
        'recordActions: options.actions.archive.color is not a member of a record action',
      ),
    );
    expect(() =>
      untypedBulk(Contacts, {
        tooMany,
        actions: {
          archive: { label: archive, update: ARCHIVED, hidden: () => false },
        },
      }),
    ).toThrow(
      new TypeError(
        'bulkActions: options.actions.archive.hidden is not a member of a bulk action',
      ),
    );
    expect(() =>
      untypedRecord(Contacts, {
        actions: {
          archive: { label: archive, update: ARCHIVED, hidden: true },
        },
      }),
    ).toThrow(
      new TypeError(
        'recordActions: options.actions.archive.hidden must be a function',
      ),
    );
  });

  it('refuses a write the declaration does not serve, naming the type', () => {
    expect(() =>
      untypedRecord(Organizations, {
        actions: { remove: { label: remove, remove: true } },
      }),
    ).toThrow(
      new TypeError(
        'recordActions: options.actions.remove removes, which organizations does not serve',
      ),
    );
    expect(() =>
      untypedBulk(Plans, {
        tooMany,
        actions: {
          grow: { label: archive, update: { attributes: { seats: 9 } } },
        },
      }),
    ).toThrow(
      new TypeError(
        'bulkActions: options.actions.grow updates, which plans does not serve',
      ),
    );
  });
});
