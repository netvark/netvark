import type { AnyResource } from '../resource/types';

import { describe, expect, it } from 'vitest';

import { parseQuery } from '../query/parse-query';
import { defineResource } from '../resource/define-resource';
import {
  collectionDocument,
  include,
  jsonApiObject,
  resourceDocument,
  toManyRelationshipDocument,
  toOneRelationshipDocument,
} from './build';

interface PersonRow {
  readonly id: string;
  readonly name: string;
  readonly bossId?: string | null;
}

interface ArticleRow {
  readonly id: string;
  readonly title: string;
  readonly authorId: string | null;
  readonly commentIds: ReadonlyArray<string>;
}

interface CommentRow {
  readonly id: string;
  readonly body: string;
  readonly authorId: string;
}

const People = defineResource({
  type: 'people',
  attributes: ['name'],
  relationships: {
    boss: {
      type: 'people',
      cardinality: 'one',
      resource: (): AnyResource => People,
    },
  },
  serialize: (row: PersonRow) => ({
    id: row.id,
    attributes: { name: row.name },
    relationships: row.bossId === undefined ? undefined : { boss: row.bossId },
  }),
});

const Comments = defineResource({
  type: 'comments',
  attributes: ['body'],
  relationships: {
    author: { type: 'people', cardinality: 'one', resource: () => People },
  },
  serialize: (row: CommentRow) => ({
    id: row.id,
    attributes: { body: row.body },
    relationships: { author: row.authorId },
  }),
});

const Articles = defineResource({
  type: 'articles',
  attributes: ['title'],
  relationships: {
    author: { type: 'people', cardinality: 'one', resource: () => People },
    comments: {
      type: 'comments',
      cardinality: 'many',
      resource: () => Comments,
    },
  },
  serialize: (row: ArticleRow) => ({
    id: row.id,
    attributes: { title: row.title },
    relationships: { author: row.authorId, comments: row.commentIds },
  }),
  query: { include: ['author', 'comments.author', 'author.boss'] },
});

const article: ArticleRow = {
  id: '1',
  title: 'T',
  authorId: '9',
  commentIds: ['5', '12'],
};
const dan: PersonRow = { id: '9', name: 'Dan', bossId: null };
const comments: Array<CommentRow> = [
  { id: '5', body: 'First!', authorId: '2' },
  { id: '12', body: 'I like XML better', authorId: '9' },
];
const two: PersonRow = { id: '2', name: 'Two' };

describe('jsonApiObject', () => {
  it('advertises version 1.1 and keeps overrides', () => {
    expect(jsonApiObject()).toEqual({ version: '1.1' });
    expect(jsonApiObject({ ext: ['https://x'], profile: undefined })).toEqual({
      version: '1.1',
      ext: ['https://x'],
    });
  });
});

describe('resourceDocument', () => {
  it('builds a single resource document with jsonapi, links, and meta first', () => {
    const document = resourceDocument(Articles, article, {
      links: { self: '/articles/1' },
      meta: { copyright: 'x' },
    });
    expect(Object.keys(document)).toEqual(['jsonapi', 'links', 'meta', 'data']);
    expect(document.data).toMatchObject({ type: 'articles', id: '1' });
    expect(document.included).toBeUndefined();
  });

  it('represents a missing resource as data: null', () => {
    expect(resourceDocument(Articles, null)).toEqual({
      jsonapi: { version: '1.1' },
      data: null,
    });
  });

  it('applies sparse fieldsets to primary and included resources', () => {
    const query = parseQuery(
      Articles,
      'include=author&fields[articles]=title&fields[people]=',
    );
    const document = resourceDocument(Articles, article, {
      query,
      included: [include(People, [dan])],
    });
    expect(document.data).toEqual({
      type: 'articles',
      id: '1',
      attributes: { title: 'T' },
    });
    expect(document.included).toEqual([{ type: 'people', id: '9' }]);
  });
});

