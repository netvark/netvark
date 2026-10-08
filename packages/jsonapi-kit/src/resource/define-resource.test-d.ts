import type {
  AnyResource,
  CreateAttributesOf,
  RowOf,
  UpdateAttributesOf,
} from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { defineResource } from './define-resource';

interface ArticleRow {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly authorId: string | null;
}

interface CreateArticle {
  readonly title: string;
  readonly body: string;
}

declare const createSchema: {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: 'test';
    readonly validate: (value: unknown) => { value: CreateArticle };
    readonly types: { input: unknown; output: CreateArticle };
  };
};

const Article = defineResource({
  type: 'articles',
  attributes: ['title', 'body'],
  relationships: {
    author: { type: 'people', cardinality: 'one' },
    comments: { type: 'comments', cardinality: 'many' },
  },
  serialize: (row: ArticleRow) => ({
    id: String(row.id),
    attributes: { title: row.title, body: row.body },
    relationships: { author: row.authorId, comments: [] },
  }),
  query: {
    sort: ['title', 'author.name'],
    filter: { title: ['eq', 'like'], 'author.name': ['eq'] },
  },
  validate: { create: createSchema },
});

describe('defineResource types', () => {
  it('infers literal unions for type, fields, sort, and filter', () => {
    expectTypeOf(Article.type).toEqualTypeOf<'articles'>();
    expectTypeOf(Article.attributes).toEqualTypeOf<
      ReadonlyArray<'title' | 'body'>
    >();
    expectTypeOf(Article.query.sort).toEqualTypeOf<
      ReadonlyArray<'title' | 'author.name'>
    >();
    expectTypeOf(Article.query.filter).toEqualTypeOf<
      Readonly<Record<'title' | 'author.name', ReadonlyArray<string>>>
    >();
    expectTypeOf<RowOf<typeof Article>>().toEqualTypeOf<ArticleRow>();
    expectTypeOf<
      CreateAttributesOf<typeof Article>
    >().toEqualTypeOf<CreateArticle>();
    expectTypeOf<UpdateAttributesOf<typeof Article>>().toEqualTypeOf<
      Readonly<Record<string, unknown>>
    >();
  });

  it('rejects undeclared attributes and relationships in serialize', () => {
    defineResource({
      type: 'people',
      attributes: ['name'],
      // @ts-expect-error -- "nickname" is not a declared attribute
      serialize: (row: { id: string }) => ({
        id: row.id,
        attributes: { nickname: row.id },
      }),
    });
    defineResource({
      type: 'people',
      attributes: ['name'],
      // @ts-expect-error -- no relationships are declared
      serialize: (row: { id: string }) => ({
        id: row.id,
        relationships: { boss: row.id },
      }),
    });
    const Tag = defineResource({
      type: 'tags',
      attributes: [],
      relationships: { owner: { type: 'people', cardinality: 'one' } },
      serialize: (row: { id: string }) => ({
        id: row.id,
        relationships: { owner: null },
      }),
    });
    expectTypeOf(Tag.attributes).toEqualTypeOf<ReadonlyArray<never>>();
  });

  it('is assignable to AnyResource', () => {
    const any: AnyResource = Article;
    expectTypeOf(any.type).toEqualTypeOf<string>();
  });
});
