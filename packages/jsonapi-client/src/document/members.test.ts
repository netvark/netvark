/**
 * The members a client keeps as sent (SPEC 15.6, 15.7), each held to the
 * shape JSON:API gives it: a link is a string, `null`, or an object with a
 * string `href`, whose other members keep their types; the `jsonapi`
 * object's lists hold strings; a relationship object keeps its linkage
 * with each identifier's `meta`.
 */
import { describe, expect, it } from 'vitest';

import {
  jsonApiObjectOf,
  linkOf,
  linksOf,
  relationshipObjectOf,
  resourceIdentifierOf,
} from './members';

describe('links (SPEC 15.6)', () => {
  it('are a string, null, or a link object with a string href', () => {
    expect(linkOf('/a')).toBe('/a');
    expect(linkOf(null)).toBeNull();
    expect(linkOf({ href: '/a' })).toStrictEqual({ href: '/a' });
    expect(linkOf({ title: 'no href' })).toBeUndefined();
    expect(linkOf(3)).toBeUndefined();
    expect(linkOf(['/a'])).toBeUndefined();
  });

  it('keep each member of a link object that has its type', () => {
    expect(
      linkOf({
        href: '/articles/1',
        rel: 'canonical',
        title: 'Article',
        type: 'application/vnd.api+json',
        hreflang: ['en', 'de'],
        describedby: { href: '/schemas/article', meta: { v: 1 } },
        meta: { count: 1 },
      }),
    ).toStrictEqual({
      href: '/articles/1',
      rel: 'canonical',
      title: 'Article',
      type: 'application/vnd.api+json',
      hreflang: ['en', 'de'],
      describedby: { href: '/schemas/article', meta: { v: 1 } },
      meta: { count: 1 },
    });
    expect(
      linkOf({ href: '/a', hreflang: 'en', describedby: '/schema' }),
    ).toStrictEqual({ href: '/a', hreflang: 'en', describedby: '/schema' });
    expect(
      linkOf({
        href: '/a',
        rel: 1,
        title: null,
        type: [],
        hreflang: ['en', 2],
        describedby: null,
        meta: 'x',
      }),
    ).toStrictEqual({ href: '/a' });
  });

  it('keep each member whose value is a link, a name like __proto__ as a plain key', () => {
    const links = linksOf(
      JSON.parse(
        '{"self":"/a","__proto__":"/b","bad":{"rel":"x"},"next":null}',
      ),
    );
    expect(Object.keys(links)).toEqual(['self', '__proto__', 'next']);
    expect(Object.getPrototypeOf(links)).toBe(Object.prototype);
  });
});

describe('the jsonapi object (SPEC 15.6)', () => {
  it('keeps a string version, lists of strings, and meta', () => {
    expect(
      jsonApiObjectOf({
        version: '1.1',
        ext: ['https://jsonapi.org/ext/atomic'],
        profile: [
          'http://jsonapi.org/profiles/ethanresnick/cursor-pagination/',
        ],
        meta: { a: 1 },
      }),
    ).toStrictEqual({
      version: '1.1',
      ext: ['https://jsonapi.org/ext/atomic'],
      profile: ['http://jsonapi.org/profiles/ethanresnick/cursor-pagination/'],
      meta: { a: 1 },
    });
    expect(
      jsonApiObjectOf({ version: 1.1, ext: 'x', profile: [1], meta: [] }),
    ).toStrictEqual({});
  });
});

describe('relationship objects and identifiers (SPEC 15.6)', () => {
  it('keep the links, the linkage with each identifier meta, and the meta', () => {
    expect(
      relationshipObjectOf({
        links: { related: '/a/1/b', bad: 1 },
        data: [{ type: 'b', id: '1', meta: { order: 1 }, extra: true }],
        meta: { total: 1 },
      }),
    ).toStrictEqual({
      links: { related: '/a/1/b' },
      data: [{ type: 'b', id: '1', meta: { order: 1 } }],
      meta: { total: 1 },
    });
    expect(relationshipObjectOf({ data: null })).toStrictEqual({ data: null });
    expect(relationshipObjectOf({ links: 'x' })).toStrictEqual({});
  });

  it('refuse an identifier without a string type and id', () => {
    expect(resourceIdentifierOf({ type: 'a', id: '1' })).toStrictEqual({
      type: 'a',
      id: '1',
    });
    for (const value of [null, 'a', { type: 'a' }, { type: 'a', id: 1 }]) {
      expect(() => resourceIdentifierOf(value)).toThrow(
        new TypeError(
          'deserialize: a resource identifier has no string type and id',
        ),
      );
    }
  });
});
