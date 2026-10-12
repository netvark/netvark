import { describe, expect, it } from 'vitest';

import { Articles, People, Tags } from '../test-support/blog';
import { serializeQuery } from './serialize-query';

/** The pairs of a serialized query, in order. */
function pairs(params: URLSearchParams): Array<[string, string]> {
  return [...params.entries()];
}

describe('serializeQuery (SPEC 15.5)', () => {
  it('joins include paths with commas, and an empty list is include=', () => {
    expect(
      pairs(
        serializeQuery(Articles, { include: ['author', 'author.articles'] }),
      ),
    ).toEqual([['include', 'author,author.articles']]);
    expect(serializeQuery(Articles, { include: [] }).toString()).toBe(
      'include=',
    );
  });

  it('writes fields[type] per type in key order, and an empty list is the empty fieldset', () => {
    expect(
      pairs(
        serializeQuery(Articles, {
          fields: { articles: ['title', 'author'], people: [] },
        }),
      ),
    ).toEqual([
      ['fields[articles]', 'title,author'],
      ['fields[people]', ''],
    ]);
  });

  it('keeps the sort in the order given, a - prefix for descending', () => {
    expect(
      pairs(serializeQuery(Articles, { sort: ['-createdAt', 'title'] })),
    ).toEqual([['sort', '-createdAt,title']]);
  });

  it('writes the page members the query holds, size first', () => {
    expect(
      pairs(
        serializeQuery(Articles, {
          page: { before: 'b', size: 3, after: 'a' },
        }),
      ),
    ).toEqual([
      ['page[size]', '3'],
      ['page[after]', 'a'],
      ['page[before]', 'b'],
    ]);
    expect(pairs(serializeQuery(Articles, { page: {} }))).toEqual([]);
  });

  it('writes a bare filter value as eq, values by operator, and a list as the parameter repeated', () => {
    expect(
      pairs(
        serializeQuery(Articles, {
          filter: {
            title: 'a,b',
            createdAt: { gte: '2026-01-01', lt: '2027-01-01' },
            author: { in: ['1', '2'], isNull: false },
          },
        }),
      ),
    ).toEqual([
      ['filter[title]', 'a,b'],
      ['filter[createdAt][gte]', '2026-01-01'],
      ['filter[createdAt][lt]', '2027-01-01'],
      ['filter[author][in]', '1'],
      ['filter[author][in]', '2'],
      ['filter[author][isNull]', 'false'],
    ]);
  });

  it('writes each or group under its index, after the conditions', () => {
    expect(
      pairs(
        serializeQuery(Articles, {
          filter: {
            or: [{ title: 'x', author: '1' }, { title: { like: 'J%' } }],
            author: '2',
          },
        }),
      ),
    ).toEqual([
      ['filter[author]', '2'],
      ['filter[or][0][title]', 'x'],
      ['filter[or][0][author]', '1'],
      ['filter[or][1][title][like]', 'J%'],
    ]);
  });

  it('writes a number, a bigint, and a boolean as String does', () => {
    expect(
      pairs(
        serializeQuery(Articles, {
          filter: { title: [1.5, 9007199254740993n, true, -0] },
        }),
      ),
    ).toEqual([
      ['filter[title]', '1.5'],
      ['filter[title]', '9007199254740993'],
      ['filter[title]', 'true'],
      ['filter[title]', '0'],
    ]);
  });

  it('leaves out every member set to undefined', () => {
    expect(
      pairs(
        serializeQuery(Articles, {
          include: undefined,
          fields: { articles: undefined, people: ['name'] },
          filter: { title: undefined, author: { eq: undefined, in: ['1'] } },
          page: { size: undefined, after: 'a' },
          custom: { highlightMode: undefined, 'highlightMode[x]': 'y' },
        }),
      ),
    ).toEqual([
      ['fields[people]', 'name'],
      ['page[after]', 'a'],
      ['filter[author][in]', '1'],
      ['highlightMode[x]', 'y'],
    ]);
  });

  it("puts search in the definition's parameter, a filter member or a custom name", () => {
    expect(pairs(serializeQuery(Articles, { search: 'graph ql' }))).toEqual([
      ['filter[q]', 'graph ql'],
    ]);
    expect(pairs(serializeQuery(People, { search: 'ada' }))).toEqual([
      ['searchTerm', 'ada'],
    ]);
  });

  it('writes each custom parameter with its value, repeated for a list', () => {
    expect(
      pairs(
        serializeQuery(Articles, {
          custom: {
            highlightMode: 'on',
            'highlightMode[fields]': ['title', 'body'],
          },
        }),
      ),
    ).toEqual([
      ['highlightMode', 'on'],
      ['highlightMode[fields]', 'title'],
      ['highlightMode[fields]', 'body'],
    ]);
  });

  it('orders the members include, fields, sort, page, filter, search, custom', () => {
    const params = serializeQuery(Articles, {
      custom: { highlightMode: 'on' },
      search: 's',
      filter: { title: 't' },
      page: { size: 2 },
      sort: ['title'],
      fields: { articles: ['title'] },
      include: ['tags'],
    });
    expect([...params.keys()]).toEqual([
      'include',
      'fields[articles]',
      'sort',
      'page[size]',
      'filter[title]',
      'filter[q]',
      'highlightMode',
    ]);
  });

  it('encodes brackets, commas, and spaces as the form serializer JSON:API names', () => {
    expect(
      serializeQuery(Articles, {
        include: ['author', 'tags'],
        filter: { title: 'a b,c' },
      }).toString(),
    ).toBe('include=author%2Ctags&filter%5Btitle%5D=a+b%2Cc');
  });

  it.each([0, -1, 1.5, Number.NaN, 2 ** 53])('refuses page.size %s', (size) => {
    expect(() => serializeQuery(Articles, { page: { size } })).toThrow(
      new TypeError(
        'serializeQuery: page.size must be a positive safe integer',
      ),
    );
  });

  it('refuses page and search on a definition without them', () => {
    expect(() => serializeQuery(Tags, { page: { size: 1 } })).toThrow(
      new TypeError(
        'serializeQuery: tags does not paginate, so a query has no page',
      ),
    );
    expect(() => serializeQuery(Tags, { search: 'x' })).toThrow(
      new TypeError(
        'serializeQuery: tags has no search parameter, so a query has no search',
      ),
    );
  });

  it.each([Number.POSITIVE_INFINITY, Number.NaN, null, { a: 1 }, Symbol('s')])(
    'refuses a filter value with no parameter form: %s',
    (value) => {
      expect(() =>
        serializeQuery(Articles, {
          filter: { title: { like: [value as never] } },
        }),
      ).toThrow(
        new TypeError(
          'serializeQuery: filter[title][like] must be a string, a finite number, a bigint, a boolean, or a list of them',
        ),
      );
    },
  );

  it('refuses an empty list, which no pair carries, rather than drop the condition', () => {
    expect(() =>
      serializeQuery(Articles, { filter: { author: { in: [] } } }),
    ).toThrow(
      new TypeError(
        'serializeQuery: filter[author][in] must hold at least one value',
      ),
    );
    expect(() =>
      serializeQuery(Articles, { custom: { highlightMode: [] } }),
    ).toThrow(
      new TypeError(
        'serializeQuery: highlightMode must hold at least one value',
      ),
    );
  });

  it('refuses or that is not a list of groups', () => {
    expect(() =>
      serializeQuery(Articles, { filter: { or: 'x' as never } }),
    ).toThrow(
      new TypeError('serializeQuery: filter.or must be a list of groups'),
    );
    expect(() => serializeQuery(Articles, { filter: { or: ['x'] } })).toThrow(
      new TypeError(
        'serializeQuery: filter.or[0] must be an object of conditions',
      ),
    );
  });

  it('never reads a filter member through the prototype', () => {
    const filter = JSON.parse(
      '{"__proto__": {"title": "x"}, "constructor": "y"}',
    ) as never;
    expect(pairs(serializeQuery(Articles, { filter }))).toEqual([
      ['filter[__proto__][title]', 'x'],
      ['filter[constructor]', 'y'],
    ]);
  });
});
