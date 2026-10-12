import { describe, expect, it } from 'vitest';

import { assertOrigin, atOrigin } from './origin';

const NOT_AN_ORIGIN =
  'createTransport: origin must be an absolute http: or https: URL with no user information, path, query, or fragment';

describe('assertOrigin (SPEC 15.2)', () => {
  it.each([
    ['https://api.example.com', 'https://api.example.com'],
    ['https://api.example.com/', 'https://api.example.com'],
    ['http://localhost:8080', 'http://localhost:8080'],
    ['HTTPS://API.Example.COM:443/', 'https://api.example.com'],
    ['http://[::1]:3000', 'http://[::1]:3000'],
    ['https://bücher.example', 'https://xn--bcher-kva.example'],
  ])('keeps %s as its origin, %s', (origin, expected) => {
    expect(assertOrigin(origin)).toBe(expected);
  });

  it.each([
    ['a path', 'https://api.example.com/v1'],
    ['a query', 'https://api.example.com/?debug=1'],
    ['an empty query', 'https://api.example.com/?'],
    ['a fragment', 'https://api.example.com/#top'],
    ['user information', 'https://user:secret@api.example.com'],
    ['a user name alone', 'https://user@api.example.com'],
    ['another scheme', 'ftp://api.example.com'],
    ['a relative reference', '/api'],
    ['no URL', 'api.example.com'],
  ])('refuses %s with a message that quotes nothing of it', (_, origin) => {
    expect(() => assertOrigin(origin)).toThrow(new TypeError(NOT_AN_ORIGIN));
  });
});

describe('atOrigin (SPEC 15.8, ADR 0017)', () => {
  const origin = 'https://api.example.com';

  it.each([
    ['a root-relative link', '/articles?page%5Bafter%5D=x'],
    ['an absolute link on the origin', 'https://api.example.com/articles'],
    ['a link with the default port', 'https://api.example.com:443/articles'],
  ])('follows %s', (_, link) => {
    expect(atOrigin(origin, link)?.origin).toBe(origin);
  });

  it('keeps the query as the server wrote it', () => {
    const link = '/articles?page[after]=a%2Cb&include=author';

    expect(atOrigin(origin, link)?.href).toBe(`${origin}${link}`);
  });

  it.each([
    ['another origin', 'https://elsewhere.example/articles'],
    ['another scheme', 'http://api.example.com/articles'],
    ['another port', 'https://api.example.com:8443/articles'],
    ['a network-path reference', '//elsewhere.example/articles'],
    [
      'a backslash the parser reads as a slash',
      '/\\elsewhere.example/articles',
    ],
    ['a relative path', 'articles?page%5Bafter%5D=x'],
    ['a query alone', '?page%5Bafter%5D=x'],
    ['a scheme without an origin', 'data:text/plain,x'],
  ])('refuses %s', (_, link) => {
    expect(atOrigin(origin, link)).toBeUndefined();
  });
});
