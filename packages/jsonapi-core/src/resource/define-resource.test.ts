import { describe, expect, it } from 'vitest';

import { defineResource, relatedResource } from './define-resource';

interface ArticleRow {
  readonly id: number;
  readonly title: string;
  readonly authorId: string | null;
}

const schema = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) => ({ value }),
  },
};

function articles(overrides: Record<string, unknown> = {}) {
  return defineResource({
    type: 'articles',
    attributes: ['title'],
    relationships: { author: { type: 'people', cardinality: 'one' } },
    serialize: (row: ArticleRow) => ({
      id: String(row.id),
      attributes: { title: row.title },
      relationships: { author: row.authorId },
    }),
    ...overrides,
  });
}

describe('defineResource', () => {
  it('fills defaults and derives the field set', () => {
    const resource = articles();
    expect(resource.type).toBe('articles');
    expect([...resource.fields]).toEqual(['title', 'author']);
    expect(resource.query).toEqual({
      sort: [],
      filter: {},
      include: [],
      fields: true,
      page: undefined,
      search: undefined,
      custom: [],
    });
    expect(resource.links).toEqual({});
    expect(resource.validate).toEqual({});
    expect(resource.clientIds).toBe(false);
    // The client types (SPEC 5.3) are type-only.
    expect(Object.hasOwn(resource, '~types')).toBe(false);
  });

  it('rejects types and fields that break the member name or namespace rules', () => {
    expect(() => articles({ type: 'my.articles' })).toThrow(
      /type "my\.articles"/u,
    );
    expect(() => articles({ attributes: ['title', 'id'] })).toThrow(
      /attribute "id" is not allowed/u,
    );
    expect(() => articles({ attributes: ['title', 'type'] })).toThrow(
      TypeError,
    );
    expect(() => articles({ attributes: ['title', 'title'] })).toThrow(
      /attribute "title" is declared more than once/u,
    );
    expect(() => articles({ attributes: ['bad!'] })).toThrow(TypeError);
    expect(() =>
      articles({
        relationships: { title: { type: 'people', cardinality: 'one' } },
      }),
    ).toThrow(/both an attribute and a relationship/u);
    expect(() =>
      articles({
        relationships: { author: { type: 'people', cardinality: 'both' } },
      }),
    ).toThrow(/cardinality/u);
    expect(() =>
      articles({
        relationships: { author: { type: 'peo ple!', cardinality: 'one' } },
      }),
    ).toThrow(TypeError);
    expect(() => articles({ serialize: 'nope' })).toThrow(
      /serialize must be a function/u,
    );
  });

  it('validates query capabilities against the declaration', () => {
    expect(() =>
      articles({ query: { sort: ['title', 'author.name'] } }),
    ).not.toThrow();
    expect(() => articles({ query: { sort: ['-title'] } })).toThrow(
      /query\.sort field "-title"/u,
    );
    expect(() => articles({ query: { sort: ['title', 'title'] } })).toThrow(
      /more than once/u,
    );
    expect(() =>
      articles({ query: { filter: { title: ['eq', 'like'] } } }),
    ).not.toThrow();
    expect(() => articles({ query: { filter: { title: [] } } })).toThrow(
      /declares no operators/u,
    );
    expect(() => articles({ query: { filter: { or: ['eq'] } } })).toThrow(
      /reserved/u,
    );
    expect(() =>
      articles({ query: { filter: { title: ['eq', 'eq'] } } }),
    ).toThrow(/more than once/u);
    expect(() =>
      articles({ query: { filter: { title: ['e q'] } } }),
    ).not.toThrow();
    expect(() => articles({ query: { filter: { title: ['='] } } })).toThrow(
      TypeError,
    );
    expect(() =>
      articles({ query: { include: ['author', 'author.company'] } }),
    ).not.toThrow();
    expect(() => articles({ query: { include: ['comments'] } })).toThrow(
      /does not start with a declared relationship/u,
    );
    expect(() =>
      articles({ query: { include: ['author', 'author'] } }),
    ).toThrow(/more than once/u);
  });

  it('resolves pagination defaults and bounds', () => {
    expect(articles({ query: { page: {} } }).query.page).toEqual({
      default: 20,
      max: 100,
      range: false,
    });
    expect(articles({ query: { page: { max: 10 } } }).query.page).toEqual({
      default: 10,
      max: 10,
      range: false,
    });
    expect(
      articles({ query: { page: { default: 5, max: 50, range: true } } }).query
        .page,
    ).toEqual({
      default: 5,
      max: 50,
      range: true,
    });
    expect(articles({ query: { page: false } }).query.page).toBeUndefined();
    expect(() => articles({ query: { page: { max: 0 } } })).toThrow(
      /query\.page\.max/u,
    );
    expect(() => articles({ query: { page: { default: 1.5 } } })).toThrow(
      /query\.page\.default/u,
    );
    expect(() =>
      articles({ query: { page: { default: 200, max: 100 } } }),
    ).toThrow(/exceeds/u);
  });

  it('accepts search as filter[member] or a custom base name', () => {
    expect(articles({ query: { search: 'filter[q]' } }).query.search).toEqual({
      parameter: 'filter[q]',
      family: 'filter',
      member: 'q',
    });
    expect(articles({ query: { search: 'searchText' } }).query.search).toEqual({
      parameter: 'searchText',
      family: 'searchText',
      member: undefined,
    });
    expect(() => articles({ query: { search: 'search' } })).toThrow(
      /outside a-z/u,
    );
    expect(() => articles({ query: { search: 'page[q]' } })).toThrow(
      /must be filter\[<member>\]/u,
    );
    expect(() => articles({ query: { search: 'filter[q' } })).toThrow(
      TypeError,
    );
    expect(() =>
      articles({ query: { search: 'filter[q]', filter: { q: ['eq'] } } }),
    ).toThrow(/reserved/u);
  });

  it('requires custom parameter names to carry a non a-z character', () => {
    expect(
      articles({ query: { custom: ['viewAs', 'x-mode'] } }).query.custom,
    ).toEqual(['viewAs', 'x-mode']);
    expect(() => articles({ query: { custom: ['mode'] } })).toThrow(
      /outside a-z/u,
    );
    expect(() => articles({ query: { custom: ['viewAs', 'viewAs'] } })).toThrow(
      /more than once/u,
    );
    expect(() => articles({ query: { custom: ['view.as'] } })).toThrow(
      TypeError,
    );
  });

  it('checks validators structurally', () => {
    expect(articles({ validate: { create: schema } }).validate.create).toBe(
      schema,
    );
    expect(() =>
      articles({ validate: { update: { parse: () => 1 } } }),
    ).toThrow(/validate\.update is not a Standard Schema V1 object/u);
    expect(() =>
      articles({ validate: { create: { '~standard': { version: 2 } } } }),
    ).toThrow(TypeError);
  });

  it('takes an id validator, which an update uses without clientIds', () => {
    expect(
      articles({ clientIds: true, validate: { id: schema } }).validate.id,
    ).toBe(schema);
    expect(articles({ validate: { id: schema } }).validate.id).toBe(schema);
    expect(() =>
      articles({ clientIds: true, validate: { id: { parse: () => 1 } } }),
    ).toThrow(/validate\.id is not a Standard Schema V1 object/u);
  });

  it('resolves the fields each write accepts, every field without a list', () => {
    expect(articles().writable).toEqual({
      create: new Set(['title', 'author']),
      update: new Set(['title', 'author']),
    });
    expect(articles({ writable: { update: ['title'] } }).writable).toEqual({
      create: new Set(['title', 'author']),
      update: new Set(['title']),
    });
  });

  it('refuses a writable list that names an undeclared field, or one twice', () => {
    expect(() => articles({ writable: { create: ['body'] } })).toThrow(
      new TypeError('writable.create: "body" is not a declared field'),
    );
    expect(() =>
      articles({ writable: { update: ['title', 'title'] } }),
    ).toThrow(
      new TypeError('writable.update field "title" is declared more than once'),
    );
  });

  it('accepts a schema whose ~standard is a prototype getter (zod 4, valibot, ArkType)', () => {
    class ProtoSchema {
      public get ['~standard'](): {
        version: 1;
        vendor: string;
        validate: (value: unknown) => { value: unknown };
      } {
        return { version: 1, vendor: 'test', validate: (value) => ({ value }) };
      }
    }
    const proto = new ProtoSchema();
    expect(Object.hasOwn(proto, '~standard')).toBe(false);
    expect(articles({ validate: { create: proto } }).validate.create).toBe(
      proto,
    );
  });
});

describe('relatedResource', () => {
  const people = defineResource({
    type: 'people',
    attributes: ['name'],
    serialize: (row: { id: string; name: string }) => ({
      id: row.id,
      attributes: { name: row.name },
    }),
  });

  it('follows a relationship to its definition', () => {
    const resource = articles({
      relationships: {
        author: { type: 'people', cardinality: 'one', resource: () => people },
      },
    });
    expect(relatedResource(resource, 'author')).toBe(people);
  });

  it('reports missing relationships, missing definitions, and type mismatches', () => {
    expect(() => relatedResource(articles(), 'comments')).toThrow(
      /has no relationship "comments"/u,
    );
    expect(() => relatedResource(articles(), 'author')).toThrow(
      /declares no resource definition/u,
    );
    const mismatched = articles({
      relationships: {
        author: { type: 'authors', cardinality: 'one', resource: () => people },
      },
    });
    expect(() => relatedResource(mismatched, 'author')).toThrow(
      /declares type "authors" but its resource definition is "people"/u,
    );
  });
});
