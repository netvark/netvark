/**
 * Relationships in records (SPEC 15.6, ADR 0019): linkage off the include
 * paths, records on them in linkage order, every segment of a path
 * resolved, a tree that never reaches itself, and a linked resource the
 * document leaves out left out, its identifier kept in `$relationships`.
 */
import { describe, expect, it } from 'vitest';

import { COMPOUND } from '../test-support/compound';
import { deserialize } from './deserialize';

function recordAt(value: unknown): Readonly<Record<string, unknown>> {
  expect(value).toBeTypeOf('object');
  return value as Readonly<Record<string, unknown>>;
}

describe('relationships (SPEC 15.6)', () => {
  it('are their linkage off the include paths; $relationships holds each object as sent', () => {
    const data = recordAt(deserialize(COMPOUND).data);
    expect(data['author']).toStrictEqual({ type: 'people', id: '9' });
    expect(data['tags']).toStrictEqual([
      { type: 'tags', id: 't2' },
      { type: 'tags', id: 't1' },
    ]);
    expect(recordAt(data['$relationships'])['author']).toStrictEqual({
      links: { related: '/articles/1/author' },
      data: { type: 'people', id: '9', meta: { role: 'lead' } },
    });
  });

  it('are null for an empty to-one, and undefined without data', () => {
    const data = recordAt(
      deserialize({
        data: {
          type: 'articles',
          id: '1',
          relationships: {
            author: { data: null },
            tags: { links: { related: '/articles/1/tags' } },
          },
        },
      }).data,
    );
    expect(data['author']).toBeNull();
    expect(data['tags']).toBeUndefined();
    expect(Object.hasOwn(data, 'tags')).toBe(true);
  });

  it('resolve on the include paths into the included records, in linkage order', () => {
    const data = recordAt(
      deserialize(COMPOUND, { include: ['author', 'tags'] }).data,
    );
    expect(data['author']).toStrictEqual({
      type: 'people',
      id: '9',
      name: 'Ada',
      articles: [
        { type: 'articles', id: '1' },
        { type: 'articles', id: '2' },
      ],
      $relationships: {
        articles: {
          data: [
            { type: 'articles', id: '1' },
            { type: 'articles', id: '2' },
          ],
        },
      },
    });
    expect(
      (data['tags'] as ReadonlyArray<Record<string, unknown>>).map(
        (tag) => tag['name'],
      ),
    ).toEqual(['api', 'json']);
  });

  it('resolve every segment of a path, the primary data among the resources found', () => {
    const data = recordAt(
      deserialize(COMPOUND, { include: ['author.articles'] }).data,
    );
    const author = recordAt(data['author']);
    const articles = author['articles'] as ReadonlyArray<
      Record<string, unknown>
    >;
    expect(articles.map((article) => article['title'])).toEqual([
      'JSON:API',
      'REST',
    ]);
    // Resolved as far as its own path: the article reached again is linkage below it.
    expect(articles[0]?.['author']).toStrictEqual({ type: 'people', id: '9' });
    expect(data['tags']).toStrictEqual([
      { type: 'tags', id: 't2' },
      { type: 'tags', id: 't1' },
    ]);
  });

  it('form a tree: a record never reaches itself, so the result serializes and clones', () => {
    const result = deserialize(COMPOUND, {
      include: ['author.articles', 'tags'],
    });
    const data = recordAt(result.data);
    const again = (
      recordAt(data['author'])['articles'] as ReadonlyArray<unknown>
    )[0];
    expect(again).not.toBe(data);
    expect(again).toStrictEqual({
      ...data,
      author: { type: 'people', id: '9' },
      tags: [
        { type: 'tags', id: 't2' },
        { type: 'tags', id: 't1' },
      ],
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(structuredClone(result)).toStrictEqual(result);
  });

  it('leave out a linked resource the document does not include; $relationships keeps its identifier', () => {
    const document = {
      data: {
        type: 'articles',
        id: '1',
        relationships: {
          author: { data: { type: 'people', id: '404' } },
          tags: {
            data: [
              { type: 'tags', id: 't1' },
              { type: 'tags', id: 'missing' },
            ],
          },
        },
      },
      included: [{ type: 'tags', id: 't1', attributes: { name: 'json' } }],
    };
    const data = recordAt(
      deserialize(document, { include: ['author', 'tags'] }).data,
    );
    expect(data['author']).toBeUndefined();
    expect(data['tags']).toStrictEqual([
      { type: 'tags', id: 't1', name: 'json' },
    ]);
    expect(recordAt(data['$relationships'])['author']).toStrictEqual({
      data: { type: 'people', id: '404' },
    });
  });
});
