/**
 * `state(target)` (resource SPEC 21.2, 21.3): `can` and only `true`,
 * `hidden`, `disabled` with and without a reason, a reason in the locale of
 * each call, and a selection one request cannot write: none, one that is no
 * list of ids or names an id twice, and one over the cap.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { message, setLocale, text } from '../test-support/messages';
import { Contacts } from '../test-support/resources';
import { bulkActions } from './bulk-actions';
import { recordActions } from './record-actions';

/** A JavaScript caller's arguments, which the types would refuse. */
const untypedRecord = recordActions as (...args: Array<any>) => any;
const untypedBulk = bulkActions as (...args: Array<any>) => any;

afterEach(() => {
  setLocale('de');
});

const label = text('Archivieren', 'Archive');
const tooMany = message<{ max: number }>(
  ({ max }) => `Höchstens ${max} auf einmal.`,
  ({ max }) => `At most ${max} at once.`,
);
const ARCHIVED = { attributes: { status: 'archived' } };
const ACTIVE = { type: 'contacts', id: 'c1', status: 'active' };
const SHOWN = { visible: true, disabled: false, reason: null };
const HIDDEN = { visible: false, disabled: true, reason: null };
const DISABLED = { visible: true, disabled: true, reason: null };

/** A record action and a bulk action of `init`, archiving. */
function archiveBy(init: object, options: object = {}) {
  const action = { label, update: ARCHIVED, ...init };
  return {
    row: untypedRecord(Contacts, { ...options, actions: { archive: action } })
      .archive,
    bar: untypedBulk(Contacts, {
      ...options,
      tooMany,
      actions: { archive: action },
    }).archive,
  };
}

describe('who may run an action: can (resource SPEC 21.2, 21.3)', () => {
  it('shows every action without can, since the server authorizes every write', () => {
    const { row, bar } = archiveBy({});

    expect(row.state(ACTIVE)).toStrictEqual(SHOWN);
    expect(bar.state(['c1'])).toStrictEqual(SHOWN);
  });

  it.each([
    [true, SHOWN],
    [false, HIDDEN],
    ['true', HIDDEN],
    [1, HIDDEN],
    [undefined, HIDDEN],
  ])('shows an action where can returns %j, and only true', (answer, state) => {
    const names: Array<unknown> = [];
    const { row, bar } = archiveBy(
      {},
      {
        can: (name: unknown) => {
          names.push(name);
          return answer;
        },
      },
    );

    expect(row.state(ACTIVE)).toStrictEqual(state);
    expect(bar.state(['c1'])).toStrictEqual(state);
    expect(names).toEqual(['archive', 'archive']);
  });

  it('hides a bulk action by can before it reads the selection', () => {
    const { bar } = archiveBy({}, { can: () => false });

    expect(bar.state([])).toStrictEqual(HIDDEN);
  });
});

describe('where a record action applies: hidden (resource SPEC 21.2)', () => {
  it('hides the action where hidden returns true, and only true, a hidden action disabled too', () => {
    const records: Array<unknown> = [];
    const hidden = (contact: { readonly status: string }) => {
      records.push(contact);
      return contact.status === 'archived' ? true : 'no';
    };
    const row = untypedRecord(Contacts, {
      actions: { archive: { label, update: ARCHIVED, hidden } },
    }).archive;
    const archived = { ...ACTIVE, status: 'archived' };

    expect(row.state(archived)).toStrictEqual(HIDDEN);
    expect(row.state(ACTIVE)).toStrictEqual(SHOWN);
    expect(records).toEqual([archived, ACTIVE]);
  });
});

describe('whether a shown action runs: disabled (resource SPEC 21.2, 21.3)', () => {
  it.each([
    [false, SHOWN],
    [undefined, SHOWN],
    ['', { ...DISABLED, reason: '' }],
    [true, DISABLED],
    ['Gesperrt.', { ...DISABLED, reason: 'Gesperrt.' }],
  ])('makes %j a state of the action', (answer, state) => {
    const targets: Array<unknown> = [];
    const { row, bar } = archiveBy({
      disabled: (target: unknown) => {
        targets.push(target);
        return answer;
      },
    });

    expect(row.state(ACTIVE)).toStrictEqual(state);
    expect(bar.state(['c1', 'c2'])).toStrictEqual(state);
    expect(targets).toEqual([ACTIVE, ['c1', 'c2']]);
  });

  it('calls the functions at every call, so a reason reads the locale of that render', () => {
    const { row } = archiveBy({
      disabled: text('Gesperrt.', 'Locked.'),
    });

    expect(row.state(ACTIVE).reason).toBe('Gesperrt.');
    setLocale('en');
    expect(row.state(ACTIVE).reason).toBe('Locked.');
  });
});

describe('a selection one request cannot write (resource SPEC 21.3)', () => {
  it.each([
    ['none', []],
    ['an id twice', ['c1', 'c2', 'c1']],
    ['a list of numbers', [1, 2]],
    ['a text', 'c1'],
    ['nothing', undefined],
  ])(
    'disables the action for %s, without a reason and without asking disabled',
    (_, ids) => {
      const { bar } = archiveBy({
        disabled: () => {
          throw new Error('disabled is not asked');
        },
      });

      expect(bar.state(ids)).toStrictEqual(DISABLED);
    },
  );

  it("disables it for more ids than one request takes, with tooMany's reason in the locale of the call", () => {
    const { bar } = archiveBy({ disabled: () => false });
    const ids = Array.from({ length: bar.max + 1 }, (_, index) => `c${index}`);

    expect(bar.max).toBe(Contacts.resource.atomic.max);
    expect(bar.state(ids)).toStrictEqual({
      ...DISABLED,
      reason: 'Höchstens 10 auf einmal.',
    });
    setLocale('en');
    expect(bar.state(ids).reason).toBe('At most 10 at once.');
    expect(bar.state(ids.slice(1))).toStrictEqual(SHOWN);
  });
});
