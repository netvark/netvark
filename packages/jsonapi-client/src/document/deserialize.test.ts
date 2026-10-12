/**
 * `deserialize` (SPEC 15.6, ADR 0019): flat records with `$links` and
 * `$meta`, the included resources, the document's members, and a broken
 * document refused with a message that quotes nothing of it. The
 * relationships are `relationships.test.ts`'s.
 */
import { describe, expect, it } from 'vitest';

import { COMPOUND } from '../test-support/compound';
import { deserialize } from './deserialize';

const SECRET = 'secret-value-from-the-server';

function recordAt(value: unknown): Readonly<Record<string, unknown>> {
  expect(value).toBeTypeOf('object');
  return value as Readonly<Record<string, unknown>>;
}

describe('a record (SPEC 15.6)', () => {
  it("holds type, id, each attribute, and the object's links and meta", () => {
    const { data } = deserialize({
      data: {
        type: 'articles',
        id: '1',
        attributes: { title: 'JSON', tags: ['a'], draft: null },
        links: { self: '/articles/1' },
        meta: { views: 3 },
      },
    });
    expect(data).toStrictEqual({
      type: 'articles',
      id: '1',
      title: 'JSON',
      tags: ['a'],
      draft: null,
      $links: { self: '/articles/1' },
      $meta: { views: 3 },
    });
  });

  it('holds only type and id when the object has nothing else', () => {
    const { data } = deserialize({ data: { type: 'tags', id: 't1' } });
    expect(data).toStrictEqual({ type: 'tags', id: 't1' });
  });

  it('skips @-members and the names no field can have: type, id, and any holding $', () => {
    const { data } = deserialize({
      data: {
        type: 'articles',
        id: '1',
        attributes: {
          '@context': 'x',
          title: 'kept',
          type: 'other',
          id: 'other',
          $links: 'x',
          a$b: 1,
        },
        relationships: { '@extra': { data: null }, editor: { data: null } },
      },
    });
    expect(data).toStrictEqual({
      type: 'articles',
      id: '1',
      title: 'kept',
      editor: null,
      $relationships: { editor: { data: null } },
    });
  });

  it('keeps a member named __proto__ as a plain key', () => {
    const document: unknown = JSON.parse(
      '{"data":{"type":"a","id":"1","attributes":{"__proto__":{"polluted":true},"constructor":"c"},"links":{"__proto__":"/x"}}}',
    );
    const data = recordAt(deserialize(document).data);
    expect(Object.getPrototypeOf(data)).toBe(Object.prototype);
    expect(Object.hasOwn(data, '__proto__')).toBe(true);
    expect(data['constructor']).toBe('c');
    expect(Object.hasOwn(recordAt(data['$links']), '__proto__')).toBe(true);
    expect(Reflect.get({}, 'polluted')).toBeUndefined();
  });
});

describe('the result (SPEC 15.6)', () => {
  it('holds every included resource as a record with its linkage', () => {
    const { included } = deserialize(COMPOUND, { include: ['author'] });
    expect(included.map((record) => `${record.type}:${record.id}`)).toEqual([
      'people:9',
      'tags:t1',
      'tags:t2',
      'articles:2',
    ]);
    expect(included[0]?.['articles']).toStrictEqual([
      { type: 'articles', id: '1' },
      { type: 'articles', id: '2' },
    ]);
  });

  it('reads data as a list, null, or absent, and keeps the first of a type and id', () => {
    expect(deserialize({ data: [] }).data).toEqual([]);
    expect(deserialize({ data: null }).data).toBeNull();
    expect(deserialize({ meta: { total: 0 } })).toStrictEqual({
      data: undefined,
      included: [],
      links: undefined,
      meta: { total: 0 },
      jsonapi: undefined,
    });
    const first = deserialize(
      {
        data: {
          type: 'a',
          id: '1',
          relationships: { b: { data: { type: 'b', id: '1' } } },
        },
        included: [
          { type: 'b', id: '1', attributes: { n: 1 } },
          { type: 'b', id: '1', attributes: { n: 2 } },
        ],
      },
      { include: ['b'] },
    );
    expect(recordAt(recordAt(first.data)['b'])['n']).toBe(1);
  });

  it('reads a relationship document as records of type and id', () => {
    expect(deserialize({ data: { type: 'people', id: '9' } }).data).toEqual({
      type: 'people',
      id: '9',
    });
    expect(
      deserialize({
        data: [
          { type: 'tags', id: 't1' },
          { type: 'tags', id: 't2' },
        ],
      }).data,
    ).toEqual([
      { type: 'tags', id: 't1' },
      { type: 'tags', id: 't2' },
    ]);
  });

  it("keeps the document's links, meta, and jsonapi, each member of its JSON:API shape", () => {
    const result = deserialize({
      data: [],
      links: {
        self: '/articles',
        prev: null,
        next: { href: '/articles?page[after]=c', meta: { count: 1 }, rel: 7 },
        about: 5,
        describedby: { title: 'no href' },
      },
      meta: { total: 3 },
      jsonapi: {
        version: '1.1',
        ext: ['https://jsonapi.org/ext/atomic'],
        profile: [3],
      },
    });
    expect(result.links).toStrictEqual({
      self: '/articles',
      prev: null,
      next: { href: '/articles?page[after]=c', meta: { count: 1 } },
    });
    expect(result.meta).toStrictEqual({ total: 3 });
    expect(result.jsonapi).toStrictEqual({
      version: '1.1',
      ext: ['https://jsonapi.org/ext/atomic'],
    });
  });
});

describe('a broken document', () => {
  it.each([
    ['a string', SECRET],
    ['null', null],
    ['a list', [SECRET]],
  ])('is refused when it is %s', (_name, document) => {
    expect(() => deserialize(document)).toThrow(
      new TypeError('deserialize: the document is not a JSON object'),
    );
  });

  it('is refused when data or included has another shape', () => {
    expect(() => deserialize({ data: SECRET })).toThrow(
      new TypeError(
        'deserialize: data is not a resource object, a list of them, or null',
      ),
    );
    expect(() => deserialize({ data: [], included: { x: SECRET } })).toThrow(
      new TypeError('deserialize: included is not a list'),
    );
  });

  it.each([
    ['without an id', { data: { type: SECRET } }],
    ['with a number id', { data: [{ type: 'a', id: 1 }] }],
    ['in included', { data: null, included: [{ id: SECRET }] }],
    ['that is not an object', { data: [SECRET] }],
  ])('is refused for a resource object %s', (_name, document) => {
    expect(() => deserialize(document)).toThrow(
      new TypeError('deserialize: a resource object has no string type and id'),
    );
  });

  it.each([[[]], [['author']]])(
    'is refused for linkage without a string type and id (include %j)',
    (include) => {
      const document = {
        data: {
          type: 'articles',
          id: '1',
          relationships: { author: { data: { type: SECRET } } },
        },
      };
      expect(() => deserialize(document, { include })).toThrow(
        new TypeError(
          'deserialize: a resource identifier has no string type and id',
        ),
      );
    },
  );
});
