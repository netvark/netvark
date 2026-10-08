import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineResource } from 'jsonapi-kit';

import {
  bodyValidator,
  queryValidator,
  relationshipValidator,
} from './validators';

const JSON_API = { 'content-type': 'application/vnd.api+json' };

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body'],
  relationships: {
    author: { type: 'people', cardinality: 'one' },
    tags: { type: 'tags', cardinality: 'many' },
  },
  serialize: (row: { id: string }) => ({ id: row.id }),
  query: { sort: ['title'], filter: { title: ['eq', 'like'] } },
  validate: {
    create: z.object({ title: z.string().min(1), body: z.string().optional() }),
    update: z.object({ title: z.string().min(1).optional() }),
  },
});

interface ErrorBody {
  readonly errors: Array<Record<string, unknown>>;
}

describe('queryValidator', () => {
  const app = new Hono();
  app.get('/articles', queryValidator(Articles), (c) => {
    const query = c.req.valid('query');
    return c.json({ sort: query.sort, filter: query.filter });
  });

  it('stores the parsed query for the handler', async () => {
    const response = await app.request(
      '/articles?sort=-title&filter[title][like]=a%25',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sort: [{ field: 'title', direction: 'desc' }],
      filter: {
        conditions: [{ field: 'title', operator: 'like', value: 'a%' }],
        anyOf: [],
      },
    });
  });

  it('answers an invalid query itself, as JSON:API, without an error handler', async () => {
    const response = await app.request('/articles?sort=nope&foo=1');
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.api+json',
    );
    const body = (await response.json()) as ErrorBody;
    expect(body.errors.map((error) => error['source'])).toEqual([
      { parameter: 'sort' },
      { parameter: 'foo' },
    ]);
  });
});

describe('bodyValidator', () => {
  const app = new Hono();
  app.post('/articles', bodyValidator(Articles, { operation: 'create' }), (c) =>
    c.json(c.req.valid('json'), 201),
  );
  app.patch(
    '/articles/:id',
    bodyValidator(Articles, { operation: 'update' }),
    (c) => c.json(c.req.valid('json')),
  );
  app.patch(
    '/posts/:postId',
    bodyValidator(Articles, { operation: 'update', param: 'postId' }),
    (c) => c.json(c.req.valid('json')),
  );
  app.patch('/broken', bodyValidator(Articles, { operation: 'update' }), (c) =>
    c.json(c.req.valid('json')),
  );

  it('stores the validated create document', async () => {
    const response = await app.request('/articles', {
      method: 'POST',
      headers: JSON_API,
      body: JSON.stringify({
        data: {
          type: 'articles',
          attributes: { title: 'T' },
          relationships: { author: { data: { type: 'people', id: '9' } } },
        },
      }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      type: 'articles',
      attributes: { title: 'T' },
      relationships: { author: { type: 'people', id: '9' } },
    });
  });

  it('renders validation and media type failures as JSON:API', async () => {
    const invalid = await app.request('/articles', {
      method: 'POST',
      headers: JSON_API,
      body: JSON.stringify({ data: { type: 'articles', attributes: {} } }),
    });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()) as ErrorBody).toMatchObject({
      errors: [{ source: { pointer: '/data/attributes/title' } }],
    });
    const wrongType = await app.request('/articles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(wrongType.status).toBe(415);
  });

  it('matches the update id against the route parameter, named or default', async () => {
    const body = JSON.stringify({
      data: { type: 'articles', id: '7', attributes: { title: 'New' } },
    });
    const ok = await app.request('/articles/7', {
      method: 'PATCH',
      headers: JSON_API,
      body,
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      id: '7',
      attributes: { title: 'New' },
    });
    const named = await app.request('/posts/7', {
      method: 'PATCH',
      headers: JSON_API,
      body,
    });
    expect(named.status).toBe(200);
    const mismatch = await app.request('/articles/8', {
      method: 'PATCH',
      headers: JSON_API,
      body,
    });
    expect(mismatch.status).toBe(409);
    expect((await mismatch.json()) as ErrorBody).toMatchObject({
      errors: [{ source: { pointer: '/data/id' } }],
    });
  });

  it('fails loudly when the route has no id parameter', async () => {
    const response = await app.request('/broken', {
      method: 'PATCH',
      headers: JSON_API,
      body: JSON.stringify({ data: { type: 'articles', id: '1' } }),
    });
    expect(response.status).toBe(500);
  });
});

describe('relationshipValidator', () => {
  const app = new Hono();
  app.patch(
    '/articles/:id/relationships/author',
    relationshipValidator(Articles, 'author', 'one'),
    (c) => c.json({ linkage: c.req.valid('json') }),
  );
  app.post(
    '/articles/:id/relationships/tags',
    relationshipValidator(Articles, 'tags', 'many'),
    (c) => c.json({ linkage: c.req.valid('json') }),
  );

  it('rejects definitions that do not match at setup', () => {
    expect(() =>
      relationshipValidator(Articles, 'editor' as 'author', 'one'),
    ).toThrow(/no relationship "editor"/u);
    expect(() => relationshipValidator(Articles, 'tags', 'one')).toThrow(
      /is to-many, not to-one/u,
    );
  });

  it('stores to-one linkage including null, and to-many arrays', async () => {
    const cleared = await app.request('/articles/1/relationships/author', {
      method: 'PATCH',
      headers: JSON_API,
      body: JSON.stringify({ data: null }),
    });
    expect(await cleared.json()).toEqual({ linkage: null });
    const set = await app.request('/articles/1/relationships/author', {
      method: 'PATCH',
      headers: JSON_API,
      body: JSON.stringify({ data: { type: 'people', id: '2' } }),
    });
    expect(await set.json()).toEqual({ linkage: { type: 'people', id: '2' } });
    const added = await app.request('/articles/1/relationships/tags', {
      method: 'POST',
      headers: JSON_API,
      body: JSON.stringify({ data: [{ type: 'tags', id: 't' }] }),
    });
    expect(await added.json()).toEqual({
      linkage: [{ type: 'tags', id: 't' }],
    });
  });

  it('answers a wrong type with 409 at the identifier pointer', async () => {
    const response = await app.request('/articles/1/relationships/author', {
      method: 'PATCH',
      headers: JSON_API,
      body: JSON.stringify({ data: { type: 'robots', id: '2' } }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()) as ErrorBody).toMatchObject({
      errors: [{ source: { pointer: '/data/type' } }],
    });
  });
});