describe('collectionDocument and compound documents', () => {
  it('builds included with full linkage, in order, deduplicated by type and id', () => {
    const query = parseQuery(Articles, 'include=comments.author,author');
    const document = collectionDocument(Articles, [article], {
      query,
      included: [include(Comments, comments), include(People, [dan, two, dan])],
    });
    expect(document.included?.map((r) => `${r.type}:${r.id}`)).toEqual([
      'comments:5',
      'comments:12',
      'people:9',
      'people:2',
    ]);
  });

  it('emits an empty included array when include was requested and nothing matched', () => {
    const query = parseQuery(Articles, 'include=author');
    expect(collectionDocument(Articles, [], { query }).included).toEqual([]);
    expect(
      collectionDocument(Articles, [], { query, included: [] }).included,
    ).toEqual([]);
    expect(collectionDocument(Articles, []).included).toBeUndefined();
    expect(
      collectionDocument(Articles, [], { included: [] }).included,
    ).toBeUndefined();
    const empty = parseQuery(Articles, 'include=');
    expect(
      collectionDocument(Articles, [article], { query: empty }).included,
    ).toEqual([]);
  });

  it('never repeats a primary resource in included (one object per type and id)', () => {
    const boss: PersonRow = { id: '1', name: 'Boss', bossId: '2' };
    const report: PersonRow = { id: '2', name: 'Report', bossId: '3' };
    const other: PersonRow = { id: '3', name: 'Other', bossId: null };
    const document = collectionDocument(People, [boss, report], {
      included: [include(People, [report, boss, other])],
    });
    expect(document.included?.map((resource) => resource.id)).toEqual(['3']);
  });

  it('rejects included resources that are not linked from the primary data', () => {
    expect(() =>
      collectionDocument(Articles, [article], {
        included: [include(People, [{ id: '42', name: 'Nobody' }])],
      }),
    ).toThrow(/people:42 is not linked from the primary data/u);
  });

  it('rejects included resources outside the requested include paths', () => {
    const query = parseQuery(Articles, 'include=author');
    expect(() =>
      collectionDocument(Articles, [article], {
        query,
        included: [include(People, [dan]), include(Comments, comments)],
      }),
    ).toThrow(
      /comments:5 is not reachable through the requested include paths/u,
    );
  });

  it('allows related resources without include (an endpoint may include by default)', () => {
    const document = collectionDocument(Articles, [article], {
      included: [
        include(People, [dan]),
        include(Comments, comments),
        include(People, [two]),
      ],
    });
    expect(document.included).toHaveLength(4);
  });

  it('honors the sparse fieldset exception: linkage removed from output still counts', () => {
    const query = parseQuery(
      Articles,
      'include=comments.author&fields[comments]=body',
    );
    const document = collectionDocument(Articles, [article], {
      query,
      included: [include(Comments, comments), include(People, [dan, two])],
    });
    expect(document.included?.find((r) => r.id === '5')).toEqual({
      type: 'comments',
      id: '5',
      attributes: { body: 'First!' },
    });
    expect(document.included?.filter((r) => r.type === 'people')).toHaveLength(
      2,
    );
  });

  it('follows chains through included resources', () => {
    const query = parseQuery(Articles, 'include=author.boss');
    const boss: PersonRow = { id: '7', name: 'Boss' };
    const withBoss: PersonRow = { ...dan, bossId: '7' };
    const document = collectionDocument(Articles, [article], {
      query,
      included: [include(People, [boss, withBoss])],
    });
    expect(document.included?.map((r) => r.id)).toEqual(['7', '9']);
  });
});

describe('relationship documents', () => {
  it('carry identifiers only', () => {
    expect(
      toOneRelationshipDocument(People, dan, {
        links: { self: '/a/1/relationships/author' },
      }),
    ).toEqual({
      jsonapi: { version: '1.1' },
      links: { self: '/a/1/relationships/author' },
      data: { type: 'people', id: '9' },
    });
    expect(toOneRelationshipDocument(People, null).data).toBeNull();
    expect(toManyRelationshipDocument(Comments, comments).data).toEqual([
      { type: 'comments', id: '5' },
      { type: 'comments', id: '12' },
    ]);
    expect(toManyRelationshipDocument(Comments, []).data).toEqual([]);
  });
});
