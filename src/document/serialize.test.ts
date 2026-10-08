import { describe, expect, it } from 'vitest';

import { defineResource } from '../resource/define-resource';
import { applyFields, identify, linkage, serializeResource } from './serialize';

interface ArticleRow {
  readonly id: number;
  readonly title: string;
  readonly body?: string;
  readonly authorId: string | null;
  readonly tagIds: ReadonlyArray<string>;
}

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body'],
  relationships: {
    author: { type: 'people', cardinality: 'one' },
    tags: { type: 'tags', cardinality: 'many' },
    owner: { type: 'people', cardinality: 'one' },
  },
  serialize: (row: ArticleRow) => ({
    id: String(row.id),
    attributes: { title: row.title, body: row.body },
    relationships: {
      author: row.authorId,
      tags: row.tagIds,
      owner: {
        data: { type: 'organizations', id: 'org-1' },
        meta: { via: 'policy' },
      },
    },
    meta: { version: 3 },
  }),
  links: {
    self: (id) => `/articles/${id}`,
    relationship: (id, name) => ({
      self: `/articles/${id}/relationships/${name}`,
      related: `/articles/${id}/${name}`,
    }),
  },
});

const row: ArticleRow = {
  id: 1,
  title: 'Hi',
  authorId: '9',
  tagIds: ['t1', 't2'],
};

describe('serializeResource', () => {
  it('builds a complete resource object with string id, linkage, links, and meta', () => {
    expect(serializeResource(Articles, row)).toEqual({
      type: 'articles',
      id: '1',
      attributes: { title: 'Hi' },
      relationships: {
        author: {
          links: {
            self: '/articles/1/relationships/author',
            related: '/articles/1/author',
          },
          data: { type: 'people', id: '9' },
        },
        tags: {
          links: {
            self: '/articles/1/relationships/tags',
            related: '/articles/1/tags',
          },
          data: [
            { type: 'tags', id: 't1' },
            { type: 'tags', id: 't2' },
          ],
        },
        owner: {
          links: {
            self: '/articles/1/relationships/owner',
            related: '/articles/1/owner',
          },
          data: { type: 'organizations', id: 'org-1' },
          meta: { via: 'policy' },
        },
      },
      links: { self: '/articles/1' },
      meta: { version: 3 },
    });
  });

  it('keeps member order type, id, attributes, relationships, links, meta', () => {
    expect(Object.keys(serializeResource(Articles, row))).toEqual([
      'type',
      'id',
      'attributes',
      'relationships',
      'links',
      'meta',
    ]);
  });

  it('omits empty attributes and relationships members and null to-one linkage stays', () => {
    const Bare = defineResource({
      type: 'bare',
      attributes: ['x'],
      relationships: { parent: { type: 'bare', cardinality: 'one' } },
      serialize: (r: { id: string }) => ({
        id: r.id,
        attributes: { x: undefined },
        relationships: { parent: null },
      }),
    });
    expect(serializeResource(Bare, { id: 'b' })).toEqual({
      type: 'bare',
      id: 'b',
      relationships: { parent: { data: null } },
    });
  });

  it('rejects a non-string id, undeclared relationships, and empty relationship objects', () => {
    const BadId = defineResource({
      type: 'bad',
      attributes: [],
      serialize: (r: { id: number }) => ({ id: r.id as unknown as string }),
    });
    expect(() => serializeResource(BadId, { id: 1 })).toThrow(
      /must return a string id/u,
    );
    const Undeclared = defineResource({
      type: 'bad',
      attributes: [],
      relationships: { a: { type: 'x', cardinality: 'one' } },
      serialize: (r: { id: string }) => ({
        id: r.id,
        relationships: { b: null } as unknown as { a: null },
      }),
    });
    expect(() => serializeResource(Undeclared, { id: '1' })).toThrow(
      /undeclared relationship "b"/u,
    );
    const Empty = defineResource({
      type: 'bad',
      attributes: [],
      relationships: { a: { type: 'x', cardinality: 'one' } },
      serialize: (r: { id: string }) => ({
        id: r.id,
        relationships: { a: {} },
      }),
    });
    expect(() => serializeResource(Empty, { id: '1' })).toThrow(
      /must carry at least one of links, data, or meta/u,
    );
  });
});

describe('linkage', () => {
  const one = { type: 'people', cardinality: 'one' } as const;
  const many = { type: 'tags', cardinality: 'many' } as const;

  it('enforces cardinality and builds identifiers from ids', () => {
    expect(linkage('9', one, 'author')).toEqual({ type: 'people', id: '9' });
    expect(linkage(null, one, 'author')).toBeNull();
    expect(linkage({ type: 'orgs', id: '1' }, one, 'author')).toEqual({
      type: 'orgs',
      id: '1',
    });
    expect(linkage([], many, 'tags')).toEqual([]);
    expect(linkage(['a', 'b'], many, 'tags')).toEqual([
      { type: 'tags', id: 'a' },
      { type: 'tags', id: 'b' },
    ]);
    expect(linkage([{ type: 'labels', id: 'b' }], many, 'tags')).toEqual([
      { type: 'labels', id: 'b' },
    ]);
    expect(() => linkage(['a'], one, 'author')).toThrow(/is to-one/u);
    expect(() => linkage('a', many, 'tags')).toThrow(/is to-many/u);
    expect(() => linkage(null, many, 'tags')).toThrow(/is to-many/u);
  });
});

describe('applyFields', () => {
  const complete = serializeResource(Articles, row);

  it('keeps only the named fields, never type, id, links, or meta', () => {
    expect(applyFields(complete, ['title', 'tags'])).toEqual({
      type: 'articles',
      id: '1',
      attributes: { title: 'Hi' },
      relationships: { tags: complete.relationships?.['tags'] },
      links: { self: '/articles/1' },
      meta: { version: 3 },
    });
  });

  it('drops both members for an empty fieldset', () => {
    expect(Object.keys(applyFields(complete, []))).toEqual([
      'type',
      'id',
      'links',
      'meta',
    ]);
  });
});

describe('identify', () => {
  it('returns type and id only', () => {
    expect(identify(Articles, row)).toEqual({ type: 'articles', id: '1' });
  });
});
