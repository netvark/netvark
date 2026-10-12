/**
 * A host localizes titles in the handler's `transform` (RFC 9457 3.1.3), so
 * every format documents a title as a string with the catalog's title as
 * its example, and still pins the members that identify the entry
 * (ADR 0020).
 */
import type { BanError } from '../core/ban-error';
import type { JsonSchema, SchemaContext } from './context';
import type { ErrorFormat } from './types';

import { describe, expect, it } from 'vitest';

import { createBan } from '../core/create-ban';
import { compileWithAjv } from '../test-support/ajv';
import { fakeRequest } from '../test-support/handler-dispatch';
import { jsonApi } from './json-api';
import { plain } from './plain';
import { problemDetails } from './problem-details';

const DRAFT: SchemaContext = {
  docsBaseUrl: undefined,
  dialect: 'draft-2020-12',
};

const FORMATS: ReadonlyArray<{
  name: string;
  format: ErrorFormat;
  title: ReadonlyArray<string>;
}> = [
  {
    name: 'jsonApi',
    format: jsonApi(),
    title: ['properties', 'errors', 'items', 'properties', 'title'],
  },
  { name: 'plain', format: plain(), title: ['properties', 'title'] },
  {
    name: 'problemDetails',
    format: problemDetails(),
    title: ['properties', 'title'],
  },
];

/** Every `title` in the body, as a host's German messages would put it. */
function localize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => localize(item));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, member]) => [
      key,
      key === 'title' && typeof member === 'string'
        ? `Übersetzt: ${member}`
        : localize(member),
    ]),
  );
}

/** The body with every `key` replaced by `value`, at any depth. */
function replaced(body: unknown, key: string, value: unknown): unknown {
  if (Array.isArray(body)) {
    return body.map((item) => replaced(item, key, value));
  }
  if (typeof body !== 'object' || body === null) {
    return body;
  }
  return Object.fromEntries(
    Object.entries(body).map(([name, member]) => [
      name,
      name === key ? value : replaced(member, key, value),
    ]),
  );
}

function at(schema: JsonSchema, path: ReadonlyArray<string>): unknown {
  return path.reduce<unknown>(
    (node, key) => (node as Record<string, unknown>)[key],
    schema,
  );
}

async function served(format: ErrorFormat, error: BanError): Promise<unknown> {
  const handler = createBan({ format }).handler({ transform: localize });
  const response = await handler(error, fakeRequest({}, 'GET', '/orders/42'));
  return response.json();
}

const ban = createBan();
const ISSUES = [{ path: ['email'], message: 'Invalid email' }];

describe.each(FORMATS)('$name documents a localizable title', (entry) => {
  const { format } = entry;

  it('so a localized body conforms, with or without a list', async () => {
    const single = await served(format, ban.notFound());
    expect(JSON.stringify(single)).toContain('Übersetzt: Not Found');
    expect(
      compileWithAjv(format.schema(ban.catalog.NOT_FOUND, DRAFT))(single),
    ).toEqual([]);
    const list = await served(
      format,
      ban.validation(ISSUES, { location: 'body' }),
    );
    expect(JSON.stringify(list)).toContain('Übersetzt: Validation Failed');
    expect(
      compileWithAjv(format.errorsSchema(ban.catalog.VALIDATION_FAILED, DRAFT))(
        list,
      ),
    ).toEqual([]);
  });

  it('and still pins the status and code', async () => {
    const validate = compileWithAjv(
      format.schema(ban.catalog.NOT_FOUND, DRAFT),
    );
    const body = await served(format, ban.notFound());
    expect(validate(replaced(body, 'code', 'CONFLICT'))).not.toEqual([]);
    const status = JSON.stringify(body).includes('"status":"404"')
      ? '409'
      : 409;
    expect(validate(replaced(body, 'status', status))).not.toEqual([]);
  });

  it("with the catalog's title as the example in either dialect", () => {
    const definition = ban.catalog.NOT_FOUND;
    expect(at(format.schema(definition, DRAFT), entry.title)).toEqual({
      type: 'string',
      examples: ['Not Found'],
    });
    const legacy = format.schema(definition, {
      ...DRAFT,
      dialect: 'openapi-3.0',
    });
    expect(at(legacy, entry.title)).toEqual({
      type: 'string',
      example: 'Not Found',
    });
  });
});

describe('jsonApi() with mixed entries', () => {
  it('admits localized titles in a body that combines entries', async () => {
    const format = jsonApi({ mixedEntries: true });
    const error = ban.badRequest({
      errors: [
        { status: 404, code: 'NOT_FOUND', title: 'Not Found', detail: 'x' },
        { status: 409, code: 'CONFLICT', title: 'Conflict', detail: 'y' },
      ],
    });
    const body = await served(format, error);
    expect(JSON.stringify(body)).toContain('Übersetzt: Conflict');
    const schema = format.mixedSchema?.(
      [ban.catalog.NOT_FOUND, ban.catalog.CONFLICT],
      DRAFT,
    );
    const validate = compileWithAjv(schema ?? {});
    expect(validate(body)).toEqual([]);
    expect(validate(replaced(body, 'code', 'GONE'))).not.toEqual([]);
  });
});
