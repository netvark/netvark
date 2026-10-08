import { describe, expect, it } from 'vitest';

import { ERROR_CATALOG, ERROR_CODES } from './catalog';
import {
  JsonApiError,
  errorDocument,
  errorObject,
  isJsonApiError,
  responseStatus,
} from './json-api-error';

describe('errorObject', () => {
  it('takes status (as a string) and title from the catalog and omits undefined members', () => {
    const error = errorObject('NOT_FOUND', {
      detail: 'Gone',
      source: { parameter: 'x' },
    });
    expect(error).toEqual({
      status: '404',
      code: 'NOT_FOUND',
      title: 'Not Found',
      detail: 'Gone',
      source: { parameter: 'x' },
    });
    expect(Object.keys(error)).toEqual([
      'status',
      'code',
      'title',
      'detail',
      'source',
    ]);
    expect('id' in error).toBe(false);
  });

  it('has a catalog entry with a 4xx or 5xx status and a title for every code', () => {
    for (const code of ERROR_CODES) {
      const entry = ERROR_CATALOG[code];
      expect(entry.status, code).toBeGreaterThanOrEqual(400);
      expect(entry.status, code).toBeLessThan(600);
      expect(entry.title.length, code).toBeGreaterThan(0);
    }
    expect(ERROR_CODES).toEqual(Object.keys(ERROR_CATALOG));
  });
});

describe('responseStatus', () => {
  it('uses the single status, 400 for mixed 4xx, 500 otherwise', () => {
    expect(responseStatus([{ status: '404' }, { status: '404' }])).toBe(404);
    expect(responseStatus([{ status: '404' }, { status: '409' }])).toBe(400);
    expect(responseStatus([{ status: '503' }, { status: '500' }])).toBe(500);
    expect(responseStatus([{ status: '404' }, { status: '503' }])).toBe(500);
    expect(responseStatus([{ title: 'no status' }])).toBe(500);
    expect(responseStatus([{ status: '200' }, { status: 'abc' }])).toBe(500);
    // An unregistered code cannot become the response status.
    expect(responseStatus([{ status: '499' }])).toBe(500);
    expect(responseStatus([{ status: '499' }, { status: '404' }])).toBe(404);
  });
});

// Hono's status unions keep these out at the type level; the runtime check
// guards callers without types.
const unchecked = (status: number): JsonApiError =>
  new JsonApiError({ title: 'x' }, { status: status as 404 });

describe('JsonApiError', () => {
  it('derives the status, keeps the objects, and renders a document', () => {
    const error = new JsonApiError([
      errorObject('INVALID_QUERY_PARAMETER', { detail: 'a' }),
      errorObject('UNKNOWN_QUERY_PARAMETER', { detail: 'b' }),
    ]);
    expect(error.status).toBe(400);
    expect(error.errors).toHaveLength(2);
    expect(error.name).toBe('JsonApiError');
    expect(error.message).toBe(
      '400 INVALID_QUERY_PARAMETER, UNKNOWN_QUERY_PARAMETER: a',
    );
    expect(error.document({ meta: { requestId: 'r1' } })).toEqual({
      meta: { requestId: 'r1' },
      errors: error.errors,
    });
    expect(Object.keys(error.document())).toEqual(['errors']);
  });

  it('accepts a status override and a cause, and rejects bad input', () => {
    const cause = new Error('db');
    const error = new JsonApiError({ title: 'x' }, { status: 503, cause });
    expect(error.status).toBe(503);
    expect(error.cause).toBe(cause);
    expect(() => new JsonApiError([])).toThrow(TypeError);
    expect(() => unchecked(200)).toThrow(TypeError);
    expect(() => unchecked(404.5)).toThrow(TypeError);
    expect(() => unchecked(499)).toThrow(/not a registered/u);
  });

  it('builds catalog errors with their source members', () => {
    expect(
      JsonApiError.invalidParameter('page[size]', 'bad').errors[0],
    ).toMatchObject({
      status: '400',
      code: 'INVALID_QUERY_PARAMETER',
      source: { parameter: 'page[size]' },
      detail: 'bad',
    });
    expect(JsonApiError.unknownParameter('foo').errors[0]).toMatchObject({
      code: 'UNKNOWN_QUERY_PARAMETER',
      detail: 'Query parameter "foo" is not supported by this endpoint',
      source: { parameter: 'foo' },
    });
    expect(
      JsonApiError.invalidDocument('/data', 'nope').errors[0]?.source,
    ).toEqual({
      pointer: '/data',
    });
    expect(JsonApiError.malformedJson().status).toBe(400);
    expect(JsonApiError.notAcceptable('x').errors[0]?.source).toEqual({
      header: 'Accept',
    });
    expect(JsonApiError.unsupportedMediaType('x').errors[0]?.source).toEqual({
      header: 'Content-Type',
    });
    expect(JsonApiError.clientGeneratedIdNotSupported()).toMatchObject({
      status: 403,
      errors: [{ source: { pointer: '/data/id' } }],
    });
    expect(JsonApiError.notFound().errors[0]?.detail).toBe(
      'The requested resource does not exist',
    );
    expect(JsonApiError.conflict('c', { pointer: '/data/type' }).status).toBe(
      409,
    );
    expect(JsonApiError.forbidden('f').status).toBe(403);
  });

  it('builds one 422 object per validation issue', () => {
    const error = JsonApiError.validationFailed([
      { pointer: '/data/attributes/email', detail: 'Invalid email' },
      { pointer: '/data/attributes/age', detail: 'Too young' },
    ]);
    expect(error.status).toBe(422);
    expect(error.errors.map((e) => e.source?.pointer)).toEqual([
      '/data/attributes/email',
      '/data/attributes/age',
    ]);
    expect(() => JsonApiError.validationFailed([])).toThrow(TypeError);
  });

  it('keeps the internal error constant and attaches the cause', () => {
    const cause = new Error('secret connection string');
    const error = JsonApiError.internal(cause);
    expect(error.status).toBe(500);
    expect(JSON.stringify(error.document())).not.toContain('secret');
    expect(error.cause).toBe(cause);
  });
});

describe('isJsonApiError', () => {
  it('accepts instances and structural look-alikes, rejects the rest', () => {
    expect(isJsonApiError(JsonApiError.notFound())).toBe(true);
    const foreign = Object.assign(new Error('x'), {
      name: 'JsonApiError',
      status: 404,
      errors: [{ status: '404' }],
    });
    expect(isJsonApiError(foreign)).toBe(true);
    expect(isJsonApiError(new Error('x'))).toBe(false);
    expect(isJsonApiError({ status: 404, errors: [] })).toBe(false);
    expect(isJsonApiError(null)).toBe(false);
  });
});

describe('errorDocument', () => {
  it('orders jsonapi, links, meta before errors and drops undefined', () => {
    const document = errorDocument([{ title: 't' }], {
      jsonapi: { version: '1.1' },
      meta: undefined,
    });
    expect(Object.keys(document)).toEqual(['jsonapi', 'errors']);
  });
});
