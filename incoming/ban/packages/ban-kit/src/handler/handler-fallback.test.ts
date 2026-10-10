import type { ErrorFormat } from '../formats/types';

import { describe, expect, it } from 'vitest';

import { createBan } from '../core/create-ban';
import { plain } from '../formats/plain';
import { dispatch } from '../test-support/handler-dispatch';

class DomainError extends Error {
  readonly sku = 'ABC';
}

const ban = createBan();

describe('ban.handler resolution', () => {
  it('uses map to turn domain errors into catalog errors', async () => {
    const map = (error: unknown, b: typeof ban) =>
      error instanceof DomainError
        ? b.conflict({ detail: error.message, meta: { sku: error.sku } })
        : undefined;
    const { status, body, report } = await dispatch(
      ban,
      new DomainError('taken'),
      { map },
    );
    expect(status).toBe(409);
    expect(body).toMatchObject({ detail: 'taken', sku: 'ABC' });
    expect(report.handled).toBe(true);
    const other = await dispatch(ban, new Error('boom'), { map });
    expect(other.status).toBe(500);
  });

  it('prefers the handler map over the instance map', async () => {
    const withInstanceMap = createBan({ map: (_e, b) => b.gone() });
    const handler = await dispatch(withInstanceMap, new DomainError('x'), {
      map: (_e, b) => b.tooEarly(),
    });
    expect(handler.status).toBe(425);
    const instance = await dispatch(withInstanceMap, new DomainError('x'));
    expect(instance.status).toBe(410);
  });

  it('runs the adopt hook before map and reports adopted errors as handled', async () => {
    const adopting = createBan({
      adopt: (value, b) =>
        value instanceof RangeError ? b.badRequest(value.message) : undefined,
      map: (value, b) =>
        value instanceof RangeError ? b.conflict('mapped') : undefined,
    });
    const { status, body, report } = await dispatch(
      adopting,
      new RangeError('adopted'),
    );
    expect(status).toBe(400);
    expect(body).toMatchObject({ detail: 'adopted' });
    expect(report.handled).toBe(true);
    expect(report.cause).toBeInstanceOf(RangeError);
    const declined = await dispatch(adopting, new DomainError('x'), {
      map: (value, b) =>
        value instanceof DomainError ? b.conflict('mapped') : undefined,
    });
    expect(declined.status).toBe(409);
  });

  it('treats a throwing map as a handler failure', async () => {
    const { status, body, report } = await dispatch(ban, new DomainError('x'), {
      map: () => {
        throw new Error('mapper broke');
      },
    });
    expect(status).toBe(500);
    expect(body).toMatchObject({ detail: 'An unexpected error occurred' });
    expect(report.handled).toBe(false);
    expect(report.handlerFailure).toMatchObject({ message: 'mapper broke' });
  });

  it('treats a map returning a non-BanError as a handler failure', async () => {
    const { status, report } = await dispatch(ban, new DomainError('x'), {
      map: () => ({ status: 400 }) as never,
    });
    expect(status).toBe(500);
    expect(report.handlerFailure).toBeInstanceOf(TypeError);
  });

  it('treats a throwing or ill-typed adopt hook as a handler failure', async () => {
    const throwing = createBan({
      adopt: () => {
        throw new Error('hook broke');
      },
    });
    const thrown = await dispatch(throwing, new DomainError('x'));
    expect(thrown.status).toBe(500);
    expect(thrown.report.handlerFailure).toMatchObject({
      message: 'hook broke',
    });
    const illTyped = createBan({ adopt: () => ({ status: 400 }) as never });
    const bad = await dispatch(illTyped, new DomainError('x'));
    expect(bad.status).toBe(500);
    expect(bad.report.handlerFailure).toBeInstanceOf(TypeError);
  });
});

describe('ban.handler fallback', () => {
  it('falls back to a hand-built body when the format itself throws', async () => {
    const broken: ErrorFormat = {
      ...plain(),
      name: 'broken',
      render: () => {
        throw new Error('format broke');
      },
    };
    const { status, headers, body, report } = await dispatch(
      createBan({ format: broken }),
      ban.notFound('x'),
      { headers: { 'X-Static': 'yes' } },
    );
    expect(status).toBe(500);
    expect(headers.get('content-type')).toBe('application/json');
    expect(body).toMatchObject({
      status: 500,
      title: 'Internal Server Error',
      detail: 'An unexpected error occurred',
    });
    expect(typeof body['id']).toBe('string');
    // The header merge (SPEC 6.9) still runs, so the id stays coherent
    // across body, header, and report (SPEC 10.2).
    expect(headers.get('x-error-id')).toBe(body['id']);
    expect(headers.get('x-static')).toBe('yes');
    expect(headers.get('cache-control')).toBe('no-store');
    expect(report.id).toBe(body['id']);
    expect(report.handlerFailure).toMatchObject({ message: 'format broke' });
  });

  it('rejects header options Headers would reject, at construction', () => {
    expect(() => ban.handler({ errorIdHeader: 'X Error Id' })).toThrow(
      new TypeError(
        'errorIdHeader "X Error Id" is not a valid HTTP header name',
      ),
    );
    expect(() => ban.handler({ requestIdHeader: 'bad\nname' })).toThrow(
      TypeError,
    );
    expect(() => ban.handler({ headers: { 'X Static': 'yes' } })).toThrow(
      new TypeError('headers holds an invalid header name or value'),
    );
    expect(() => ban.handler({ headers: { 'X-Static': 'a\r\nb' } })).toThrow(
      TypeError,
    );
    expect(() =>
      ban.handler({
        errorIdHeader: false,
        requestIdHeader: false,
        headers: new Headers({ 'X-Static': 'yes' }),
      }),
    ).not.toThrow();
  });

  it('still responds with the error id when the header merge itself fails', async () => {
    // Passes the construction-time check, then throws on every later read,
    // so the main path and both fallback tiers fail in `mergeHeaders`.
    let reads = 0;
    const headers = {
      get 'X-Static'(): string {
        reads += 1;
        if (reads > 1) {
          throw new Error('headers gone');
        }
        return 'yes';
      },
    };
    const outcome = await dispatch(ban, ban.notFound('x'), { headers });
    expect(outcome.status).toBe(500);
    expect(outcome.headers.get('content-type')).toBe('application/json');
    expect(outcome.headers.get('cache-control')).toBe('no-store');
    expect(outcome.headers.get('x-static')).toBeNull();
    expect(outcome.headers.get('x-error-id')).toBe(outcome.body['id']);
    expect(outcome.report.handlerFailure).toMatchObject({
      message: 'headers gone',
    });
  });

  it('still responds when onReport throws, and never rejects', async () => {
    const { status } = await dispatch(ban, ban.notFound('x'), {
      onReport: () => {
        throw new Error('sink down');
      },
    });
    expect(status).toBe(404);
    const brokenMap = await dispatch(ban, new DomainError('x'), {
      map: () => {
        throw new Error('x');
      },
      onReport: () => {
        throw new Error('sink down');
      },
    });
    expect(brokenMap.status).toBe(500);
  });
});
