/**
 * Creating, updating, and deleting resources and relationships over HTTP
 * (SPEC 9, 10.4): request document validation with pointers, the 201 with
 * `Location`, 204 responses, and the relationship endpoints.
 * @ref https://jsonapi.org/format/1.1/#crud
 */
import { describe, expect, it } from 'vitest';

import { BASE_URL } from './support/blog.ts';
import { JSON_API, document, useBlog } from './support/http.ts';

interface Doc {
  readonly data?:
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | null;
  readonly errors?: Array<Record<string, unknown>>;
}

describe('mutations', () => {
  const blog = useBlog();

  it('creates a resource: 201, Location equal to self, and the server-assigned id', async () => {
    const { status, headers, body } = await blog.request(
      '/articles',
      document('POST', {
        data: {
          type: 'articles',
          attributes: { title: 'New' },
          relationships: {
            author: { data: { type: 'people', id: '2' } },
            tags: { data: [{ type: 'tags', id: 't3' }] },
          },
        },
      }),
    );
    expect(status).toBe(201);
    expect(headers.get('location')).toBe(`${BASE_URL}/articles/6`);
    expect(headers.get('content-type')).toBe(JSON_API);
    expect((body as Doc).data).toMatchObject({
      type: 'articles',
      id: '6',
      attributes: { title: 'New', body: '' },
      relationships: {
        author: { data: { type: 'people', id: '2' } },
        tags: { data: [{ type: 'tags', id: 't3' }] },
      },
      links: { self: `${BASE_URL}/articles/6` },
    });
  });

  it('rejects bad request documents with the right status and pointers', async () => {
    const cases: Array<[unknown, number, string]> = [
      [
        { data: { type: 'people', attributes: { title: 'x' } } },
        409,
        '/data/type',
      ],
      [
        { data: { type: 'articles', id: '1', attributes: { title: 'x' } } },
        403,
        '/data/id',
      ],
      [
        { data: { type: 'articles', attributes: {} } },
        422,
        '/data/attributes/title',
      ],
      [
        { data: { type: 'articles', attributes: { title: 'x', nope: 1 } } },
        400,
        '/data/attributes/nope',
      ],
      [{ meta: {} }, 400, ''],
    ];
    for (const [payload, status, pointer] of cases) {
      const reply = await blog.request('/articles', document('POST', payload));
      expect(reply.status, JSON.stringify(payload)).toBe(status);
      expect(
        (reply.body as Doc).errors?.[0]?.['source'],
        JSON.stringify(payload),
      ).toEqual({ pointer });
    }
    const wrongType = await blog.request('/articles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(wrongType.status).toBe(415);
    const malformed = await blog.request('/articles', {
      ...document('POST', {}),
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect((malformed.body as Doc).errors?.[0]?.['code']).toBe(
      'MALFORMED_JSON',
    );
  });

  it('updates a resource and rejects an id that does not match the URL', async () => {
    const ok = await blog.request(
      '/articles/2',
      document('PATCH', {
        data: { type: 'articles', id: '2', attributes: { title: 'Renamed' } },
      }),
    );
    expect(ok.status).toBe(200);
    expect((ok.body as Doc).data).toMatchObject({
      id: '2',
      attributes: { title: 'Renamed', body: 'B' },
    });
    const mismatch = await blog.request(
      '/articles/2',
      document('PATCH', { data: { type: 'articles', id: '3' } }),
    );
    expect(mismatch.status).toBe(409);
    expect((mismatch.body as Doc).errors?.[0]?.['source']).toEqual({
      pointer: '/data/id',
    });
  });

  it('serves and updates relationships, answering 204 without a body', async () => {
    const author = await blog.request('/articles/1/relationships/author');
    expect(author.body).toEqual({
      jsonapi: { version: '1.1' },
      links: {
        self: `${BASE_URL}/articles/1/relationships/author`,
        related: `${BASE_URL}/articles/1/author`,
      },
      data: { type: 'people', id: '1' },
    });
    const cleared = await blog.request(
      '/articles/1/relationships/author',
      document('PATCH', { data: null }),
    );
    expect(cleared.status).toBe(204);
    expect(cleared.body).toBeUndefined();
    expect(blog.store().articles.get('1')?.authorId).toBeNull();

    const added = await blog.request(
      '/articles/1/relationships/tags',
      document('POST', { data: [{ type: 'tags', id: 't3' }] }),
    );
    expect(added.status).toBe(204);
    const removed = await blog.request(
      '/articles/1/relationships/tags',
      document('DELETE', { data: [{ type: 'tags', id: 't1' }] }),
    );
    expect(removed.status).toBe(204);
    const tags = await blog.request('/articles/1/relationships/tags');
    expect((tags.body as Doc).data).toEqual([
      { type: 'tags', id: 't2' },
      { type: 'tags', id: 't3' },
    ]);
    const wrong = await blog.request(
      '/articles/1/relationships/tags',
      document('PATCH', { data: [{ type: 'people', id: '1' }] }),
    );
    expect(wrong.status).toBe(409);
    expect((wrong.body as Doc).errors?.[0]?.['source']).toEqual({
      pointer: '/data/0/type',
    });
  });

  it('deletes a resource with 204 and then 404s it', async () => {
    const deleted = await blog.request('/articles/5', { method: 'DELETE' });
    expect(deleted.status).toBe(204);
    expect((await blog.request('/articles/5')).status).toBe(404);
  });
});
