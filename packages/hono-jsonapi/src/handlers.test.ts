import type { Context } from 'hono';

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';

import { JsonApiError } from 'jsonapi-kit';

import { errorHandler, notFoundHandler, toJsonApiError } from './handlers';

interface ErrorBody {
  readonly errors: Array<Record<string, unknown>>;
  readonly meta?: unknown;
}

async function thrown(
  error: unknown,
  options?: Parameters<typeof errorHandler>[0],
): Promise<{ status: number; headers: Headers; body: ErrorBody }> {
  const app = new Hono();
  app.onError(errorHandler(options));
  app.get('/', () => {
    throw error;
  });
  const response = await app.request('/');
  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json()) as ErrorBody,
  };
}

describe('errorHandler', () => {
  it('renders a thrown JsonApiError with its status and objects', async () => {
    const { status, headers, body } = await thrown(
      JsonApiError.conflict('Taken', { pointer: '/data/id' }),
    );
    expect(status).toBe(409);
    expect(headers.get('content-type')).toBe('application/vnd.api+json');
    expect(body).toEqual({
      errors: [
        {
          status: '409',
          code: 'CONFLICT',
          title: 'Conflict',
          detail: 'Taken',
          source: { pointer: '/data/id' },
        },
      ],
    });
  });

  it('maps an HTTPException to its status with the reason phrase as title', async () => {
    const withMessage = await thrown(
      new HTTPException(413, { message: 'Body exceeds 1 MiB' }),
    );
    expect(withMessage.status).toBe(413);
    expect(withMessage.body.errors).toEqual([
      {
        status: '413',
        title: 'Content Too Large',
        detail: 'Body exceeds 1 MiB',
      },
    ]);
    const bare = await thrown(new HTTPException(401));
    expect(bare.body.errors).toEqual([
      { status: '401', title: 'Unauthorized' },
    ]);
  });

  it('turns anything else into a constant 500 that reveals nothing', async () => {
    const { status, body } = await thrown(
      new Error('connection string postgres://user:secret@db'),
    );
    expect(status).toBe(500);
    expect(body.errors).toEqual([
      {
        status: '500',
        code: 'INTERNAL_SERVER_ERROR',
        title: 'Internal Server Error',
        detail: 'An unexpected error occurred',
      },
    ]);
    expect(JSON.stringify(body)).not.toContain('secret');
    // An HTTPException outside the error classes is not trusted either.
    expect((await thrown(new HTTPException(200))).status).toBe(500);
  });

  it('reports every error first, survives a throwing reporter, and applies document and headers', async () => {
    const report = vi.fn((_error: unknown, _c: Context) => {
      throw new Error('logger down');
    });
    const error = JsonApiError.forbidden('No');
    const { status, headers, body } = await thrown(error, {
      report,
      document: { meta: { requestId: 'abc' } },
      headers: { 'Cache-Control': 'no-store' },
    });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]?.[0]).toBe(error);
    expect(status).toBe(403);
    expect(headers.get('cache-control')).toBe('no-store');
    expect(body.meta).toEqual({ requestId: 'abc' });
  });
});

describe('toJsonApiError', () => {
  it('keeps the original as the cause of a mapped error', () => {
    const cause = new HTTPException(404);
    expect(toJsonApiError(cause).cause).toBe(cause);
    const plain = new Error('x');
    expect(toJsonApiError(plain).cause).toBe(plain);
    const own = JsonApiError.notFound();
    expect(toJsonApiError(own)).toBe(own);
  });
});

describe('notFoundHandler', () => {
  it('answers unmatched routes with a 404 error document', async () => {
    const app = new Hono();
    app.notFound(notFoundHandler({ headers: { 'X-Id': '1' } }));
    const response = await app.request('/nowhere');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.api+json',
    );
    expect(response.headers.get('x-id')).toBe('1');
    expect(await response.json()).toEqual({
      errors: [
        {
          status: '404',
          code: 'NOT_FOUND',
          title: 'Not Found',
          detail: 'No resource exists at the requested URL',
        },
      ],
    });
  });
});
