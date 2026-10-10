/**
 * Fetching resources over HTTP (SPEC 7, 6): primary data, compound
 * documents through `include`, sparse fieldsets, sorting, filtering, the
 * media type and `Vary` on every response, and the 404 and 400 documents
 * the specification requires.
 * @ref https://jsonapi.org/format/1.1/#fetching
 */
import { describe, expect, it } from 'vitest';

import { BASE_URL } from './support/blog.ts';
import { JSON_API, useBlog } from './support/http.ts';

interface Doc {
  readonly data:
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | null;
  readonly included?: Array<Record<string, unknown>>;
  readonly errors?: Array<Record<string, unknown>>;
  readonly links?: Record<string, unknown>;
  readonly meta?: Record<string, unknown>;
}

describe('fetching', () => {
  const blog = useBlog();

  it('serves a resource with links and relationship linkage', async () => {
    const { status, headers, body } = await blog.request('/articles/1');
    expect(status).toBe(200);
    expect(headers.get('content-type')).toBe(JSON_API);
    expect(headers.get('vary')).toBe('Accept');
    expect(body).toEqual({
      jsonapi: { version: '1.1' },
      links: { self: `${BASE_URL}/articles/1` },
      data: {
        type: 'articles',
        id: '1',
        attributes: {
          title: 'JSON:API paints my bikeshed!',
          body: 'A',
          createdAt: '2026-01-01T00:00:00Z',
        },
        relationships: {
          author: {
            links: {
              self: `${BASE_URL}/articles/1/relationships/author`,
              related: `${BASE_URL}/articles/1/author`,
            },
            data: { type: 'people', id: '1' },
          },
          tags: {
            links: {
              self: `${BASE_URL}/articles/1/relationships/tags`,
              related: `${BASE_URL}/articles/1/tags`,
            },
            data: [
              { type: 'tags', id: 't1' },
              { type: 'tags', id: 't2' },
            ],
          },
        },
        links: { self: `${BASE_URL}/articles/1` },
      },
    });
  });

  it('builds compound documents with sparse fieldsets applied to included resources', async () => {
    const { body } = await blog.request(
      '/articles/1?include=author,tags&fields[people]=name&fields[articles]=title,author',
    );
    const doc = body as Doc;
    expect(doc.data).toEqual({
      type: 'articles',
      id: '1',
      attributes: { title: 'JSON:API paints my bikeshed!' },
      relationships: {
        author: {
          links: {
            self: `${BASE_URL}/articles/1/relationships/author`,
            related: `${BASE_URL}/articles/1/author`,
          },
          data: { type: 'people', id: '1' },
        },
      },
      links: { self: `${BASE_URL}/articles/1` },
    });
    expect(
      doc.included?.map((r) => `${String(r['type'])}:${String(r['id'])}`),
    ).toEqual(['people:1', 'tags:t1', 'tags:t2']);
    expect(doc.included?.[0]).toEqual({
      type: 'people',
      id: '1',
      attributes: { name: 'Dan Gebhardt' },
      links: { self: `${BASE_URL}/people/1` },
    });
  });

  it('follows a nested include path and emits an empty included for include=', async () => {
    const { body } = await blog.request(
      '/articles/3?include=author.articles&fields[articles]=title',
    );
    const doc = body as Doc;
    expect(
      doc.included?.map((r) => `${String(r['type'])}:${String(r['id'])}`),
    ).toEqual(['people:2']);
    const empty = (await blog.request('/articles/3?include=')).body as Doc;
    expect(empty.included).toEqual([]);
  });

  it('sorts and filters the collection', async () => {
    const titles = async (query: string): Promise<Array<unknown>> => {
      const { status, body } = await blog.request(`/articles?${query}`);
      expect(status, query).toBe(200);
      return ((body as Doc).data as Array<Record<string, unknown>>).map(
        (row) => (row['attributes'] as Record<string, unknown>)['title'],
      );
    };
    expect(await titles('sort=-title&page[size]=3')).toEqual([
      'Rails is Omakase',
      'Nanoseconds',
      'JSON:API paints my bikeshed!',
    ]);
    expect(await titles('filter[author]=3&sort=title')).toEqual([
      'Compilers',
      'Nanoseconds',
    ]);
    expect(await titles('filter[title][like]=omakase')).toEqual([
      'Rails is Omakase',
    ]);
    expect(
      await titles(
        'filter[or][0][title]=Compilers&filter[or][0][title][like]=rails',
      ),
    ).toEqual(['Rails is Omakase', 'Compilers']);
  });

  it('answers 400 with every offending parameter and 404 for a missing resource', async () => {
    const { status, body, headers } = await blog.request(
      '/articles?sort=nope&fields[robots]=x&unknown=1',
    );
    expect(status).toBe(400);
    expect(headers.get('content-type')).toBe(JSON_API);
    expect((body as Doc).errors?.map((e) => e['source'])).toEqual([
      { parameter: 'sort' },
      { parameter: 'fields[robots]' },
      { parameter: 'unknown' },
    ]);
    const missing = await blog.request('/articles/999');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');
    expect((missing.body as Doc).errors?.[0]).toMatchObject({
      status: '404',
      code: 'NOT_FOUND',
      detail: 'Article 999 does not exist',
    });
    const route = await blog.request('/nowhere');
    expect(route.status).toBe(404);
    expect((route.body as Doc).errors?.[0]?.['code']).toBe('NOT_FOUND');
  });

  it('never leaks an unexpected error', async () => {
    const { status, body } = await blog.request('/boom');
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('secret');
    expect((body as Doc).errors?.[0]).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });
});
