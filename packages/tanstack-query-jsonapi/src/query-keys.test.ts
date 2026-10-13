import type { QueryKey } from '@tanstack/query-core';

import { hashKey } from '@tanstack/query-core';
import { describe, expect, it } from 'vitest';

import { resourceQueries } from './queries';
import { blogApi } from './test-support/fetch-double';

const { clients, queryClient } = blogApi(() => ({ status: 500 }));
const articles = resourceQueries(clients.articles);

describe('the keys of resourceQueries (SPEC 16.2)', () => {
  it('keys a read by the type, the call, and the query string it sends', () => {
    expect(articles.all).toEqual(['articles']);
    expect(articles.list().queryKey).toEqual(['articles', 'list', '']);
    expect(
      articles.list({ sort: ['-views'], page: { size: 2 } }).queryKey,
    ).toEqual(['articles', 'list', 'sort=-views&page%5Bsize%5D=2']);
    expect(articles.pages({ page: { size: 2 } }).queryKey).toEqual([
      'articles',
      'pages',
      'page%5Bsize%5D=2',
    ]);
    expect(articles.get('7', { include: ['author'] }).queryKey).toEqual([
      'articles',
      'get',
      '7',
      'include=author',
    ]);
    expect(articles.get('7').queryKey).toEqual(['articles', 'get', '7', '']);
  });

  it('writes the parameters in their one order, whatever order the query wrote its members in', () => {
    const written = articles.list({
      search: 'keys',
      filter: { title: 'Keys' },
      sort: ['title'],
      fields: { articles: ['title', 'body'] },
      include: ['author'],
    });
    const reordered = articles.list({
      include: ['author'],
      fields: { articles: ['title', 'body'] },
      sort: ['title'],
      filter: { title: 'Keys' },
      search: 'keys',
    });
    expect(written.queryKey).toEqual(reordered.queryKey);
    expect(written.queryKey[2]).toBe(
      'include=author&fields%5Barticles%5D=title%2Cbody&sort=title&filter%5Btitle%5D=Keys&filter%5Bq%5D=keys',
    );
  });

  it('keys two queries that make one request alike, and two requests apart', () => {
    const tens = [10n, 10, '10'].map(
      (gte) => articles.list({ filter: { views: { gte } } }).queryKey,
    );
    expect(tens[0]).toEqual([
      'articles',
      'list',
      'filter%5Bviews%5D%5Bgte%5D=10',
    ]);
    expect(tens[1]).toEqual(tens[0]);
    expect(tens[2]).toEqual(tens[0]);
    expect(articles.list({ sort: ['title'] }).queryKey).not.toEqual(
      articles.list({ sort: ['-title'] }).queryKey,
    );
    expect(articles.list().queryKey).not.toEqual(articles.pages().queryKey);
  });

  it('keys a filter whose fields come in another order as another request', () => {
    const one = articles.list({ filter: { title: 'Keys', views: { gte: 2 } } });
    const other = articles.list({
      filter: { views: { gte: 2 }, title: 'Keys' },
    });
    expect(one.queryKey).not.toEqual(other.queryKey);
  });

  it('keys a bigint as its text, so every key is JSON as TanStack Query hashes it', () => {
    const key = articles.list({
      filter: { views: { gte: 2n ** 70n } },
    }).queryKey;
    expect(hashKey(key)).toBe(
      JSON.stringify([
        'articles',
        'list',
        'filter%5Bviews%5D%5Bgte%5D=1180591620717411303424',
      ]),
    );
  });

  it('keys a record by the include and fields a get sends, nothing else of the query', () => {
    const query = { include: ['author'], sort: ['title'] } as const;
    expect(articles.get('7', query).queryKey).toEqual(
      articles.get('7', { include: ['author'] }).queryKey,
    );
  });

  it('keys each write by the type and the call', () => {
    expect(articles.create().mutationKey).toEqual(['articles', 'create']);
    expect(articles.update().mutationKey).toEqual(['articles', 'update']);
    expect(articles.remove().mutationKey).toEqual(['articles', 'remove']);
  });

  it('reaches every list, page, and record of the type from [type], and every list from [type, list]', async () => {
    // Keys typed wide: what each entry holds is not what this test is about.
    const entries: ReadonlyArray<QueryKey> = [
      articles.list({ sort: ['title'] }).queryKey,
      articles.pages().queryKey,
      articles.get('7').queryKey,
      resourceQueries(clients.people).list().queryKey,
    ];
    for (const key of entries) {
      queryClient.setQueryData(key, { data: [] });
    }
    const invalidated = () =>
      entries.map((key) => queryClient.getQueryState(key)?.isInvalidated);
    await queryClient.invalidateQueries({ queryKey: ['articles', 'list'] });
    expect(invalidated()).toEqual([true, false, false, false]);
    await queryClient.invalidateQueries({ queryKey: articles.all });
    expect(invalidated()).toEqual([true, true, true, false]);
  });
});
