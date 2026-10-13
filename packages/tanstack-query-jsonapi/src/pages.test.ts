import type { InfiniteData } from '@tanstack/query-core';

import type { Answer, Arrival } from './test-support/fetch-double';

import { InfiniteQueryObserver } from '@tanstack/query-core';
import { describe, expect, it } from 'vitest';

import { resourceQueries } from './queries';
import { article, blogApi, ok } from './test-support/fetch-double';

const TITLES = ['Arrays', 'Bytes', 'Caches', 'Deltas', 'Events', 'Forks'];
const BASE = 'https://api.example.test';

/** The link to the page at `cursor`, as the server writes it. */
function link(parameter: 'after' | 'before', cursor: string): string {
  return `/api/articles?page%5Bsize%5D=2&page%5B${parameter}%5D=${cursor}`;
}

/**
 * The articles in title order, `c1` to `c6`, `page[size]` at a time,
 * after or before a cursor. Like a server that does not look past a
 * page, each page links on from its ends whether or not more records are
 * there, and an empty page links on from the cursor it was asked for.
 */
function paging({ target }: Arrival): Answer {
  const params = new URL(target, BASE).searchParams;
  const size = Number(params.get('page[size]'));
  const after = params.get('page[after]');
  const before = params.get('page[before]');
  const cursors = TITLES.map((_title, index) => `c${index + 1}`);
  const end =
    before === null
      ? (after === null ? 0 : cursors.indexOf(after) + 1) + size
      : cursors.indexOf(before);
  const start = Math.max(0, end - size);
  const records = cursors
    .slice(start, end)
    .map((cursor, index) =>
      article(String(start + index + 1), TITLES[start + index] ?? '', cursor),
    );
  const first = records.length === 0 ? before : cursors[start];
  const last =
    records.length === 0 ? after : cursors[start + records.length - 1];
  return ok(records, {
    prev: link('before', first ?? ''),
    next: link('after', last ?? ''),
  });
}

/** The titles of each page, in the order the list holds them. */
function titles(data: InfiniteData<any> | undefined): Array<Array<string>> {
  return (data?.pages ?? []).map((page) =>
    page.data.map(({ title }: { title: string }) => title),
  );
}

describe('the pages of resourceQueries (SPEC 16.3)', () => {
  it('pages on after the last cursor until a page holds no records, though it links on', async () => {
    const { clients, arrivals, queryClient } = blogApi(paging);
    const options = resourceQueries(clients.articles).pages({
      sort: ['title'],
      page: { size: 2 },
    });
    const observer = new InfiniteQueryObserver(queryClient, options);
    await observer.refetch();
    let result = observer.getCurrentResult();
    while (result.hasNextPage) {
      result = await observer.fetchNextPage();
    }
    expect(titles(result.data)).toEqual([
      ['Arrays', 'Bytes'],
      ['Caches', 'Deltas'],
      ['Events', 'Forks'],
      [],
    ]);
    expect(arrivals.map(({ target }) => target)).toEqual([
      '/api/articles?sort=title&page[size]=2',
      '/api/articles?sort=title&page[size]=2&page[after]=c2',
      '/api/articles?sort=title&page[size]=2&page[after]=c4',
      '/api/articles?sort=title&page[size]=2&page[after]=c6',
    ]);
    expect(result.data?.pageParams).toEqual([
      {},
      { after: 'c2' },
      { after: 'c4' },
      { after: 'c6' },
    ]);
  });

  it("pages both ways from the query's own cursors, which the key holds as the list's start", async () => {
    const { clients, arrivals, queryClient } = blogApi(paging);
    const options = resourceQueries(clients.articles).pages({
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
    expect(titles(result.data)).toEqual([
      [],
      ['Arrays', 'Bytes'],
      ['Caches', 'Deltas'],
      ['Events', 'Forks'],
    ]);
    expect(arrivals.map(({ target }) => target)).toEqual([
      '/api/articles?page[size]=2&page[after]=c2',
      '/api/articles?page[size]=2&page[before]=c3',
      '/api/articles?page[size]=2&page[before]=c1',
      '/api/articles?page[size]=2&page[after]=c4',
    ]);
  });

  it.each([
    [
      'null, or without its cursor',
      { prev: null, next: '/api/articles?page%5Bsize%5D=2' },
    ],
    ['absent', undefined],
  ])('ends a direction whose link is %s', async (_name, links) => {
    const { clients, queryClient } = blogApi(() =>
      ok([article('1', 'Arrays', 'c1')], links),
    );
    const options = resourceQueries(clients.articles).pages();
    const observer = new InfiniteQueryObserver(queryClient, options);
    await observer.refetch();
    const result = observer.getCurrentResult();
    expect(titles(result.data)).toEqual([['Arrays']]);
    expect([result.hasNextPage, result.hasPreviousPage]).toEqual([
      false,
      false,
    ]);
  });
});
