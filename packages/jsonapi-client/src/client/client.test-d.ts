/**
 * The calls `createClients` types (SPEC 15.4): queries and records from
 * the definitions passed, writes from the validators' inputs and the
 * writable lists, relationship calls by cardinality. The blog is defined
 * here, since an exported definition needs an annotation under
 * `isolatedDeclarations` and the point is what `defineResource` infers.
 */
import type {
  AnyResource,
  Links,
  Meta,
  Relationships,
  TypesOf,
} from '@netvark/jsonapi-core';

import type { AnyRecord, Identifier } from '../document/types';
import type { ListQuery } from '../query/types';
import type { IdentifierObject, ReadResult, WriteResult } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDefineResource } from '@netvark/jsonapi-core';

import { createTransport } from '../transport/transport';
import { createClients } from './create-clients';

const defineResource = createDefineResource({ links: { base: '/api' } });

declare const createArticle: {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: 'test';
    readonly validate: (value: unknown) => { value: { title: string } };
    readonly types: {
      input: { readonly title: string; readonly body?: string | undefined };
      output: { title: string };
    };
  };
};

const Tags = defineResource({
  type: 'tags',
  attributes: ['name'],
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
  clientIds: true,
});

const People = defineResource({
  type: 'people',
  attributes: ['name'],
  relationships: {
    articles: {
      type: 'articles',
      cardinality: 'many',
      resource: (): AnyResource => Articles,
    },
  },
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
  query: { include: ['articles'] },
});

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body'],
  relationships: {
    author: {
      type: 'people',
      cardinality: 'one',
      resource: (): AnyResource => People,
    },
    tags: {
      type: 'tags',
      cardinality: 'many',
      resource: (): AnyResource => Tags,
    },
  },
  serialize: (row: {
    readonly id: string;
    readonly title: string;
    readonly body: string;
  }) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body },
  }),
  query: {
    sort: ['title'],
    filter: { title: ['eq', 'like'] },
    include: ['author', 'author.articles', 'tags'],
    page: { default: 10, max: 50 },
  },
  validate: { create: createArticle },
  writable: {
    create: ['title', 'body', 'author', 'tags'],
    update: ['title', 'tags'],
  },
});

const DEFINITIONS = { articles: Articles, people: People, tags: Tags };
const transport = createTransport({ origin: 'https://api.example.test' });
const { articles, people, tags } = createClients(DEFINITIONS, transport);

/** Relationship writes: `owner` and `labels` updatable, `creator` and `watchers` set on create alone. */
const Notes = defineResource({
  type: 'notes',
  attributes: ['text'],
  relationships: {
    owner: { type: 'people', cardinality: 'one' },
    creator: { type: 'people', cardinality: 'one' },
    labels: { type: 'tags', cardinality: 'many' },
    watchers: { type: 'people', cardinality: 'many' },
  },
  serialize: (row: { readonly id: string; readonly text: string }) => ({
    id: row.id,
    attributes: { text: row.text },
  }),
  writable: { update: ['text', 'owner', 'labels'] },
});

/** A definition that serves no update, as `@netvark/resource-core` types a declaration without the operation. */
declare const Archives: Omit<typeof Notes, '~types'> & {
  readonly '~types'?: Omit<TypesOf<typeof Notes>, 'update'> & {
    readonly update: never;
  };
};

const { notes, archives } = createClients(
  { notes: Notes, archives: Archives, people: People, tags: Tags },
  transport,
);

/** The members of a union that have `TKey`: a record, never the identifier beside it. */
type WithKey<TUnion, TKey extends PropertyKey> = TUnion extends unknown
  ? TKey extends keyof TUnion
    ? TUnion
    : never
  : never;

interface ArticleRecord {
  readonly type: 'articles';
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly author: Identifier<'people'> | null | undefined;
  readonly tags: ReadonlyArray<Identifier<'tags'>> | undefined;
  readonly $links?: Links;
  readonly $meta?: Meta;
  readonly $relationships?: Relationships;
}

