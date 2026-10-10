import { describe, expect, it } from 'vitest';

import { itemCursorMeta, pageMeta, paginationLinks } from './links';

const URL_WITH_QUERY =
  'https://api.example.com/articles?filter%5Btitle%5D%5Blike%5D=a%25b&fields%5Barticles%5D=title&include=author&sort=-title&page%5Bsize%5D=2&page%5Bafter%5D=abc&viewAs=admin';

describe('paginationLinks', () => {
  it('reproduces every client parameter and swaps only the cursors', () => {
    const links = paginationLinks(URL_WITH_QUERY, { next: 'zzz', prev: 'yyy' });
    expect(links['self']).toBe(URL_WITH_QUERY);
    expect(links['first']).toBe(
      'https://api.example.com/articles?filter%5Btitle%5D%5Blike%5D=a%25b&fields%5Barticles%5D=title&include=author&sort=-title&page%5Bsize%5D=2&viewAs=admin',
    );
    expect(links['next']).toBe(
      'https://api.example.com/articles?filter%5Btitle%5D%5Blike%5D=a%25b&fields%5Barticles%5D=title&include=author&sort=-title&page%5Bsize%5D=2&page%5Bafter%5D=zzz&viewAs=admin',
    );
    expect(links['prev']).toBe(
      'https://api.example.com/articles?filter%5Btitle%5D%5Blike%5D=a%25b&fields%5Barticles%5D=title&include=author&sort=-title&page%5Bsize%5D=2&viewAs=admin&page%5Bbefore%5D=yyy',
    );
    expect(Object.keys(links)).toEqual(['self', 'first', 'prev', 'next']);
  });

  it('emits null for prev and next when the pages do not exist, and last on request', () => {
    const links = paginationLinks('https://x.test/a?page[before]=q', {
      next: null,
      prev: null,
      last: 'end',
    });
    expect(links['prev']).toBeNull();
    expect(links['next']).toBeNull();
    expect(links['last']).toBe('https://x.test/a?page%5Bbefore%5D=end');
    expect(
      paginationLinks('https://x.test/a', {
        next: null,
        prev: null,
        last: null,
      })['last'],
    ).toBeNull();
    expect(
      'last' in paginationLinks('https://x.test/a', { next: null, prev: null }),
    ).toBe(false);
  });

  it('can omit first and render relative references', () => {
    const links = paginationLinks(
      'https://x.test/a?b=1&page[after]=c',
      { next: 'd', prev: null, first: false },
      {
        relative: true,
      },
    );
    expect(links).toEqual({
      self: '/a?b=1&page%5Bafter%5D=c',
      prev: null,
      next: '/a?b=1&page%5Bafter%5D=d',
    });
  });

  it('percent-encodes bare square brackets in self, as the serialization rules require', () => {
    expect(
      paginationLinks('https://x.test/a?page[size]=2&q=a+b', {
        next: null,
        prev: null,
        first: false,
      })['self'],
    ).toBe('https://x.test/a?page%5Bsize%5D=2&q=a+b');
  });

  it('accepts a URL instance and percent-encodes cursors', () => {
    const links = paginationLinks(new URL('https://x.test/a'), {
      next: 'a b/+',
      prev: null,
    });
    expect(links['next']).toBe('https://x.test/a?page%5Bafter%5D=a+b%2F%2B');
  });
});

describe('pageMeta', () => {
  it('emits only recognized members and only a true rangeTruncated', () => {
    expect(pageMeta({})).toEqual({ page: {} });
    expect(pageMeta({ total: 10, rangeTruncated: false })).toEqual({
      page: { total: 10 },
    });
    expect(pageMeta({ estimatedTotal: 12, rangeTruncated: true })).toEqual({
      page: { estimatedTotal: { bestGuess: 12 }, rangeTruncated: true },
    });
  });

  it('builds item cursor meta', () => {
    expect(itemCursorMeta('abc')).toEqual({ page: { cursor: 'abc' } });
  });
});
