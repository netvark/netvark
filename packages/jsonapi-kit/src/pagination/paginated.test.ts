import { describe, expect, it } from 'vitest';

import { parseQuery } from '../query/parse-query';
import { defineResource } from '../resource/define-resource';
import { paginatedDocument } from './paginated';

interface Row {
  readonly id: string;
  readonly name: string;
}

const People = defineResource({
  type: 'people',
  attributes: ['name'],
  serialize: (row: Row) => ({
    id: row.id,
    attributes: { name: row.name },
    meta: { page: { weight: 1 }, flag: true },
  }),
  query: { page: { max: 10 } },
});

const rows: Array<Row> = [
  { id: '7', name: 'a' },
  { id: '8', name: 'b' },
];

describe('paginatedDocument', () => {
  it('adds the profile, links, meta.page, and item cursors', () => {
    const url = 'https://x.test/people?page[size]=2&page[after]=abcde';
    const document = paginatedDocument(
      People,
      {
        rows,
        next: 'zzz',
        prev: 'yyy',
        total: 5,
        cursor: (row) => `c${row.id}`,
      },
      {
        url,
        query: parseQuery(People, 'page[size]=2&page[after]=abcde'),
        meta: { note: 'n' },
      },
    );
    expect(document.jsonapi).toEqual({
      version: '1.1',
      profile: ['http://jsonapi.org/profiles/ethanresnick/cursor-pagination/'],
    });
    expect(document.links).toEqual({
      self: 'https://x.test/people?page%5Bsize%5D=2&page%5Bafter%5D=abcde',
      first: 'https://x.test/people?page%5Bsize%5D=2',
      prev: 'https://x.test/people?page%5Bsize%5D=2&page%5Bbefore%5D=yyy',
      next: 'https://x.test/people?page%5Bsize%5D=2&page%5Bafter%5D=zzz',
    });
    expect(document.meta).toEqual({ note: 'n', page: { total: 5 } });
    expect(document.data[0]).toEqual({
      type: 'people',
      id: '7',
      attributes: { name: 'a' },
      meta: { page: { weight: 1, cursor: 'c7' }, flag: true },
    });
  });

  it('keeps other profiles and does not duplicate the cursor profile', () => {
    const document = paginatedDocument(
      People,
      { rows: [], next: null, prev: null },
      {
        url: 'https://x.test/people',
        jsonapi: {
          profile: [
            'https://p.test/one',
            'http://jsonapi.org/profiles/ethanresnick/cursor-pagination/',
          ],
        },
      },
    );
    expect(document.jsonapi?.profile).toEqual([
      'https://p.test/one',
      'http://jsonapi.org/profiles/ethanresnick/cursor-pagination/',
    ]);
    expect(document.data).toEqual([]);
    expect(document.links).toMatchObject({ prev: null, next: null });
    expect(document.meta).toEqual({ page: {} });
  });
});
