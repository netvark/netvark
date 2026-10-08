import type {
  Ban,
  EmptyCatalog,
  ErrorReport,
  HandlerOptions,
} from '../core/types';

import { describe, expect, it } from 'vitest';

import { createBan } from '../core/create-ban';
import { fakeRequest } from '../test-support/handler-dispatch';

type Options = HandlerOptions<void, EmptyCatalog>;

function build(
  ban: Ban<EmptyCatalog>,
  options: Options = {},
): {
  handle: (
    thrown: unknown,
    headers?: Record<string, string>,
  ) => Promise<Response>;
  reports: Array<ErrorReport>;
} {
  const reports: Array<ErrorReport> = [];
  const handler = ban.handler({
    ...options,
    onReport: async (report, ctx) => {
      reports.push(report);
      await options.onReport?.(report, ctx);
    },
  });
  return {
    handle: async (thrown, headers = {}) =>
      handler(thrown, fakeRequest(headers, 'GET', '/not-found')),
    reports,
  };
}

const ban = createBan();
const notFound = (): unknown =>
  ban.notFound('Order 42 does not exist', { headers: { 'X-A': 'err' } });
const huge = (): unknown =>
  ban.badRequest({ meta: { blob: 'x'.repeat(100_000) } });

describe('ban.handler', () => {
  it('renders one response and one report', async () => {
    const { handle, reports } = build(ban);
    const response = await handle(notFound());
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(
      'application/problem+json',
    );
    expect(body).toMatchObject({
      type: 'about:blank',
      status: 404,
      title: 'Not Found',
      detail: 'Order 42 does not exist',
      instance: '/not-found',
      code: 'NOT_FOUND',
    });
    expect(reports).toHaveLength(1);
    expect(reports[0]?.id).toBe(body['id']);
    expect(response.headers.get('x-error-id')).toBe(body['id']);
    expect(reports[0]?.handled).toBe(true);
    expect(reports[0]?.context).toMatchObject({
      method: 'GET',
      path: '/not-found',
    });
  });

  it('hides unknown errors behind a constant 500 and reports the cause', async () => {
    const { handle, reports } = build(ban);
    const response = await handle(new Error('secret database string'));
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(500);
    expect(body['detail']).toBe('An unexpected error occurred');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(body).not.toHaveProperty('stack');
    expect(reports[0]?.handled).toBe(false);
    expect(reports[0]?.cause).toBeInstanceOf(Error);
    expect(reports[0]?.cause).toMatchObject({
      message: 'secret database string',
    });
  });

  it('handles values that are not Errors the same way', async () => {
    const { handle, reports } = build(ban);
    for (const thrown of ['a string', 42, null, undefined, { status: 400 }]) {
      const response = await handle(thrown);
      expect(response.status).toBe(500);
    }
    expect(reports.map((report) => report.cause)).toEqual([
      'a string',
      42,
      null,
      undefined,
      { status: 400 },
    ]);
  });

  it('adds the stack on 5xx only when includeStack is on', async () => {
    const { handle } = build(ban, { includeStack: true });
    const body = (await (
      await handle(new Error('secret database string'))
    ).json()) as Record<string, unknown>;
    expect(body['stack']).toContain('secret database string');
    const client = (await (await handle(notFound())).json()) as Record<
      string,
      unknown
    >;
    expect(client).not.toHaveProperty('stack');
  });

  it('applies transform before the size cap', async () => {
    const { handle } = build(ban, {
      transform: (body, error) => ({
        ...(body as object),
        localized: `E${error.status}`,
      }),
    });
    await expect((await handle(notFound())).json()).resolves.toMatchObject({
      localized: 'E404',
    });
  });

  it('caps oversized bodies', async () => {
    const { handle } = build(ban, { maxBodyBytes: 4096 });
    const response = await handle(huge());
    const text = await response.text();
    expect(text.length).toBeLessThan(4096);
    expect(response.status).toBe(400);
    expect(JSON.parse(text)).not.toHaveProperty('blob');
  });

  it('applies transform to the capped body as well', async () => {
    const { handle } = build(ban, {
      maxBodyBytes: 4096,
      transform: (body) => ({
        ...(body as Record<string, unknown>),
        detail: '[redacted]',
      }),
    });
    const body = (await (await handle(huge())).json()) as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty('blob');
    expect(body['detail']).toBe('[redacted]');
  });

  it('merges headers: options, then error headers, then Content-Type and X-Error-Id', async () => {
    const { handle } = build(ban, { headers: { 'X-A': 'opt', 'X-B': 'opt' } });
    const response = await handle(notFound());
    expect(response.headers.get('x-a')).toBe('err');
    expect(response.headers.get('x-b')).toBe('opt');
    expect(response.headers.get('content-type')).toBe(
      'application/problem+json',
    );
    expect(response.headers.get('x-error-id')).toBeTruthy();
  });

  it('adds Cache-Control: no-store unless the options or the error set one', async () => {
    // @ref https://www.rfc-editor.org/rfc/rfc9110#section-15.1
    const { handle } = build(ban);
    expect((await handle(notFound())).headers.get('cache-control')).toBe(
      'no-store',
    );
    const cacheable = ban.gone({
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
    expect((await handle(cacheable)).headers.get('cache-control')).toBe(
      'public, max-age=3600',
    );
    const { handle: overridden } = build(ban, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
    expect((await overridden(notFound())).headers.get('cache-control')).toBe(
      'private, max-age=60',
    );
  });

  it('keeps every Set-Cookie from the options and the error', async () => {
    const { handle } = build(ban, {
      headers: { 'Set-Cookie': 'opt=1; Path=/' },
    });
    const response = await handle(
      ban.forbidden({
        headers: [
          ['Set-Cookie', 'a=1; Path=/'],
          ['Set-Cookie', 'b=2; Path=/'],
        ],
      }),
    );
    expect(response.headers.getSetCookie()).toEqual([
      'opt=1; Path=/',
      'a=1; Path=/',
      'b=2; Path=/',
    ]);
  });

  it('renames or disables the error id header', async () => {
    const { handle: renamed } = build(ban, { errorIdHeader: 'X-Trace-Error' });
    const a = await renamed(notFound());
    expect(a.headers.get('x-trace-error')).toBeTruthy();
    expect(a.headers.get('x-error-id')).toBeNull();
    const { handle: disabled } = build(ban, { errorIdHeader: false });
    expect((await disabled(notFound())).headers.get('x-error-id')).toBeNull();
  });

  it('hands the context to every callback unchanged', async () => {
    const ctx: { user: string; trace: string | undefined } = {
      user: 'u1',
      trace: undefined,
    };
    const seen: Array<unknown> = [];
    const handle = ban.handler<typeof ctx>({
      requestId: (c) => {
        seen.push(c);
        return c.user;
      },
      traceId: (c) => {
        seen.push(c);
        return c.trace;
      },
      transform: (body, _error, c) => {
        seen.push(c);
        return body;
      },
      onReport: (report, c) => {
        seen.push(c);
        expect(report.context.requestId).toBe('u1');
      },
    });
    await handle(ban.notFound(), fakeRequest(), ctx);
    expect(seen).toEqual([ctx, ctx, ctx, ctx]);
  });
});
