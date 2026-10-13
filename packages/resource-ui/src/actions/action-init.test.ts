/**
 * Reading the actions the application describes (resource SPEC 21.2, 21.3,
 * 21.4): each action as given, its write and the texts held as given, and
 * the `TypeError`s of arguments a JavaScript caller got wrong;
 * `action-init-refusals.test.ts` holds those of an action.
 */
import { describe, expect, it } from 'vitest';

import { message, text } from '../test-support/messages';
import { Contacts } from '../test-support/resources';
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
const archived = text('Archiviert.', 'Archived.');
const removeTitle = text('Entfernen?', 'Remove?');
const removeBody = text('Endgültig?', 'For good?');
const removeButton = text('Endgültig entfernen', 'Remove for good');
const ARCHIVED = { attributes: { status: 'archived' } };

/** Expects both functions to refuse `options` on `resource`, each message naming its function first. */
function refusedByBoth(resource: unknown, options: object, refusal: string) {
  expect(() => untypedRecord(resource, options)).toThrow(
    new TypeError(`recordActions: ${refusal}`),
  );
  expect(() => untypedBulk(resource, { tooMany, ...options })).toThrow(
    new TypeError(`bulkActions: ${refusal}`),
  );
}

describe('the actions as given (resource SPEC 21.2, 21.3)', () => {
  it('holds each action by name in the order given, with its write, its tone, and the functions as given', () => {
    const rows = recordActions(Contacts, {
      actions: {
        remove: {
          label: remove,
          tone: 'danger',
          remove: true,
          confirm: {
            title: removeTitle,
            body: removeBody,
            confirm: removeButton,
          },
        },
        archive: { label: archive, update: ARCHIVED, done: archived },
      },
    });

    expect(Object.keys(rows)).toEqual(['remove', 'archive']);
    expect(rows.remove).toMatchObject({
      name: 'remove',
      call: 'remove',
      tone: 'danger',
      done: null,
    });
    expect(rows.remove.label).toBe(remove);
    expect(rows.remove.confirm).toStrictEqual({
      title: removeTitle,
      body: removeBody,
      confirm: removeButton,
    });
    expect(rows.archive).toMatchObject({
      name: 'archive',
      call: 'update',
      tone: 'neutral',
      confirm: null,
    });
    expect(rows.archive.done).toBe(archived);
  });

  it('holds a confirmation without a body or a button label with null for each, the screen falling back to the label', () => {
    const title = message<{ count: number }>(
      ({ count }) => `${count} entfernen?`,
      ({ count }) => `Remove ${count}?`,
    );
    const selection = bulkActions(Contacts, {
      tooMany,
      actions: { remove: { label: remove, remove: true, confirm: { title } } },
    });

    expect(selection.remove.confirm).toStrictEqual({
      title,
      body: null,
      confirm: null,
    });
  });

  it('freezes the model, each action, and each confirmation', () => {
    const rows = recordActions(Contacts, {
      actions: {
        remove: { label: remove, remove: true, confirm: { title: remove } },
      },
    });

    expect(Object.isFrozen(rows)).toBe(true);
    expect(Object.isFrozen(rows.remove)).toBe(true);
    expect(Object.isFrozen(rows.remove.confirm)).toBe(true);
  });

  it('takes no actions at all, which make an empty model', () => {
    expect(recordActions(Contacts, { actions: {} })).toStrictEqual({});
  });
});

describe('the TypeErrors of a JavaScript caller (resource SPEC 21.4)', () => {
  it.each([
    ['an object no declareResource returned', {}],
    ['undefined', undefined],
    ['its fields alone', { fields: Contacts.fields }],
  ])('refuses %s as the resource, in both functions', (_, resource) => {
    refusedByBoth(
      resource,
      { actions: {} },
      'resource must be what a declareResource returned',
    );
  });

  it.each([undefined, null, 'actions', [{}]])(
    'refuses %j as the options',
    (options) => {
      expect(() => untypedRecord(Contacts, options)).toThrow(
        new TypeError('recordActions: options must be an object'),
      );
      expect(() => untypedBulk(Contacts, options)).toThrow(
        new TypeError('bulkActions: options must be an object'),
      );
    },
  );

  it("refuses a key that is no option of the function's, naming the key", () => {
    expect(() => untypedRecord(Contacts, { actions: {}, tooMany })).toThrow(
      new TypeError('recordActions: options.tooMany is not an option'),
    );
    expect(() =>
      untypedBulk(Contacts, { actions: {}, tooMany, hidden: () => false }),
    ).toThrow(new TypeError('bulkActions: options.hidden is not an option'));
  });

  it.each([undefined, [], 'archive'])(
    'refuses %j as the actions',
    (actions) => {
      expect(() => untypedRecord(Contacts, { actions })).toThrow(
        new TypeError(
          'recordActions: options.actions must be an object of actions',
        ),
      );
    },
  );

  it('refuses a can that is not a function, and a selection without its tooMany', () => {
    expect(() => untypedRecord(Contacts, { actions: {}, can: true })).toThrow(
      new TypeError('recordActions: options.can must be a function'),
    );
    expect(() => untypedBulk(Contacts, { actions: {} })).toThrow(
      new TypeError('bulkActions: options.tooMany must be a function'),
    );
    expect(() =>
      untypedBulk(Contacts, { actions: {}, tooMany: 'Too many.' }),
    ).toThrow(new TypeError('bulkActions: options.tooMany must be a function'));
  });
});
