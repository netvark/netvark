import type { BanError, RenderedError } from '../../core/ban-error';
import type { RenderOptions } from '../context';
import type { JsonApiBody } from './index';

import { describe, expect, it } from 'vitest';

import { createBan } from '../../core/create-ban';
import { compileWithAjv } from '../../test-support/ajv';
import { assertFormatConformance } from '../../testing';
import { jsonApi, responseStatus } from './index';

const ban = createBan({
  format: jsonApi(),
  docsBaseUrl: 'https://errors.example.com',
});

function toBody(rendered: RenderedError): JsonApiBody {
  return rendered.body as JsonApiBody;
}

function render(error: BanError, options?: RenderOptions): JsonApiBody {
  return toBody(ban.render(error, options));
}

describe('jsonApi().renderErrors', () => {
  const issues = [
    { path: ['items', 0, 'sku'], message: 'Required', code: 'invalid_type' },
    { path: ['a/b'], message: 'Bad', expected: 'string', received: 'number' },
  ];

  it('renders one error object per item with source by location', () => {
    const rendered = render(ban.validation(issues, { location: 'body' }));
    expect(rendered.errors).toHaveLength(2);
    expect(rendered.errors[0]).toMatchObject({
      status: '422',
      code: 'VALIDATION_FAILED',
      title: 'Validation Failed',
      detail: 'Required',
      source: { pointer: '/items/0/sku' },
      meta: { location: 'body', code: 'invalid_type' },
    });
    expect(rendered.errors[1]).toMatchObject({
      source: { pointer: '/a~1b' },
      meta: { expected: 'string', received: 'number' },
    });
    expect(
      render(ban.validation(issues, { location: 'query' })).errors[0],
    ).toMatchObject({
      source: { parameter: 'items' },
    });
    expect(
      render(ban.validation(issues, { location: 'header' })).errors[0],
    ).toMatchObject({
      source: { header: 'items' },
    });
  });

  it('renders one summary object for an empty list so the document matches its schema', () => {
    const error = ban.validation([], { location: 'body' });
    const rendered = render(error, { traceId: 't1' });
    expect(rendered.errors).toEqual([
      {
        id: error.id,
        links: { type: 'https://errors.example.com/VALIDATION_FAILED' },
        status: '422',
        code: 'VALIDATION_FAILED',
        title: 'Validation Failed',
        detail: 'Request validation failed',
        meta: { location: 'body', traceId: 't1' },
      },
    ]);
    const validate = compileWithAjv(
      jsonApi().errorsSchema(ban.catalog.VALIDATION_FAILED, {
        docsBaseUrl: 'https://errors.example.com',
        dialect: 'draft-2020-12',
      }),
    );
    expect(validate(rendered)).toEqual([]);
    expect(
      render(ban.validation([], { location: 'body', detail: 'Nope' })).errors[0]
        ?.detail,
    ).toBe('Nope');
  });

  it('describes path and cookie parameters in meta because JSON:API has no source member for them', () => {
    for (const location of ['param', 'cookie'] as const) {
      const [object] = render(ban.validation(issues, { location })).errors;
      expect(object).not.toHaveProperty('source');
      expect(object?.meta).toMatchObject({ location, name: 'items' });
    }
  });

  it('keeps the error identity on every object by default and merges item meta', () => {
    const error = ban.badRequest('Two problems', {
      id: 'e1',
      errors: [
        {
          status: 404,
          code: 'OTHER',
          title: 'Other',
          detail: 'No such author',
          path: ['data', 'relationships', 'author'],
          meta: { lookup: 'author' },
        },
        { detail: 'Bad id', type: 'https://errors.example.com/custom' },
      ],
    });
    const rendered = render(error, { traceId: 't1' });
    expect(rendered.errors).toEqual([
      {
        id: 'e1',
        links: { type: 'https://errors.example.com/BAD_REQUEST' },
        status: '400',
        code: 'BAD_REQUEST',
        title: 'Bad Request',
        detail: 'No such author',
        source: { pointer: '/data/relationships/author' },
        meta: { traceId: 't1', lookup: 'author' },
      },
      {
        id: 'e1',
        links: { type: 'https://errors.example.com/custom' },
        status: '400',
        code: 'BAD_REQUEST',
        title: 'Bad Request',
        detail: 'Bad id',
        meta: { traceId: 't1' },
      },
    ]);
    const validate = compileWithAjv(
      jsonApi().errorsSchema(ban.catalog.BAD_REQUEST, {
        docsBaseUrl: 'https://errors.example.com',
        dialect: 'draft-2020-12',
      }),
    );
    expect(validate(rendered)).toEqual([]);
  });

  it('renders item identities under mixedEntries and loosens the schema to match', () => {
    const mixed = createBan({
      format: jsonApi({ mixedEntries: true }),
      docsBaseUrl: 'https://errors.example.com',
    });
    const error = mixed.badRequest({
      id: 'e1',
      errors: [
        {
          status: 404,
          code: 'AUTHOR_NOT_FOUND',
          title: 'Author Not Found',
          detail: 'x',
        },
        { detail: 'Bad id' },
      ],
    });
    const rendered = toBody(mixed.render(error));
    expect(rendered.errors).toEqual([
      {
        id: 'e1',
        links: { type: 'https://errors.example.com/AUTHOR_NOT_FOUND' },
        status: '404',
        code: 'AUTHOR_NOT_FOUND',
        title: 'Author Not Found',
        detail: 'x',
      },
      {
        id: 'e1',
        links: { type: 'https://errors.example.com/BAD_REQUEST' },
        status: '400',
        code: 'BAD_REQUEST',
        title: 'Bad Request',
        detail: 'Bad id',
      },
    ]);
    const schema = jsonApi({ mixedEntries: true }).errorsSchema(
      mixed.catalog.BAD_REQUEST,
      { docsBaseUrl: undefined, dialect: 'draft-2020-12' },
    );
    const items = (
      schema['properties'] as Record<string, Record<string, unknown>>
    )['errors']?.['items'] as Record<string, Record<string, unknown>>;
    expect(items['properties']).toMatchObject({
      status: { type: 'string', pattern: '^[45][0-9]{2}$' },
      code: { type: 'string' },
      title: { type: 'string' },
    });
    expect(compileWithAjv(schema)(rendered)).toEqual([]);
    // The single-object schema stays pinned: only lists may mix entries.
    const single = jsonApi({ mixedEntries: true }).schema(
      mixed.catalog.BAD_REQUEST,
      { docsBaseUrl: undefined, dialect: 'draft-2020-12' },
    );
    const singleItems = (
      single['properties'] as Record<string, Record<string, unknown>>
    )['errors']?.['items'];
    expect(singleItems).toMatchObject({
      properties: { status: { const: '400' } },
    });
  });

  it('adds static top-level document members and admits them in both schemas', () => {
    const format = jsonApi({
      document: {
        jsonapi: { version: '1.1' },
        links: { about: 'https://example.com/docs' },
        meta: { service: 'orders' },
      },
    });
    const withDocument = createBan({ format });
    const body = toBody(withDocument.render(withDocument.notFound()));
    expect(Object.keys(body)).toEqual(['jsonapi', 'errors', 'links', 'meta']);
    expect(body.jsonapi).toEqual({ version: '1.1' });
    expect(body.meta).toEqual({ service: 'orders' });
    const ctx = { docsBaseUrl: undefined, dialect: 'draft-2020-12' } as const;
    expect(
      compileWithAjv(format.schema(withDocument.catalog.NOT_FOUND, ctx))(body),
    ).toEqual([]);
    const list = withDocument.validation([], { location: 'body' });
    expect(
      compileWithAjv(
        format.errorsSchema(withDocument.catalog.VALIDATION_FAILED, ctx),
      )(withDocument.render(list).body),
    ).toEqual([]);
    expect(() => {
      assertFormatConformance(format, withDocument.catalog, {
        compile: compileWithAjv,
      });
    }).not.toThrow();
  });
});

describe('responseStatus', () => {
  it('follows the JSON:API errors-processing guidance', () => {
    expect(responseStatus([{ status: 404, detail: 'a' }])).toBe(404);
    expect(
      responseStatus([
        { status: 404, detail: 'a' },
        { status: 404, detail: 'b' },
      ]),
    ).toBe(404);
    expect(
      responseStatus([
        { status: 404, detail: 'a' },
        { status: 422, detail: 'b' },
      ]),
    ).toBe(400);
    expect(
      responseStatus([
        { status: 404, detail: 'a' },
        { status: 503, detail: 'b' },
      ]),
    ).toBe(500);
    expect(
      responseStatus([{ detail: 'a' }, { status: 409, detail: 'b' }]),
    ).toBe(409);
    expect(responseStatus([{ detail: 'a' }])).toBeUndefined();
    expect(responseStatus([])).toBeUndefined();
  });
});
