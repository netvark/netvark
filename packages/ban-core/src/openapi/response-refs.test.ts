import type { ErrorFormat } from '../formats/types';
import type { ResponseObject, SchemaSource } from './index';

import { describe, expect, it } from 'vitest';

import { createBan } from '../core/create-ban';
import { jsonApi } from '../formats/json-api';
import { CODES, ERRORS, mixing, subsets } from '../test-support/mixed-catalog';
import {
  errorObjectSchemas,
  errorResponseObjects,
  errorResponses,
} from './index';

/**
 * `errorResponses` with `responseRef`, and `errorResponseObjects` (SPEC
 * 9). A status that carries one entry becomes a reference to that entry's
 * response, and referenced responses must say exactly what inline ones
 * say: for every sub-catalog, under a format that combines entries and
 * under one that does not, replacing each reference by the response
 * `errorResponseObjects` gives for its key yields the inline responses,
 * and only a status that carries that entry alone references it.
 */

const RESPONSES = '#/components/responses/';
const SCHEMAS = '#/components/schemas/';
const responseRef = (key: string): string => `${RESPONSES}${key}`;
const objectRef = (key: string): string => `${SCHEMAS}${key}`;
const plain = createBan({ errors: ERRORS });

interface Components {
  readonly responses: Readonly<Record<string, ResponseObject>>;
  readonly schemas?: Readonly<Record<string, unknown>>;
}

/** `value` with each `{ $ref }` into `components` replaced by its target; records the references by key. */
function inlined(
  value: unknown,
  components: Components,
  seen: Array<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => inlined(entry, components, seen));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const ref = (value as { $ref?: unknown }).$ref;
  if (typeof ref === 'string') {
    const [prefix, map] = ref.startsWith(RESPONSES)
      ? [RESPONSES, components.responses]
      : [SCHEMAS, components.schemas ?? {}];
    const key = ref.slice(prefix.length);
    if (!ref.startsWith(prefix) || !Object.hasOwn(map, key)) {
      throw new Error(`unresolved ${ref}`);
    }
    seen.push(ref);
    return inlined(map[key], components, seen);
  }
  return Object.fromEntries(
    Object.entries(value).map(([name, entry]) => [
      name,
      inlined(entry, components, seen),
    ]),
  );
}

/** The statuses whose response is a reference, each to the key it names. */
function referenced(
  responses: Readonly<Record<string, object>>,
): Array<readonly [string, string]> {
  return Object.entries(responses).flatMap(([status, entry]) => {
    const ref = (entry as { $ref?: unknown }).$ref;
    return typeof ref === 'string'
      ? [[status, ref.slice(RESPONSES.length)] as const]
      : [];
  });
}

describe.each([
  ['a format that combines entries', mixing],
  ['a format that does not', plain],
] as const)('errorResponses with responseRef, under %s', (_, ban) => {
  it.each(subsets(CODES).map((refs) => [refs.join(', '), refs] as const))(
    'says what the inline responses of %s say',
    (_name, refs) => {
      const responses = errorResponses(ban, refs, { responseRef });
      const components = { responses: errorResponseObjects(ban, refs) };
      expect(Object.keys(components.responses)).toEqual(refs);
      expect(inlined(responses, components, [])).toEqual(
        errorResponses(ban, refs),
      );
      for (const [status, key] of referenced(responses)) {
        expect(refs).toContain(key);
        expect(String(ERRORS[key as keyof typeof ERRORS].status)).toBe(status);
      }
    },
  );
});

describe('errorResponses with responseRef', () => {
  it("references a status's lone entry and keeps a shared status inline", () => {
    expect(errorResponses(plain, CODES, { responseRef })).toMatchObject({
      '400': { description: expect.any(String) as unknown },
      '403': { $ref: responseRef('ID_REFUSED') },
      '409': { $ref: responseRef('TYPE_CONFLICT') },
      '422': { $ref: responseRef('ATTRIBUTE_INVALID') },
      '503': { $ref: responseRef('STORE_DOWN') },
    });
    // A combined body of a client and a server error is sent as 500, and 400 carries every 4xx entry.
    const mixed = errorResponses(mixing, ['ID_REFUSED', 'STORE_DOWN'], {
      responseRef,
    });
    expect(referenced(mixed)).toEqual([
      ['403', 'ID_REFUSED'],
      ['503', 'STORE_DOWN'],
    ]);
    expect(mixed['500']).toHaveProperty('content');
  });

  it('references the objects inside each response when objectRef is given too', () => {
    const options = { responseRef, objectRef } as const;
    for (const refs of subsets(CODES)) {
      const seen: Array<string> = [];
      const components = {
        responses: errorResponseObjects(mixing, refs, options),
        schemas: errorObjectSchemas(mixing, refs),
      };
      expect(
        inlined(errorResponses(mixing, refs, options), components, seen),
      ).toEqual(errorResponses(mixing, refs));
      expect(
        seen.filter((ref) => ref.startsWith(SCHEMAS)).length,
      ).toBeGreaterThan(0);
    }
  });

  it('pins each lone response in the OpenAPI 3.0 dialect with enum', () => {
    const responses = errorResponseObjects(mixing, ['ID_REFUSED'], {
      dialect: 'openapi-3.0',
    });
    expect(JSON.stringify(responses)).toContain(
      '"code":{"enum":["ID_REFUSED"]}',
    );
  });
});

describe('errorResponseObjects', () => {
  it('gives each entry once, by key or status, as the response it has alone', () => {
    const responses = errorResponseObjects(mixing, [
      403,
      'QUERY_INVALID',
      'FORBIDDEN',
    ]);
    expect(Object.keys(responses)).toEqual(['FORBIDDEN', 'QUERY_INVALID']);
    expect(responses['FORBIDDEN']).toEqual(
      errorResponses(mixing, ['FORBIDDEN'])['403'],
    );
  });

  it('refuses objectRef for a format that cannot give an object apart, as errorResponses does', () => {
    const older: ErrorFormat = { ...jsonApi({ mixedEntries: true }) };
    Reflect.deleteProperty(older, 'objectSchema');
    const source: SchemaSource = {
      format: older,
      catalog: mixing.catalog,
      docsBaseUrl: mixing.docsBaseUrl,
      validationKey: mixing.validationKey,
    };
    expect(() => errorResponseObjects(source, CODES, { objectRef })).toThrow(
      /^objectRef needs /u,
    );
    expect(() => errorResponseObjects(source, CODES)).not.toThrow();
  });
});
