import type { InfiniteData } from '@tanstack/react-query';

import type { Answer, Arrival } from '../test-support/query-server';

import { InfiniteQueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { contact, ok, queryServer } from '../test-support/query-server';
import { resourceQueries } from './queries';

const NAMES = ['Ada', 'Grace', 'Hedy', 'Katherine', 'Margaret', 'Radia'];
const BASE = 'https://api.example.test';

/** The link to the page at `cursor`, as the server writes it. */
function link(parameter: 'after' | 'before', cursor: string): string {
  return `/api/contacts?page%5Bsize%5D=2&page%5B${parameter}%5D=${cursor}`;
}

/**
 * The contacts in name order, `c1` to `c6`, `page[size]` at a time,
 * after or before a cursor. Like a server that does not look past a
 * page, each page links on from its ends whether or not more records are
 * there, and an empty page links on from the cursor it was asked for.
 */
function paging({ target }: Arrival): Answer {
  const params = new URL(target, BASE).searchParams;
  const size = Number(params.get('page[size]'));
  const after = params.get('page[after]');
  const before = params.get('page[before]');
  const cursors = NAMES.map((_name, index) => `c${index + 1}`);
  const end =
    before === null
      ? (after === null ? 0 : cursors.indexOf(after) + 1) + size
      : cursors.indexOf(before);
  const start = Math.max(0, end - size);
  const records = cursors
    .slice(start, end)
    .map((cursor, index) =>
      contact(String(start + index + 1), NAMES[start + index] ?? '', cursor),
    );
  const first = records.length === 0 ? before : cursors[start];
  const last =
    records.length === 0 ? after : cursors[start + records.length - 1];
  return ok(records, {
    prev: link('before', first ?? ''),
    next: link('after', last ?? ''),
  });
}

/** The names of each page, in the order the list holds them. */
function names(data: InfiniteData<any> | undefined): Array<Array<string>> {
  return (data?.pages ?? []).map((page) =>
    page.data.map(({ name }: { name: string }) => name),
  );
}

describe('the pages of resourceQueries (resource SPEC 20.6)', () => {
  it('pages on after the last cursor until a page holds no records, though it links on', async () => {
    const { clients, arrivals, queryClient } = queryServer(paging);
    const options = resourceQueries(clients.contacts).pages({
      sort: ['name'],
      page: { size: 2 },
    });
    const observer = new InfiniteQueryObserver(queryClient, options);
    await observer.refetch();
    let result = observer.getCurrentResult();
    while (result.hasNextPage) {
      result = await observer.fetchNextPage();
    }
    expect(names(result.data)).toEqual([
      ['Ada', 'Grace'],
      ['Hedy', 'Katherine'],
      ['Margaret', 'Radia'],
      [],
    ]);
    expect(arrivals.map(({ target }) => target)).toEqual([
      '/api/contacts?sort=name&page[size]=2',
      '/api/contacts?sort=name&page[size]=2&page[after]=c2',
      '/api/contacts?sort=name&page[size]=2&page[after]=c4',
      '/api/contacts?sort=name&page[size]=2&page[after]=c6',
    ]);
    expect(result.data?.pageParams).toEqual([
      {},
      { after: 'c2' },
      { after: 'c4' },
      { after: 'c6' },
    ]);
  });

  it("pages both ways from the query's own cursors, which the key holds as the list's start", async () => {
    const { clients, arrivals, queryClient } = queryServer(paging);
    const options = resourceQueries(clients.contacts).pages({
      page: { size: 2, after: 'c2' },
    });
    expect(options.queryKey[2]).toBe('page%5Bsize%5D=2&page%5Bafter%5D=c2');
    const observer = new InfiniteQueryObserver(queryClient, options);
    await observer.refetch();
    let result = await observer.fetchPreviousPage();
    expect(result.hasPreviousPage).toBe(true);
    result = await observer.fetchPreviousPage();
    expect(result.hasPreviousPage).toBe(false);
    result = await observer.fetchNextPage();
    expect(names(result.data)).toEqual([
      [],
      ['Ada', 'Grace'],
      ['Hedy', 'Katherine'],
      ['Margaret', 'Radia'],
    ]);
    expect(arrivals.map(({ target }) => target)).toEqual([
      '/api/contacts?page[size]=2&page[after]=c2',
      '/api/contacts?page[size]=2&page[before]=c3',
      '/api/contacts?page[size]=2&page[before]=c1',
      '/api/contacts?page[size]=2&page[after]=c4',
    ]);
  });

  it.each([
    [
      'null, or without its cursor',
      { prev: null, next: '/api/contacts?page%5Bsize%5D=2' },
    ],
    ['absent', undefined],
  ])('ends a direction whose link is %s', async (_name, links) => {
    const { clients, queryClient } = queryServer(() =>
      ok([contact('1', 'Ada', 'c1')], links),
    );
    const options = resourceQueries(clients.contacts).pages();
    const observer = new InfiniteQueryObserver(queryClient, options);
    await observer.refetch();
    const result = observer.getCurrentResult();
    expect(names(result.data)).toEqual([['Ada']]);
    expect([result.hasNextPage, result.hasPreviousPage]).toEqual([
      false,
      false,
    ]);
  });
});
