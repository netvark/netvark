/**
 * `sorting` and `withSorting` (resource SPEC 20.7): a state's `sort` as
 * TanStack Table's sorting and back, the declaration's default sort for a
 * state without one, Table's updaters, the cursors a sort change drops,
 * and the `TypeError` of each mistake, none quoting the name or value.
 */
import { describe, expect, it } from 'vitest';

import { messages } from '../test-support/messages';
import { Contacts, Organizations, Plans } from '../test-support/resources';
import { resourceList } from './resource-list';

const contacts = resourceList(Contacts, messages);

/** A header toggle as Table v9 hands it: a function of the sorting it shows, the column's direction flipped. */
function toggled(id: string) {
  return (current: ReadonlyArray<{ id: string; desc: boolean }>) =>
    current.map((entry) =>
      entry.id === id ? { ...entry, desc: !entry.desc } : entry,
    );
}

describe('sorting: a state as Table v9 sorting state (resource SPEC 20.7)', () => {
  it('reads each sort name as { id, desc }, in order, desc for a - name', () => {
    expect(contacts.sorting({ sort: ['-priority', 'name'] })).toEqual([
      { id: 'priority', desc: true },
      { id: 'name', desc: false },
    ]);
  });

  it("shows the declaration's default sort, by public name, for a state without sort", () => {
    const fallback = [
      { id: 'name', desc: false },
      { id: 'createdAt', desc: true },
    ];
    expect(contacts.sorting({})).toEqual(fallback);
    expect(contacts.sorting({ sort: [] })).toEqual(fallback);
    expect(resourceList(Organizations, messages).sorting({})).toEqual([
      { id: 'createdAt', desc: true },
    ]);
    expect(resourceList(Plans, messages).sorting({})).toEqual([]);
  });
});

describe('withSorting: Table v9 sorting written back as sort (resource SPEC 20.7)', () => {
  it('writes the entries in order, - for desc, and drops the cursors but keeps the page size', () => {
    const state = {
      sort: ['name'],
      page: { size: 5, after: 'c1' },
      search: 'ada',
      include: ['organization'],
    };
    expect(
      contacts.withSorting(state, [
        { id: 'priority', desc: true },
        { id: 'name', desc: false },
      ]),
    ).toStrictEqual({
      sort: ['-priority', 'name'],
      page: { size: 5 },
      search: 'ada',
      include: ['organization'],
    });
  });

  it('removes sort and an emptied page for an empty sorting, so the default applies again', () => {
    expect(
      contacts.withSorting({ sort: ['-name'], page: { before: 'c1' } }, []),
    ).toStrictEqual({});
  });

  it("applies Table's updater to the sorting the table shows, the default sort among them", () => {
    expect(contacts.withSorting({}, toggled('name'))).toStrictEqual({
      sort: ['-name', '-createdAt'],
    });
    expect(contacts.withSorting({ sort: ['-name'] }, () => [])).toStrictEqual(
      {},
    );
  });

  it('never changes the state it is given', () => {
    const state = Object.freeze({
      sort: Object.freeze(['name']),
      page: Object.freeze({ size: 5, after: 'c1' }),
    });
    contacts.withSorting(state, toggled('name'));
    expect(state).toEqual({ sort: ['name'], page: { size: 5, after: 'c1' } });
  });

  it.each([
    [
      'a sorting that is not a list',
      'name',
      'sorting must be a list of { id, desc }',
    ],
    [
      'an entry without desc',
      [{ id: 'name' }],
      'sorting must be a list of { id, desc }',
    ],
    [
      'a sort name for an entry',
      ['name'],
      'sorting must be a list of { id, desc }',
    ],
    [
      'an updater that returns no list',
      () => null,
      'sorting must be a list of { id, desc }',
    ],
    [
      'a member that does not sort',
      [{ id: 'nickname', desc: false }],
      'a sort of contacts names a member that does not sort',
    ],
    [
      'a public name nothing has',
      [{ id: 'constructor', desc: false }],
      'a sort of contacts names a member that does not sort',
    ],
    [
      'one member twice',
      [
        { id: 'name', desc: false },
        { id: 'name', desc: true },
      ],
      'a sort of contacts names one member twice',
    ],
  ])('throws TypeError for %s', (_case, sorting, message) => {
    expect(() =>
      Reflect.apply(contacts.withSorting, undefined, [{}, sorting]),
    ).toThrow(new TypeError(`resourceList.withSorting: ${message}`));
  });
});
