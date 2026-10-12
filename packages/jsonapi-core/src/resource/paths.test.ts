import type { AnyResource } from './types';

import { describe, expect, it } from 'vitest';

import { defineResource } from './define-resource';
import { resourcePaths } from './paths';

const serialize = (row: { readonly id: string }) => ({
  id: row.id,
  relationships: { author: null, tags: [] },
});

/** A definition with an `author` and a `tags` relationship and the given links. */
function articles(
  links: Parameters<typeof defineResource>[0]['links'],
  type = 'articles',
): AnyResource {
  return defineResource({
    type,
    attributes: [],
    relationships: {
      author: { type: 'people', cardinality: 'one' },
      tags: { type: 'tags', cardinality: 'many' },
    },
    serialize,
    links,
  });
}

describe('resourcePaths', () => {
  it('reads every path from the recommended links of a path base', () => {
    const paths = resourcePaths(articles({ base: '/api/v1' }));
    expect(paths).toEqual({
      origin: undefined,
      collection: '/api/v1/articles',
      resource: '/api/v1/articles/{id}',
      relationships: new Map([
        [
          'author',
          {
            self: '/api/v1/articles/{id}/relationships/author',
            related: '/api/v1/articles/{id}/author',
          },
        ],
        [
          'tags',
          {
            self: '/api/v1/articles/{id}/relationships/tags',
            related: '/api/v1/articles/{id}/tags',
          },
        ],
      ]),
    });
    expect(resourcePaths(articles({ base: '' })).collection).toBe('/articles');
  });

  it('splits an absolute base into the server and the paths', () => {
    const paths = resourcePaths(
      articles({ base: 'https://api.example.com/v1' }),
    );
    expect(paths.origin).toBe('https://api.example.com');
    expect(paths.resource).toBe('/v1/articles/{id}');
    expect(paths.relationships.get('tags')?.related).toBe(
      '/v1/articles/{id}/tags',
    );
  });

  it('keeps a percent-encoded type as the link spells it', () => {
    expect(resourcePaths(articles({ base: '' }, 'blog posts')).resource).toBe(
      '/blog%20posts/{id}',
    );
  });

  it('follows a builder the definition gives, and documents only the relationship links it builds', () => {
    const paths = resourcePaths(
      articles({
        self: (id) => `/v2/writing/${id}`,
        relationship: (id, name) =>
          name === 'author' ? { related: `/v2/writing/${id}/by` } : {},
      }),
    );
    expect(paths.collection).toBe('/v2/writing');
    expect(paths.relationships).toEqual(
      new Map([
        ['author', { related: '/v2/writing/{id}/by' }],
        ['tags', {}],
      ]),
    );
  });

  it.each([
    [{}, /articles has no links\.self/u],
    [{ self: () => '/articles' }, /holds the id once/u],
    [{ self: (id: string) => `/articles/${id}/${id}` }, /holds the id once/u],
    [{ self: (id: string) => `/articles/${id}?v=1` }, /without a query/u],
    [{ self: (id: string) => `/articles/${id}#top` }, /without a query/u],
    [{ self: (id: string) => `articles/${id}` }, /absolute URL or a path/u],
    [{ self: (id: string) => `/articles/${id}/view` }, /end with the id/u],
    [{ self: (id: string) => `/${id}` }, /after the collection's path/u],
    [
      {
        self: (id: string) => `https://a.test/articles/${id}`,
        relationship: (id: string) => ({ related: `https://b.test/x/${id}` }),
      },
      /another origin than links\.self/u,
    ],
    [
      {
        self: (id: string) => `https://a.test/articles/${id}`,
        relationship: (id: string) => ({ self: `/articles/${id}/r` }),
      },
      /another origin than links\.self/u,
    ],
  ] as const)(
    'refuses links it cannot read paths from: %o',
    (links, message) => {
      expect(() => resourcePaths(articles(links))).toThrow(message);
      expect(() => resourcePaths(articles(links))).toThrow(/^resourcePaths: /u);
    },
  );

  it('starts each message with its caller, so the function called names itself', () => {
    expect(() => resourcePaths(articles({}))).toThrow(
      new TypeError(
        'resourcePaths: articles has no links.self, so its paths are unknown; give the definer links.base',
      ),
    );
    expect(() => resourcePaths(articles({}), { caller: 'openapi' })).toThrow(
      new TypeError(
        'openapi: articles has no links.self, so its paths are unknown; give the definer links.base',
      ),
    );
  });
});
