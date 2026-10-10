import type { ResourceLinksInit } from './links';

import { describe, expect, it } from 'vitest';

import { createDefineResource } from './create-define-resource';

interface Row {
  readonly id: string;
  readonly title: string;
}

const define = createDefineResource({ links: { base: '/api/v1' } });
const self = (id: string): string => `/api/v1/posts/${id}`;

function articles(links?: ResourceLinksInit) {
  return define({
    type: 'articles',
    attributes: ['title'],
    relationships: { author: { type: 'people', cardinality: 'one' } },
    serialize: (row: Row) => ({
      id: row.id,
      attributes: { title: row.title },
      relationships: { author: null },
    }),
    ...(links === undefined ? {} : { links }),
  });
}

describe('createDefineResource', () => {
  it('applies the links default to every definition', () => {
    const resource = articles();
    expect(resource.links.self?.('1')).toBe('/api/v1/articles/1');
    expect(resource.links.relationship?.('1', 'author')).toEqual({
      self: '/api/v1/articles/1/relationships/author',
      related: '/api/v1/articles/1/author',
    });
  });

  it("merges a definition's links over the default, member by member", () => {
    const overridden = articles({ self });
    expect(overridden.links.self).toBe(self);
    expect(overridden.links.relationship?.('1', 'author').related).toBe(
      '/api/v1/articles/1/author',
    );
    expect(articles({ base: 'https://api.test' }).links.self?.('1')).toBe(
      'https://api.test/articles/1',
    );
    expect(articles({ base: undefined }).links).toEqual({});
  });

  it('validates the default base when the definer is created', () => {
    expect(() => createDefineResource({ links: { base: '/api/' } })).toThrow(
      TypeError,
    );
    expect(() => createDefineResource({})).not.toThrow();
  });

  it('keeps every other check of defineResource', () => {
    expect(() =>
      define({
        type: 'bad name!',
        attributes: [],
        serialize: () => ({ id: '1' }),
      }),
    ).toThrow(/type/u);
  });
});
