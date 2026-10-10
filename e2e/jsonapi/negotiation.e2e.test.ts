/**
 * Content negotiation over HTTP (SPEC 3.3): the 415 and 406 responses the
 * specification requires, parameters the server must ignore, and the
 * extension and profile parameters a client can ask for.
 * @ref https://jsonapi.org/format/1.1/#content-negotiation-servers
 */
import { describe, expect, it } from 'vitest';

import { JSON_API, useBlog } from './support/http.ts';

interface Doc {
  readonly errors?: Array<Record<string, unknown>>;
}

const ATOMIC = 'https://jsonapi.org/ext/atomic';
const PROFILE = 'http://jsonapi.org/profiles/ethanresnick/cursor-pagination/';

describe('content negotiation', () => {
  const blog = useBlog();

  it('415 for JSON:API bodies with other parameters or unsupported extensions', async () => {
    for (const contentType of [
      `${JSON_API}; charset=utf-8`,
      `${JSON_API}; ext="https://example.com/ext"`,
    ]) {
      const { status, headers, body } = await blog.request('/articles/1', {
        headers: { 'content-type': contentType },
      });
      expect(status, contentType).toBe(415);
      expect(headers.get('content-type')).toBe(JSON_API);
      expect(headers.get('vary')).toBe('Accept');
      expect((body as Doc).errors?.[0]).toMatchObject({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        source: { header: 'Content-Type' },
      });
    }
  });

  it('406 when every JSON:API Accept instance is unusable, otherwise the usable one wins', async () => {
    const unusable = await blog.request('/articles/1', {
      headers: {
        accept: `${JSON_API}; charset=utf-8, ${JSON_API}; ext="https://example.com/ext"`,
      },
    });
    expect(unusable.status).toBe(406);
    expect((unusable.body as Doc).errors?.[0]).toMatchObject({
      code: 'NOT_ACCEPTABLE',
      source: { header: 'Accept' },
    });
    const mixed = await blog.request('/articles/1', {
      headers: { accept: `${JSON_API}; charset=utf-8, ${JSON_API}` },
    });
    expect(mixed.status).toBe(200);
    const anything = await blog.request('/articles/1', {
      headers: { accept: '*/*' },
    });
    expect(anything.status).toBe(200);
    const html = await blog.request('/articles/1', {
      headers: { accept: 'text/html' },
    });
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toBe(JSON_API);
  });

  it('keeps a requested supported profile and applies it to paginated responses', async () => {
    const { status, headers } = await blog.request('/articles', {
      headers: {
        accept: `${JSON_API}; profile="${PROFILE} https://example.com/other"`,
      },
    });
    expect(status).toBe(200);
    expect(headers.get('content-type')).toBe(
      `${JSON_API}; profile="${PROFILE}"`,
    );
    const noParams = await blog.request('/articles/1', {
      headers: { accept: `${JSON_API}; profile="${PROFILE}"` },
    });
    expect(noParams.headers.get('content-type')).toBe(JSON_API);
  });

  it('accepts the atomic extension on both headers when the endpoint supports it', async () => {
    const { status } = await blog.request('/articles/1', {
      headers: {
        'content-type': `${JSON_API}; ext="${ATOMIC}"`,
        accept: `${JSON_API}; ext="${ATOMIC}", ${JSON_API}; q=0.5`,
      },
    });
    expect(status).toBe(200);
  });
});