type Data<TResult> =
  Awaited<TResult> extends { readonly data: infer TData } ? TData : never;

describe('reads (SPEC 15.4, 15.6)', () => {
  it('types a list without a query: every field, each relationship its linkage', () => {
    const listed = articles.list();
    type Article = Data<typeof listed>[number];

    expectTypeOf<Article['title']>().toEqualTypeOf<string>();
    expectTypeOf<Article['author']>().toEqualTypeOf<
      Identifier<'people'> | null | undefined
    >();
    expectTypeOf<Article['tags']>().toEqualTypeOf<
      ReadonlyArray<Identifier<'tags'>> | undefined
    >();
  });

  it('reads a literal query as a constant: included records and fieldsets exactly', () => {
    const included = articles.list({
      include: ['author'],
      fields: { articles: ['title', 'author'] },
    });
    type Article = Data<typeof included>[number];

    expectTypeOf<keyof Article>().toEqualTypeOf<
      'type' | 'id' | 'title' | 'author' | '$links' | '$meta' | '$relationships'
    >();
    expectTypeOf<
      NonNullable<Article['author']>['name']
    >().toEqualTypeOf<string>();
  });

  it('types a query held in a variable by what it may hold: records or linkage, fields optional', () => {
    const query: ListQuery<typeof DEFINITIONS, typeof Articles> = {};
    const listed = articles.list(query);
    type Article = Data<typeof listed>[number];

    type Author = NonNullable<Article['author']>;
    type Person = WithKey<Author, 'name'>;

    expectTypeOf<Identifier<'people'>>().toExtend<Author>();
    expectTypeOf<Person['name']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Pick<Article, 'title'>>().toEqualTypeOf<{
      readonly title?: string;
    }>();
  });

  it('refuses what the server would answer with a 400: an undeclared include, sort, or page where there is none', () => {
    // @ts-expect-error -- "editor" is no include path of articles
    void articles.list({ include: ['editor'] });
    // @ts-expect-error -- tags declare no sort
    void tags.list({ sort: ['name'] });
    // @ts-expect-error -- tags do not paginate
    void tags.list({ page: { size: 1 } });
    // @ts-expect-error -- get sends include and fields alone
    void articles.get('a1', { sort: ['title'] });
  });

  it("types related by cardinality, with the related definition's query", () => {
    const author = articles.related('a1', 'author', { include: ['articles'] });
    const tagged = articles.related('a1', 'tags');

    expectTypeOf<NonNullable<Data<typeof author>>['articles']>().toEqualTypeOf<
      ReadonlyArray<ArticleRecord> | undefined
    >();
    expectTypeOf<Data<typeof author>>().toExtend<object | null>();
    expectTypeOf<Data<typeof tagged>[number]['name']>().toEqualTypeOf<string>();
    // @ts-expect-error -- "author" is no include path of tags
    void articles.related('a1', 'tags', { include: ['author'] });
  });

  it('types a related type no definition passed has as AnyRecord', () => {
    const only = createClients({ articles: Articles }, transport);

    expectTypeOf<
      Data<ReturnType<typeof only.articles.related<'author'>>>
    >().toEqualTypeOf<AnyRecord | null>();
  });
});

