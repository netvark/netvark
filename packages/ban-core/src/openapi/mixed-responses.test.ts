import type { JsonSchema } from '../formats/context';

import { describe, expect, it } from 'vitest';

import { jsonApi } from '../formats/json-api';
import { compileWithAjv } from '../test-support/ajv';
import {
  CODES,
  CT,
  mixing,
  schemaOf,
  sent,
  subsets,
} from '../test-support/mixed-catalog';
import { errorResponses, errorSchema } from './index';

/**
 * `errorResponses` for a format that combines entries in one body (SPEC 9,
 * 7.2.4). The oracle renders every combination of the catalog's entries the
 * way a library that reports several problems throws them (`fromStatus` of
 * `responseStatus`, as jsonapi-core does) and holds the responses to
 * exactly what those bodies need: each body validates against its status's
 * schema, no status is described that no body is sent with, and each
 * status lists exactly the codes its bodies carry.
 */

function codesOf(body: unknown): Array<string> {
  return (body as { errors: Array<{ code: string }> }).errors.map(
    (object) => object.code,
  );
}

/** The codes the objects of a response's document are pinned to, sorted. */
function listedCodes(schema: JsonSchema): Array<string> {
  const errors = (schema['properties'] as JsonSchema)['errors'] as {
    items: JsonSchema & { anyOf?: Array<JsonSchema> };
  };
  const objects = errors.items.anyOf ?? [errors.items];
  return objects
    .map(
      (object) =>
        ((object['properties'] as JsonSchema)['code'] as { const: string })
          .const,
    )
    .toSorted();
}

describe('errorResponses for a format that combines entries', () => {
  const responses = errorResponses(mixing, CODES);

  it.each(subsets(CODES).map((refs) => [refs.join(', '), refs] as const))(
    'describes every body a combination of %s is sent as, and nothing more',
    (_, refs) => {
      const described = errorResponses(mixing, refs);
      const seen = new Map<string, Set<string>>();
      for (const codes of subsets(refs)) {
        const { status, body } = sent(codes);
        const schema = schemaOf(described, String(status));
        expect(compileWithAjv(schema)(body), codes.join(' + ')).toEqual([]);
        const carried = seen.get(String(status)) ?? new Set<string>();
        for (const code of codesOf(body)) {
          carried.add(code);
        }
        seen.set(String(status), carried);
      }
      expect(Object.keys(described)).toEqual([...seen.keys()].toSorted());
      for (const [status, carried] of seen) {
        expect(listedCodes(schemaOf(described, status)), status).toEqual(
          [...carried].toSorted(),
        );
      }
    },
  );

  it('gives 400 every client error and 500 every entry, each in the order given', () => {
    expect(responses['400']?.description).toBe(
      'Query Invalid or Query Unknown or Id Refused or Type Conflict or Attribute Invalid',
    );
    expect(responses['500']?.description).toBe(
      'Query Invalid or Query Unknown or Id Refused or Type Conflict or Attribute Invalid or Store Down',
    );
    expect(responses['403']).toEqual({
      description: 'Id Refused',
      content: { [CT]: { schema: errorSchema(mixing, 'ID_REFUSED') } },
    });
  });

  it('refuses an object of a code outside the refs, or with another entry identity', () => {
    const validate = compileWithAjv(schemaOf(responses, '400'));
    const object = {
      status: '400',
      code: 'QUERY_INVALID',
      title: 'Query Invalid',
      detail: 'x',
    };
    expect(validate({ errors: [object] })).toEqual([]);
    expect(
      validate({ errors: [object, { ...object, code: 'OTHER' }] }),
    ).not.toEqual([]);
    expect(validate({ errors: [{ ...object, status: '403' }] })).not.toEqual(
      [],
    );
  });

  it('adds no 400 when the client errors share a status, and no 500 without a server error', () => {
    const shared = errorResponses(mixing, ['QUERY_INVALID', 'QUERY_UNKNOWN']);
    expect(Object.keys(shared)).toEqual(['400']);
    const clientOnly = errorResponses(mixing, ['ID_REFUSED', 'TYPE_CONFLICT']);
    expect(Object.keys(clientOnly)).toEqual(['400', '403', '409']);
    const serverOnly = errorResponses(mixing, ['STORE_DOWN']);
    expect(Object.keys(serverOnly)).toEqual(['503']);
    const withServer = errorResponses(mixing, ['ID_REFUSED', 'STORE_DOWN']);
    expect(Object.keys(withServer)).toEqual(['403', '500', '503']);
  });

  it('pins each object in the OpenAPI 3.0 dialect with enum', () => {
    const schema = schemaOf(
      errorResponses(mixing, ['QUERY_INVALID', 'ID_REFUSED'], {
        dialect: 'openapi-3.0',
      }),
      '400',
    );
    expect(JSON.stringify(schema)).toContain('"code":{"enum":["ID_REFUSED"]}');
  });
});

describe('mixedSchema', () => {
  it('exists only when the format combines entries', () => {
    expect('mixedSchema' in jsonApi()).toBe(false);
    expect('mixedSchema' in jsonApi({ mixedEntries: true })).toBe(true);
  });

  it('refuses an empty list, which no body matches', () => {
    expect(() =>
      jsonApi({ mixedEntries: true }).mixedSchema?.([], {
        docsBaseUrl: undefined,
        dialect: 'draft-2020-12',
      }),
    ).toThrow(new TypeError('mixedSchema needs at least one definition'));
  });
});
