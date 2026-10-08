import { describe, expect, it } from 'vitest';

import { createBan } from '../core/create-ban';
import { dispatch, fakeRequest } from '../test-support/handler-dispatch';

const ban = createBan();
const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736';

describe('ban.handler correlation ids', () => {
  it('echoes a validated request id into the report and never fabricates one', async () => {
    const seen = await Promise.all(
      [{ 'X-Request-Id': 'req-1' }, { 'X-Request-Id': 'bad value!' }, {}].map(
        async (headers) =>
          (await dispatch(ban, ban.notFound('x'), {}, fakeRequest(headers)))
            .report.context.requestId,
      ),
    );
    expect(seen).toEqual(['req-1', undefined, undefined]);
  });

  it('supports a custom request id header, disabling it, and an override', async () => {
    const custom = await dispatch(
      ban,
      ban.notFound('x'),
      { requestIdHeader: 'X-Correlation-Id' },
      fakeRequest({ 'X-Correlation-Id': 'c1', 'X-Request-Id': 'r1' }),
    );
    expect(custom.report.context.requestId).toBe('c1');
    const off = await dispatch(
      ban,
      ban.notFound('x'),
      { requestIdHeader: false },
      fakeRequest({ 'X-Request-Id': 'r1' }),
    );
    expect(off.report.context.requestId).toBeUndefined();
    const override = await dispatch(
      ban,
      ban.notFound('x'),
      { requestId: () => 'anything goes' },
      fakeRequest({ 'X-Request-Id': 'r1' }),
    );
    expect(override.report.context.requestId).toBe('anything goes');
  });

  it('reads W3C traceparent into the body and the report', async () => {
    const { body, report } = await dispatch(
      ban,
      ban.notFound('x'),
      {},
      fakeRequest({ traceparent: `00-${TRACE}-00f067aa0ba902b7-01` }),
    );
    expect(body).toMatchObject({ traceId: TRACE });
    expect(report.context.traceId).toBe(TRACE);
    expect(report.context.spanId).toBe('00f067aa0ba902b7');
    const bad = await dispatch(
      ban,
      ban.notFound('x'),
      {},
      fakeRequest({ traceparent: 'garbage' }),
    );
    expect(bad.report.context.traceId).toBeUndefined();
  });

  it('lets a traceId override replace traceparent parsing', async () => {
    const { report } = await dispatch(
      ban,
      ban.notFound('x'),
      { traceId: () => 'custom-trace' },
      fakeRequest({ traceparent: `00-${TRACE}-00f067aa0ba902b7-01` }),
    );
    expect(report.context.traceId).toBe('custom-trace');
    expect(report.context.spanId).toBeUndefined();
  });
});
