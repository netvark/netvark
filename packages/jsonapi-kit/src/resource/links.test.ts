import { describe, expect, it } from 'vitest';

import { assertLinkBase, resolveLinks } from './links';

const self = (id: string): string => `/posts/${id}`;
const relationship = (): { related: string } => ({ related: '/r' });

describe('resolveLinks', () => {
  it('derives nothing without a base', () => {
    expect(resolveLinks({}, 'articles')).toEqual({});
    expect(resolveLinks({ self }, 'articles')).toEqual({ self });
  });

  it('derives self and the relationship links from the base by the recommended URL design', () => {
    const links = resolveLinks({ base: '' }, 'articles');
    expect(links.self?.('1')).toBe('/articles/1');
    expect(links.relationship?.('1', 'author')).toEqual({
      self: '/articles/1/relationships/author',
      related: '/articles/1/author',
    });
    expect(resolveLinks({ base: '/api/v1' }, 'articles').self?.('1')).toBe(
      '/api/v1/articles/1',
    );
    expect(
      resolveLinks(
        { base: 'https://api.example.com/v1' },
        'articles',
      ).relationship?.('1', 'tags').related,
    ).toBe('https://api.example.com/v1/articles/1/tags');
  });

  it('percent-encodes the type, the id, and the relationship name', () => {
    const links = resolveLinks({ base: '' }, 'blog posts');
    expect(links.self?.('a/b c')).toBe('/blog%20posts/a%2Fb%20c');
    expect(links.relationship?.('1', 'co author').self).toBe(
      '/blog%20posts/1/relationships/co%20author',
    );
  });

  it('lets a given builder win over the derived one', () => {
    const links = resolveLinks({ base: '/api', self }, 'articles');
    expect(links.self).toBe(self);
    expect(links.relationship?.('1', 'author').related).toBe(
      '/api/articles/1/author',
    );
    expect(
      resolveLinks({ base: '/api', relationship }, 'articles').relationship,
    ).toBe(relationship);
  });

  it('rejects a base with a trailing slash, a query, a fragment, or a relative path', () => {
    const rejected = [
      '/',
      '/api/',
      'https://api.test/',
      '/api?x=1',
      '/api#top',
      'api/v1',
      'articles',
    ];
    for (const base of rejected) {
      expect(() => resolveLinks({ base }, 'articles'), base).toThrow(TypeError);
    }
    for (const base of ['', '/api/v1', 'https://api.test', '//cdn.test']) {
      expect(() => {
        assertLinkBase('links.base', base);
      }, base).not.toThrow();
    }
  });
});
