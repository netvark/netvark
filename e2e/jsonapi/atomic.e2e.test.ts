/**
 * The Atomic Operations extension over HTTP (SPEC 11): the request
 * requirements, results in operation order, local ids across operations,
 * 204 for data-less results, and all-or-nothing failure.
 * @ref https://jsonapi.org/ext/atomic/
 */
import { describe, expect, it } from 'vitest';

import { JSON_API, useBlog } from './support/http.ts';

const ATOMIC = 'https://jsonapi.org/ext/atomic';
const MEDIA_TYPE = `${JSON_API}; ext="${ATOMIC}"`;

interface Results {
  readonly jsonapi?: Record<string, unknown>;
  readonly 'atomic:results'?: Array<{ data?: Record<string, unknown> }>;
  readonly errors?: Array<Record<string, unknown>>;
}

describe('atomic operations', () => {
  const blog = useBlog();

  function operations(
    list: ReadonlyArray<unknown>,
    contentType = MEDIA_TYPE,
  ): RequestInit {
    return {
      method: 'POST',
      headers: { 'content-type': contentType, accept: MEDIA_TYPE },
      body: JSON.stringify({ 'atomic:operations': list }),
    };
  }

  it('creates linked resources with a lid and answers with positional results', async () => {
    const { status, headers, body } = await blog.request(
      '/operations',
      operations([
        {
          op: 'add',
          data: {
            type: 'people',
            lid: 'author',
            attributes: { name: 'New Author' },
          },
        },
        {
          op: 'add',
          data: {
            type: 'articles',
            attributes: { title: 'Linked' },
            relationships: {
              author: { data: { type: 'people', lid: 'author' } },
            },
          },
        },
        {
          op: 'add',
          ref: { type: 'articles', id: '1', relationship: 'tags' },
          data: [{ type: 'tags', id: 't3' }],
        },
      ]),
    );
    expect(status).toBe(200);
    expect(headers.get('content-type')).toBe(MEDIA_TYPE);
    expect(headers.get('vary')).toBe('Accept');
    const results = (body as Results)['atomic:results'];
    expect((body as Results).jsonapi).toEqual({
      version: '1.1',
      ext: [ATOMIC],
    });
    expect(results?.[0]?.data).toMatchObject({ type: 'people', id: '6' });
    expect(results?.[1]?.data).toMatchObject({
      type: 'articles',
      id: '7',
      relationships: { author: { data: { type: 'people', id: '6' } } },
    });
    expect(results?.[2]).toEqual({});
    expect(blog.store().articles.get('1')?.tagIds).toEqual(['t1', 't2', 't3']);
  });

  it('answers 204 when no operation returns data', async () => {
    const { status, body } = await blog.request(
      '/operations',
      operations([
        {
          op: 'update',
          ref: { type: 'articles', id: '2', relationship: 'author' },
          data: null,
        },
        { op: 'remove', ref: { type: 'articles', id: '3' } },
      ]),
    );
    expect(status).toBe(204);
    expect(body).toBeUndefined();
    expect(blog.store().articles.has('3')).toBe(false);
  });

  it('rolls back every operation when one fails and points at it', async () => {
    const before = blog.store().articles.size;
    const { status, body } = await blog.request(
      '/operations',
      operations([
        {
          op: 'add',
          data: { type: 'articles', attributes: { title: 'Will vanish' } },
        },
        { op: 'remove', ref: { type: 'articles', id: '404' } },
      ]),
    );
    expect(status).toBe(404);
    expect((body as Results).errors?.[0]).toMatchObject({
      code: 'NOT_FOUND',
      source: { pointer: '/atomic:operations/1' },
    });
    expect(blog.store().articles.size).toBe(before);
    expect(blog.store().rollbacks).toBe(1);
  });

  it('requires the extension on the request and rejects malformed documents', async () => {
    const plain = await blog.request('/operations', operations([], JSON_API));
    expect(plain.status).toBe(415);
    const bad = await blog.request(
      '/operations',
      operations([{ op: 'patch' }, { op: 'add', ref: {}, href: '/x' }]),
    );
    expect(bad.status).toBe(400);
    expect((bad.body as Results).errors?.map((e) => e['source'])).toEqual([
      { pointer: '/atomic:operations/0/op' },
      { pointer: '/atomic:operations/1' },
    ]);
  });
});