describe('writes (SPEC 15.4)', () => {
  it("types create's attributes by the create validator's input", () => {
    void articles.create({
      attributes: { title: 'T' },
      relationships: { author: 'p1', tags: ['t1'] },
    });
    // @ts-expect-error -- the validator requires title
    void articles.create({});
    // @ts-expect-error -- title is a string
    void articles.create({ attributes: { title: 1 } });
    void articles.create({
      attributes: { title: 'T' },
      // @ts-expect-error -- a to-many takes a list
      relationships: { tags: 't1' },
    });
  });

  it('takes an id only where the definition accepts client ids', () => {
    void tags.create({ id: 't9', attributes: { name: 'n' } });
    // @ts-expect-error -- articles take no client ids
    void articles.create({ id: 'a9', attributes: { title: 'T' } });
  });

  it('takes the relationships the writable lists name', () => {
    void articles.update('a1', {
      relationships: { tags: [{ type: 'tags', id: 't1' }] },
    });
    // @ts-expect-error -- author is not updatable
    void articles.update('a1', { relationships: { author: 'p1' } });
    // @ts-expect-error -- body is not updatable
    void articles.update('a1', { attributes: { body: 'B' } });
    // @ts-expect-error -- tags have no relationship to write
    void tags.update('t1', { relationships: { owner: 'p1' } });
  });

  it('resolves to the stored record, or no data', () => {
    const created = articles.create({ attributes: { title: 'T' } });

    expectTypeOf<Data<typeof created>>().toEqualTypeOf<
      ArticleRecord | undefined
    >();
    expectTypeOf(articles.remove('a1')).toEqualTypeOf<
      Promise<WriteResult<undefined>>
    >();
  });
});

describe('relationship calls (SPEC 15.4)', () => {
  it('reads linkage by cardinality, each identifier with its meta', () => {
    expectTypeOf(articles.relationship('a1', 'author')).toEqualTypeOf<
      Promise<ReadResult<IdentifierObject<'people'> | null>>
    >();
    expectTypeOf(articles.relationship('a1', 'tags')).toEqualTypeOf<
      Promise<ReadResult<ReadonlyArray<IdentifierObject<'tags'>>>>
    >();
  });

  it('writes linkage by cardinality, to-many alone for add and remove', () => {
    void notes.setRelationship('n1', 'owner', null);
    void notes.setRelationship('n1', 'owner', { type: 'people', id: 'p1' });
    void notes.setRelationship('n1', 'labels', ['t1']);
    void notes.addToRelationship('n1', 'labels', ['t1']);
    void notes.removeFromRelationship('n1', 'labels', [
      { type: 'tags', id: 't1' },
    ]);
    // @ts-expect-error -- a to-many takes a list
    void notes.setRelationship('n1', 'labels', 't1');
    // @ts-expect-error -- owner is a to-one
    void notes.addToRelationship('n1', 'owner', ['p1']);
    // @ts-expect-error -- people declare no editor
    void people.relationship('p1', 'editor');
  });

  it('writes only the relationships an update may carry, as the server answers 403 otherwise', () => {
    // @ts-expect-error -- creator is set on create alone
    void notes.setRelationship('n1', 'creator', 'p1');
    // @ts-expect-error -- watchers are set on create alone
    void notes.addToRelationship('n1', 'watchers', ['p1']);
    // @ts-expect-error -- watchers are set on create alone
    void notes.removeFromRelationship('n1', 'watchers', ['p1']);
    // @ts-expect-error -- author is not in the articles' update list
    void articles.setRelationship('a1', 'author', null);
    void articles.addToRelationship('a1', 'tags', ['t1']);
    // A definition without writable lists updates every relationship.
    void people.setRelationship('p1', 'articles', ['a1']);
  });

  it('writes no relationship of a definition that serves no update, and reads each', () => {
    // @ts-expect-error -- archives serve no update
    void archives.setRelationship('x1', 'owner', null);
    // @ts-expect-error -- archives serve no update
    void archives.addToRelationship('x1', 'labels', ['t1']);
    expectTypeOf(archives.relationship('x1', 'creator')).toEqualTypeOf<
      Promise<ReadResult<IdentifierObject<'people'> | null>>
    >();
  });

  it('follows the pages of records, not linkage', async () => {
    const page = await articles.list();
    const linkage = await articles.relationship('a1', 'tags');

    expectTypeOf(articles.next(page)).toEqualTypeOf<
      Promise<typeof page | undefined>
    >();
    // @ts-expect-error -- next and prev page records
    void articles.next(linkage);
  });
});
