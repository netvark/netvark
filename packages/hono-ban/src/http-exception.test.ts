import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';

import { createBan } from './create-ban';
import {
  MALFORMED_JSON_MESSAGE,
  fromHttpException,
  passthroughResponse,
} from './http-exception';

const ban = createBan({
  errors: { CLIENT_CLOSED: { status: 499 as never, title: 'Client Closed' } },
});

describe('fromHttpException', () => {
  it('declines anything but an HTTPException with an error status', () => {
    expect(fromHttpException(new Error('x'), ban)).toBeUndefined();
    expect(fromHttpException(ban.notFound(), ban)).toBeUndefined();
    expect(fromHttpException(new HTTPException(302), ban)).toBeUndefined();
    expect(fromHttpException(new HTTPException(200), ban)).toBeUndefined();
  });

  it('picks the entry for the status and keeps the message as detail', () => {
    const exception = new HTTPException(404, { message: 'no order' });
    const error = fromHttpException(exception, ban);
    expect(error).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      detail: 'no order',
    });
    expect(error?.cause).toBe(exception);
    expect(fromHttpException(new HTTPException(503), ban)?.detail).toBe(
      undefined,
    );
    expect(
      fromHttpException(new HTTPException(499 as ContentfulStatusCode), ban)
        ?.code,
    ).toBe('CLIENT_CLOSED');
    const custom = fromHttpException(
      new HTTPException(477 as ContentfulStatusCode, { message: 'odd' }),
      ban,
    );
    expect(custom).toMatchObject({
      status: 477,
      code: 'CUSTOM',
      detail: 'odd',
    });
  });

  it("maps Hono's JSON parse failure to MALFORMED_JSON and other 400s to BAD_REQUEST", () => {
    expect(
      fromHttpException(
        new HTTPException(400, { message: MALFORMED_JSON_MESSAGE }),
        ban,
      ),
    ).toMatchObject({ code: 'MALFORMED_JSON', detail: MALFORMED_JSON_MESSAGE });
    expect(
      fromHttpException(new HTTPException(400, { message: 'other' }), ban),
    ).toMatchObject({ code: 'BAD_REQUEST', detail: 'other' });
  });

  it('adopts response headers except those describing the discarded body', () => {
    const res = new Response('old body', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="api"',
        'Content-Type': 'text/plain',
        'Content-Length': '8',
        'Content-Encoding': 'gzip',
        'Content-Location': '/old',
        'Transfer-Encoding': 'chunked',
        'Content-Range': 'bytes 0-7/8',
      },
    });
    const error = fromHttpException(new HTTPException(401, { res }), ban);
    expect(error?.headers.get('www-authenticate')).toBe('Bearer realm="api"');
    for (const name of [
      'content-type',
      'content-length',
      'content-encoding',
      'content-location',
      'transfer-encoding',
      'content-range',
    ]) {
      expect(error?.headers.has(name)).toBe(false);
    }
  });

  it('keeps Content-Range on a 416', () => {
    const res = new Response(null, {
      status: 416,
      headers: { 'Content-Range': 'bytes */1000', 'Content-Length': '0' },
    });
    const error = fromHttpException(new HTTPException(416, { res }), ban);
    expect(error?.headers.get('content-range')).toBe('bytes */1000');
    expect(error?.headers.has('content-length')).toBe(false);
  });
});

describe('passthroughResponse', () => {
  it('returns the response of an HTTPException outside the error classes', async () => {
    const response = passthroughResponse(
      new HTTPException(302, {
        res: new Response(null, { status: 302, headers: { Location: '/n' } }),
      }),
    );
    expect(response?.status).toBe(302);
    expect(response?.headers.get('location')).toBe('/n');
    const bare = passthroughResponse(new HTTPException(302));
    expect(bare?.status).toBe(302);
    await bare?.body?.cancel();
  });

  it('declines errors, other values, and a response that cannot be built', () => {
    expect(passthroughResponse(new HTTPException(404))).toBeUndefined();
    expect(passthroughResponse(new Error('x'))).toBeUndefined();
    expect(passthroughResponse('x')).toBeUndefined();
    const broken = new HTTPException(302, {
      res: new Proxy(new Response(null, { status: 302 }), {
        get() {
          throw new Error('consumed');
        },
      }),
    });
    expect(passthroughResponse(broken)).toBeUndefined();
  });
});
