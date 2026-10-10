import type { StandardJsonSchema } from '../internal/standard-schema-types';
import type { RenderContext } from './context';

import { describe, expect, it } from 'vitest';

import { BanError } from '../core/ban-error';
import { createBan } from '../core/create-ban';
import { defineFormat } from './define-format';

const ctx: RenderContext = {
  requestId: undefined,
  traceId: undefined,
  instance: undefined,
  method: undefined,
  includeStack: false,
  docsBaseUrl: undefined,
  meta: {},
  stack: undefined,
  truncated: false,
};

const error = new BanError({
  status: 404,
  code: 'NOT_FOUND',
  title: 'Not Found',
});
const definition = createBan().catalog.NOT_FOUND;
const schemaCtx = { docsBaseUrl: undefined, dialect: 'draft-2020-12' } as const;

describe('defineFormat (hand-written schema)', () => {
  it('defaults renderErrors and errorsSchema to render and schema', () => {
    const format = defineFormat({
      name: 'mini',
      contentType: 'application/json',
      render: (e) => ({ error: e.code }),
      schema: (d) => ({
        type: 'object',
        properties: { error: { const: d.code } },
      }),
    });
    expect(format.render(error, ctx)).toEqual({ error: 'NOT_FOUND' });
    expect(format.renderErrors(error, [], ctx)).toEqual({
      error: 'NOT_FOUND',
    });
    expect(format.errorsSchema(definition, schemaCtx)).toEqual(
      format.schema(definition, schemaCtx),
    );
  });

  it('keeps explicit renderErrors and errorsSchema', () => {
    const format = defineFormat({
      name: 'mini',
      contentType: 'application/json',
      render: (e) => ({ error: e.code }),
      renderErrors: (e, errors) => ({
        error: e.code,
        count: errors.length,
      }),
      schema: () => ({ a: 1 }),
      errorsSchema: () => ({ b: 2 }),
    });
    expect(format.renderErrors(error, [{ detail: 'x' }], ctx)).toEqual({
      error: 'NOT_FOUND',
      count: 1,
    });
    expect(format.errorsSchema(definition, schemaCtx)).toEqual({ b: 2 });
  });
});

describe('defineFormat (Standard JSON Schema)', () => {
  const calls: Array<unknown> = [];
  const schema: StandardJsonSchema<unknown, { code: string }> = {
    '~standard': {
      version: 1,
      vendor: 'test',
      jsonSchema: {
        input: () => ({ input: true }),
        output: (options) => {
          calls.push(options);
          return { type: 'object', properties: { code: { type: 'string' } } };
        },
      },
    },
  };

  it('derives the JSON Schema from the output projection', () => {
    const format = defineFormat({
      name: 'std',
      contentType: 'application/json',
      schema,
      render: (e) => ({ code: e.code }),
    });
    expect(format.schema(definition, schemaCtx)).toEqual({
      type: 'object',
      properties: { code: { type: 'string' } },
    });
    expect(format.errorsSchema(definition, schemaCtx)).toEqual(
      format.schema(definition, schemaCtx),
    );
    expect(calls[0]).toEqual({ target: 'draft-2020-12' });
    expect(format.render(error, ctx)).toEqual({ code: 'NOT_FOUND' });
    expect(format.renderErrors(error, [], ctx)).toEqual({
      code: 'NOT_FOUND',
    });
  });

  it('keeps an explicit renderErrors', () => {
    const format = defineFormat({
      name: 'std',
      contentType: 'application/json',
      schema,
      render: (e) => ({ code: e.code }),
      renderErrors: () => ({ code: 'LIST' }),
    });
    expect(format.renderErrors(error, [], ctx)).toEqual({ code: 'LIST' });
  });
});
