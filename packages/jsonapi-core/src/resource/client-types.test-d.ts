import type { JsonOf, TypesOf } from './client-types';
import type { AnyResource } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDefineResource } from './create-define-resource';
import { defineResource } from './define-resource';

interface ArticleRow {
  readonly id: string;
  readonly title: string;
  readonly body: string | undefined;
  readonly createdAt: Date;
  readonly authorId: string | null;
  readonly tagIds: ReadonlyArray<string>;
}

interface CreateArticleInput {
  readonly title: string;
  readonly body?: string | undefined;
}

declare const createSchema: {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: 'test';
    readonly validate: (value: unknown) => { value: { title: string } };
    readonly types: {
      input: CreateArticleInput;
      output: { title: string; body: string };
    };
  };
};

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body', 'createdAt'],
  relationships: {
    author: { type: 'people', cardinality: 'one' },
    tags: { type: 'tags', cardinality: 'many' },
  },
  serialize: (row: ArticleRow) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body, createdAt: row.createdAt },
    relationships: { author: row.authorId, tags: row.tagIds },
  }),
  query: {
    sort: ['title', 'createdAt'],
    filter: { title: ['eq', 'like'], author: ['eq'] },
    include: ['author', 'author.articles', 'tags'],
    page: { default: 2, max: 4 },
    search: 'filter[q]',
    custom: ['x-trace'],
  },
  validate: { create: createSchema },
  writable: { create: ['title', 'body', 'author', 'tags'], update: ['title'] },
});

type Types = TypesOf<typeof Articles>;

describe("a definition's client types (SPEC 5.3)", () => {
  it('types the attributes as the JSON serialize writes', () => {
    expectTypeOf<Types['attributes']>().toEqualTypeOf<{
      readonly title: string;
      readonly createdAt: string;
      readonly body?: string;
    }>();
  });

  it('keeps each relationship literal: the related type and the cardinality', () => {
    expectTypeOf<Types['relationships']>().toEqualTypeOf<{
      readonly author: { readonly type: 'people'; readonly cardinality: 'one' };
      readonly tags: { readonly type: 'tags'; readonly cardinality: 'many' };
    }>();
  });

  it('records the query capabilities', () => {
    expectTypeOf<Types['filter']>().toEqualTypeOf<{
      readonly title: 'eq' | 'like';
      readonly author: 'eq';
    }>();
    expectTypeOf<Types['include']>().toEqualTypeOf<
      'author' | 'author.articles' | 'tags'
    >();
    expectTypeOf<Types['fields']>().toEqualTypeOf<true>();
    expectTypeOf<Types['search']>().toEqualTypeOf<true>();
    expectTypeOf<Types['page']>().toEqualTypeOf<true>();
    expectTypeOf<Types['custom']>().toEqualTypeOf<'x-trace'>();
  });

  it("types a write by its validator's input, and the fields each write carries", () => {
    expectTypeOf<Types['create']>().toEqualTypeOf<CreateArticleInput>();
    expectTypeOf<Types['update']>().toEqualTypeOf<{
      readonly title?: unknown;
    }>();
    expectTypeOf<Types['creatable']>().toEqualTypeOf<
      'title' | 'body' | 'author' | 'tags'
    >();
    expectTypeOf<Types['updatable']>().toEqualTypeOf<'title'>();
    expectTypeOf<Types['clientIds']>().toEqualTypeOf<false>();
  });

  it('defaults every member a bare definition leaves out', () => {
    const Tags = defineResource({
      type: 'tags',
      attributes: ['name'],
      serialize: (row: { id: string; name: string }) => ({
        id: row.id,
        attributes: { name: row.name },
      }),
      query: { page: false, fields: false },
      clientIds: true,
    });
    type Bare = TypesOf<typeof Tags>;
    expectTypeOf<Bare['attributes']>().toEqualTypeOf<{
      readonly name: string;
    }>();
    expectTypeOf<keyof Bare['relationships']>().toEqualTypeOf<never>();
    expectTypeOf<keyof Bare['filter']>().toEqualTypeOf<never>();
    expectTypeOf<Bare['include']>().toEqualTypeOf<never>();
    expectTypeOf<Bare['fields']>().toEqualTypeOf<false>();
    expectTypeOf<Bare['search']>().toEqualTypeOf<false>();
    expectTypeOf<Bare['page']>().toEqualTypeOf<false>();
    expectTypeOf<Bare['create']>().toEqualTypeOf<{
      readonly name?: unknown;
    }>();
    expectTypeOf<Bare['creatable']>().toEqualTypeOf<'name'>();
    expectTypeOf<Bare['clientIds']>().toEqualTypeOf<true>();
  });

  it('is inferred the same through a configured definer', () => {
    const define = createDefineResource({ links: { base: '/api' } });
    const People = define({
      type: 'people',
      attributes: ['name'],
      relationships: { articles: { type: 'articles', cardinality: 'many' } },
      serialize: (row: { id: string; name: string }) => ({
        id: row.id,
        attributes: { name: row.name },
      }),
      query: { include: ['articles'] },
    });
    expectTypeOf<
      TypesOf<typeof People>['include']
    >().toEqualTypeOf<'articles'>();
    expectTypeOf<
      TypesOf<typeof People>['relationships']['articles']['type']
    >().toEqualTypeOf<'articles'>();
  });

  it('leaves AnyResource the wide types every definition is assignable to', () => {
    const any: AnyResource = Articles;
    expectTypeOf<TypesOf<typeof any>['include']>().toEqualTypeOf<string>();
  });
});

describe('JsonOf', () => {
  it('follows JSON.stringify', () => {
    expectTypeOf<JsonOf<Date>>().toEqualTypeOf<string>();
    expectTypeOf<JsonOf<string | null>>().toEqualTypeOf<string | null>();
    expectTypeOf<JsonOf<bigint>>().toEqualTypeOf<never>();
    expectTypeOf<JsonOf<unknown>>().toEqualTypeOf<unknown>();
    expectTypeOf<JsonOf<ReadonlyArray<Date | undefined>>>().toEqualTypeOf<
      ReadonlyArray<string | null>
    >();
    expectTypeOf<
      JsonOf<{ a: number; b: undefined | Date; c: () => void; d: { e: Date } }>
    >().toEqualTypeOf<{
      readonly a: number;
      readonly d: { readonly e: string };
      readonly b?: string;
    }>();
    expectTypeOf<JsonOf<{ toJSON(): { at: Date } }>>().toEqualTypeOf<{
      readonly at: string;
    }>();
  });
});
