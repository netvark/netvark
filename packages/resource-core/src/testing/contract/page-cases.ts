/**
 * The cases of obligation 5 (SPEC 12.8) about paging: `next` and `prev`
 * cursors walk the same pages forward and back, with the page flags
 * keyset-core sets, and a row's cursor resumes after it; a cursor resumes
 * after its row though the row was removed since, as no count of rows
 * does; the declared page bounds hold; and logs, which declare no sort,
 * order by their key alone, an `int8` past 2^53, across partitions.
 * @packageDocumentation
 */
import type { StorageListRequest, StoragePage } from '../../server/storage';
import type { Contract } from './context';
import type { Listing } from './list-walk';
import type { ContractCase } from './types';

import { assertEqual, assertThat, rejection } from './assert';
import {
  createListLogs,
  createListTasks,
  LIST_IDS,
  LOG_KEYS,
} from './list-data';
import {
  keysetCode,
  labels,
  listPage,
  logListing,
  present,
  taskListing,
  walk,
} from './list-walk';

/** What a page holds: its rows' titles and whether pages lie before and after it. */
interface PageShape {
  readonly titles: ReadonlyArray<string>;
  readonly hasPrev: boolean;
  readonly hasNext: boolean;
}

/** Throws unless `page` holds `shape`, with `prev` and `next` the cursors of its first and last rows when pages lie there. */
function assertPage<TTransaction>(
  listing: Listing<TTransaction>,
  page: StoragePage,
  shape: PageShape,
  what: string,
): void {
  assertEqual(labels(listing, page), shape.titles, `${what}: rows`);
  assertEqual(page.hasPrev, shape.hasPrev, `${what}: hasPrev`);
  assertEqual(page.hasNext, shape.hasNext, `${what}: hasNext`);
  assertEqual(
    page.prev,
    shape.hasPrev ? page.cursors[0] : null,
    `${what}: prev`,
  );
  assertEqual(
    page.next,
    shape.hasNext ? page.cursors.at(-1) : null,
    `${what}: next`,
  );
  assertEqual(
    page.rows.map((row) => page.cursor(row)),
    page.cursors,
    `${what}: the cursor of each row`,
  );
}

/** The cases of obligation 5 about paging. */
export function pageCases<TTransaction>(
  contract: Contract<TTransaction>,
): ReadonlyArray<ContractCase> {
  const { harness, tasks, within } = contract;
  const { adapter } = harness;
  const inOne = taskListing(contract);
  const allLogs = logListing(contract);
  return [
    {
      name: 'obligation 5: next and prev cursors walk the same pages forward and back',
      run: async () => {
        await createListTasks(contract);
        const at = async (page: StorageListRequest['page'], what: string) =>
          listPage(inOne, { page: { size: 2, ...page } }, what);
        const first = await at({}, 'the first page');
        assertPage(
          inOne,
          first,
          { titles: ['alpha', 'delta'], hasPrev: false, hasNext: true },
          'the first page',
        );
        const second = await at(
          { after: present(first.next, 'next of the first page') },
          'the second page',
        );
        assertPage(
          inOne,
          second,
          { titles: ['echo alpha', 'charlie'], hasPrev: true, hasNext: true },
          'the second page',
        );
        const last = await at(
          { after: present(second.next, 'next of the second page') },
          'the last page',
        );
        assertPage(
          inOne,
          last,
          { titles: ['bravo'], hasPrev: true, hasNext: false },
          'the last page',
        );
        const back = await at(
          { before: present(last.prev, 'prev of the last page') },
          'the page before the last',
        );
        assertPage(
          inOne,
          back,
          { titles: ['echo alpha', 'charlie'], hasPrev: true, hasNext: true },
          'the page before the last',
        );
        const start = await at(
          { before: present(back.prev, 'prev of the page before the last') },
          'the first page, walked back',
        );
        assertPage(
          inOne,
          start,
          { titles: ['alpha', 'delta'], hasPrev: false, hasNext: true },
          'the first page, walked back',
        );
        const [alpha] = first.rows;
        assertThat(alpha !== undefined, 'the first page: expected a row');
        const after = await at(
          { after: alpha === undefined ? '' : first.cursor(alpha) },
          'the page after the cursor of alpha',
        );
        assertEqual(
          labels(inOne, after),
          ['delta', 'echo alpha'],
          'the page after the cursor of alpha',
        );
      },
    },
    {
      name: 'obligation 5: a cursor resumes after its row, though the row was removed since',
      run: async () => {
        await createListTasks(contract);
        const first = await listPage(
          inOne,
          { page: { size: 2 } },
          'the first page',
        );
        assertEqual(labels(inOne, first), ['alpha', 'delta'], 'the first page');
        await within('1', async (tx) =>
          adapter.remove(tx, tasks, LIST_IDS.delta),
        );
        const what = 'the page after delta, removed since';
        const next = await listPage(
          inOne,
          {
            page: {
              size: 2,
              after: present(first.next, 'next of the first page'),
            },
          },
          what,
        );
        assertEqual(labels(inOne, next), ['echo alpha', 'charlie'], what);
        const before = 'the page before echo alpha, delta removed';
        const back = await listPage(
          inOne,
          { page: { size: 2, before: present(next.prev, `prev of ${what}`) } },
          before,
        );
        assertPage(
          inOne,
          back,
          { titles: ['alpha'], hasPrev: false, hasNext: true },
          before,
        );
      },
    },
    {
      name: 'obligation 5: keeps to the declared page bounds',
      run: async () => {
        await createListTasks(contract);
        const fallback = await listPage(inOne, {}, 'a page of no size');
        assertEqual(
          labels(inOne, fallback),
          ['alpha', 'delta'],
          'a page of no size: the declared default, 2 rows',
        );
        assertEqual(fallback.size, 2, 'the size of a page of no size');
        const full = await listPage(
          inOne,
          { page: { size: 3 } },
          'a page of the declared max size, 3',
        );
        assertEqual(
          labels(inOne, full),
          ['alpha', 'delta', 'echo alpha'],
          'a page of the declared max size, 3',
        );
        const error = await rejection(
          within('1', async (tx) =>
            adapter.list(tx, tasks, { page: { size: 4 } }),
          ),
          'a page of size 4, past the declared max',
        );
        assertEqual(
          keysetCode(error),
          'PAGE_SIZE_EXCEEDED',
          'the code of the rejection of a page past the declared max',
        );
      },
    },
    {
      name: 'obligation 5: orders by the key alone, an int8 past 2^53 across partitions',
      run: async () => {
        await createListLogs(contract);
        assertEqual(
          await walk(allLogs, {}, 'logs'),
          LOG_KEYS,
          'logs in the order of the key',
        );
        const what = 'logs sorted by -id';
        assertEqual(
          await walk(allLogs, { sort: ['-id'] }, what),
          LOG_KEYS.toReversed(),
          what,
        );
      },
    },
  ];
}
