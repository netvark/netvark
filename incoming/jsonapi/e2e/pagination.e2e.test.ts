/**
 * The Cursor Pagination profile over HTTP (SPEC 8): the profile in the
 * `Content-Type`, `page[size]` with the definition's default and max,
 * walking `next` and `prev` links, item cursors, `meta.page.total`, and
 * the profile's error objects.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 */
import { describe, expect, it } from 'vitest';

import { useBlog } from './support/http.ts';

interface Page {
  readonly data: Array<{ id: string; meta?: { page?: { cursor?: string } } }>;
  readonly links: Record<string, string | null>;
  readonly meta?: Record<string, unknown>;
  readonly errors?: Array<Record<string, unknown>>;
  readonly jsonapi?: Record<string, unknown>;
}

const PROFILE = 'http://jsonapi.org/profiles/ethanresnick/cursor-pagination/';

describe('cursor pagination', () => {
  const blog = useBlog();

  async function page(path: string): Promise<Page> {
    const { status, headers, body } = await blog.request(path);
    expect(status, path).toBe(200);
    expect(headers.get('content-type'), path).toBe(
      `application/vnd.api+json; profile="${PROFILE}"`,
    );
    return body as Page;
  }

  it('applies the default size, declares the profile, and links the next page', async () => {
    const first = await page('/articles');
    expect(first.jsonapi).toEqual({ version: '1.1', profile: [PROFILE] });
    expect(first.data.map((row) => row.id)).toEqual(['1', '2']);
    expect(first.meta).toEqual({ page: { total: 5 } });
    expect(first.links['prev']).toBeNull();
    expect(first.links['next']).toMatch(/page%5Bafter%5D=/u);
    expect(first.data[1]?.meta).toEqual({ page: { cursor: btoa('2') } });
  });

  it('walks forward and back through next and prev links', async () => {
    const first = await page('/articles?page[size]=2&sort=title');
    const second = await page(
      new URL(first.links['next'] ?? '').pathname +
        new URL(first.links['next'] ?? '').search,
    );
    const third = await page(
      new URL(second.links['next'] ?? '').pathname +
        new URL(second.links['next'] ?? '').search,
    );
    expect(
      [...first.data, ...second.data, ...third.data].map((row) => row.id),
    ).toEqual(['3', '4', '1', '5', '2']);
    expect(third.links['next']).toBeNull();
    const back = await page(
      new URL(third.links['prev'] ?? '').pathname +
        new URL(third.links['prev'] ?? '').search,
    );
    expect(back.data.map((row) => row.id)).toEqual(
      second.data.map((row) => row.id),
    );
    expect(second.links['first']).toMatch(
      /\/articles\?page%5Bsize%5D=2&sort=title$/u,
    );
  });

  it('reports the profile errors with their type links', async () => {
    const tooBig = await blog.request('/articles?page[size]=5');
    expect(tooBig.status).toBe(400);
    expect((tooBig.body as Page).errors?.[0]).toMatchObject({
      code: 'MAX_PAGE_SIZE_EXCEEDED',
      links: {
        type: 'https://jsonapi.org/profiles/ethanresnick/cursor-pagination/max-size-exceeded',
      },
      source: { parameter: 'page[size]' },
      meta: { page: { maxSize: 4 } },
    });
    const range = await blog.request(
      `/articles?page[after]=${btoa('1')}&page[before]=${btoa('4')}`,
    );
    expect(range.status).toBe(400);
    expect((range.body as Page).errors?.[0]).toMatchObject({
      code: 'RANGE_PAGINATION_NOT_SUPPORTED',
      source: { parameter: 'page[before]' },
    });
    const badCursor = await blog.request('/articles?page[after]=%%%');
    expect(badCursor.status).toBe(400);
    expect((badCursor.body as Page).errors?.[0]).toMatchObject({
      code: 'INVALID_QUERY_PARAMETER',
      source: { parameter: 'page[after]' },
    });
  });
});
