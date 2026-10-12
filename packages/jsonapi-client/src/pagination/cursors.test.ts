import { describe, expect, it } from 'vitest';

import { cursorOf, pageCursors } from './cursors';

describe('pageCursors (SPEC 15.8)', () => {
  it("reads next's page[after] and prev's page[before], as strings or link objects", () => {
    expect(
      pageCursors({
        links: {
          next: 'https://blog.example/api/articles?page%5Bsize%5D=2&page%5Bafter%5D=YQ%3D%3D',
          prev: { href: '/api/articles?page[before]=Yg==&sort=title' },
        },
      }),
    ).toEqual({ next: 'YQ==', prev: 'Yg==' });
  });

  it('gives undefined for a null, absent, or cursorless link, and for no links', () => {
    expect(
      pageCursors({
        links: { next: null, prev: '/api/articles?page[after]=x' },
      }),
    ).toEqual({
      next: undefined,
      prev: undefined,
    });
    expect(pageCursors({})).toEqual({ next: undefined, prev: undefined });
    expect(pageCursors({ links: { next: { href: 3 } } })).toEqual({
      next: undefined,
      prev: undefined,
    });
  });

  it('never reads a link through the prototype', () => {
    const links = JSON.parse(
      '{"__proto__": {"next": "/a?page[after]=x"}}',
    ) as unknown;
    expect(pageCursors({ links })).toEqual({
      next: undefined,
      prev: undefined,
    });
  });
});

describe('cursorOf (SPEC 15.8)', () => {
  it("reads a record's $meta.page.cursor when it is a string", () => {
    expect(cursorOf({ $meta: { page: { cursor: 'c1' } } })).toBe('c1');
    expect(cursorOf({ $meta: { page: { cursor: 1 } } })).toBeUndefined();
    expect(cursorOf({ $meta: { other: true } })).toBeUndefined();
    expect(cursorOf({})).toBeUndefined();
  });
});
