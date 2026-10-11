/**
 * Routes as Hono matches them (resource SPEC 19.2): a link's path decoded
 * as Hono's `getPath` decodes a request's, so an encoded type routes, with
 * `%25` and reserved characters kept encoded and `{id}` as `:id`.
 * @ref https://github.com/honojs/hono/blob/v4.13.13/src/utils/url.ts
 */
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { routeOf } from './paths';

describe('routeOf', () => {
  it.each([
    ['/api/tasks/{id}', '/api/tasks/:id'],
    ['/api/entr%C3%A9es/{id}', '/api/entrées/:id'],
    ['/api/work%20items', '/api/work items'],
    ['/api/100%25/{id}', '/api/100%25/:id'],
    ['/api/a%2Fb/{id}', '/api/a%2Fb/:id'],
    ['/api/%7Bid%7D/{id}', '/api/{id}/:id'],
    ['', ''],
  ])('writes %s as %s', (path, route) => {
    expect(routeOf(path)).toBe(route);
  });

  it.each([
    ['/api/entr%C3%A9es/{id}', '/api/entr%C3%A9es/7', '7'],
    ['/api/100%25/{id}', '/api/100%25/7', '7'],
    ['/api/a%2Fb/{id}', '/api/a%2Fb/7', '7'],
    ['/api/work%20items/{id}', '/api/work%20items/a%2Fb', 'a/b'],
  ])('matches what the link %s names: %s', async (path, url, id) => {
    const app = new Hono();
    app.get(routeOf(path), (c) => c.text(c.req.param('id') ?? ''));
    const response = await app.request(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(id);
  });
});
