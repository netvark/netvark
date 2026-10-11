import { describe, expect, it } from 'vitest';

import { openApiErrors } from './openapi-conformance';

const INFO = { title: 'Contacts', version: '1' };

function withSchema(schema: unknown): unknown {
  return {
    openapi: '3.1.2',
    info: INFO,
    components: { schemas: { Contact: schema } },
  };
}

function withContent(mediaRange: string): unknown {
  return {
    openapi: '3.1.2',
    info: INFO,
    paths: {
      '/contacts': {
        get: {
          responses: {
            '200': {
              description: 'The contacts.',
              content: { [mediaRange]: {} },
            },
          },
        },
      },
    },
  };
}

describe('openApiErrors', () => {
  it.each([
    [
      'a document without operations',
      { openapi: '3.1.2', info: INFO, paths: {} },
    ],
    [
      'a schema with examples and a deprecated example',
      withSchema({ type: 'string', examples: ['Ada'], example: 'Ada' }),
    ],
    [
      'a nested schema with OpenAPI keywords',
      withSchema({
        type: 'object',
        properties: { name: { type: 'string', xml: { name: 'name' } } },
      }),
    ],
    ['the JSON:API media type', withContent('application/vnd.api+json')],
    [
      'a media type with a quoted parameter',
      withContent(
        'application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"',
      ),
    ],
  ])('accepts %s', (_, document) => {
    expect(openApiErrors(document)).toEqual([]);
  });

  it.each([
    [
      'a document without info.version',
      { openapi: '3.1.2', info: { title: 'Contacts' }, paths: {} },
    ],
    ['an unknown type', withSchema({ type: 'strin' })],
    [
      'a nested negative length',
      withSchema({ type: 'object', properties: { name: { minLength: -1 } } }),
    ],
    [
      'examples that are not a list',
      withSchema({ type: 'string', examples: 'Ada' }),
    ],
    [
      'a component key with a space',
      { openapi: '3.1.2', info: INFO, components: { schemas: { 'a b': {} } } },
    ],
    ['a media range with a space', withContent('application json')],
    [
      'another dialect',
      {
        openapi: '3.1.2',
        info: INFO,
        paths: {},
        jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
      },
    ],
  ])('refuses %s', (_, document) => {
    expect(openApiErrors(document)).not.toEqual([]);
  });
});
