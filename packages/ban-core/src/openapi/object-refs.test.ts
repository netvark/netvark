import type { JsonSchema } from '../formats/context';
import type { ErrorFormat } from '../formats/types';
import type { SchemaSource } from './index';

import { describe, expect, it } from 'vitest';

import { createBan } from '../core/create-ban';
import { jsonApi } from '../formats/json-api';
import { compileWithAjv } from '../test-support/ajv';
import {
  CODES,
  ERRORS,
  mixing,
  schemaOf,
  sent,
  subsets,
} from '../test-support/mixed-catalog';
import { errorObjectSchemas, errorResponses, errorSchema } from './index';

/**
 * `errorResponses` with `objectRef`, and `errorObjectSchemas` (SPEC 9,
 * 7.2.4). Referenced responses must say exactly what inline ones say: for
 * every sub-catalog, replacing each reference by the object
 * `errorObjectSchemas` gives for its key yields the inline responses, and
 * every object given is referenced. A validator that resolves the
 * references then accepts every body the entries are sent as.
 */

const DEFS = '#/$defs/';
const objectRef = (key: string): string => `${DEFS}${key}`;

/** `value` with each `{ $ref }` to `objects` replaced by its object; records the keys referenced. */
function inlined(
  value: unknown,
  objects: Readonly<Record<string, JsonSchema>>,
  seen: Set<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => inlined(entry, objects, seen));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const ref = (value as { $ref?: unknown }).$ref;
  if (typeof ref === 'string') {
    const key = ref.slice(DEFS.length);
    const object = objects[key];
    if (!ref.startsWith(DEFS) || object === undefined) {
      throw new Error(`unresolved ${ref}`);
    }
    seen.add(key);
    return object;
  }
  return Object.fromEntries(
    Object.entries(value).map(([name, entry]) => [
      name,
      inlined(entry, objects, seen),
    ]),
  );
}

describe('errorResponses with objectRef', () => {
  it.each(subsets(CODES).map((refs) => [refs.join(', '), refs] as const))(
    'says what the inline responses of %s say, through each object once',
    (_, refs) => {
      const objects = errorObjectSchemas(mixing, refs);
      expect(Object.keys(objects)).toEqual(refs);
      const seen = new Set<string>();
      expect(
        inlined(errorResponses(mixing, refs, { objectRef }), objects, seen),
      ).toEqual(errorResponses(mixing, refs));
      expect([...seen].toSorted()).toEqual([...refs].toSorted());
    },
  );

  it('validates every body the entries are sent as once the references resolve', () => {
    const responses = errorResponses(mixing, CODES, { objectRef });
    const $defs = errorObjectSchemas(mixing, CODES);
    for (const codes of subsets(CODES)) {
      const { status, body } = sent(codes);
      const schema = { ...schemaOf(responses, String(status)), $defs };
      expect(compileWithAjv(schema)(body), codes.join(' + ')).toEqual([]);
    }
    const validate = compileWithAjv({
      ...schemaOf(responses, '403'),
      $defs,
    });
    const refused = (sent(['ID_REFUSED']).body as { errors: Array<object> })
      .errors[0];
    expect(validate({ errors: [{ ...refused, code: 'OTHER' }] })).not.toEqual(
      [],
    );
  });

  it('references each object in the OpenAPI 3.0 dialect too, pinned there with enum', () => {
    const options = { dialect: 'openapi-3.0', objectRef } as const;
    const schema = schemaOf(
      errorResponses(mixing, ['ID_REFUSED'], options),
      '403',
    );
    expect(schema['properties']).toMatchObject({
      errors: { items: { $ref: objectRef('ID_REFUSED') } },
    });
    expect(
      JSON.stringify(errorObjectSchemas(mixing, ['ID_REFUSED'], options)),
    ).toContain('"code":{"enum":["ID_REFUSED"]}');
  });
});

describe('errorObjectSchemas', () => {
  it('gives each entry once, by key or status, as its pinned object', () => {
    const objects = errorObjectSchemas(mixing, [
      403,
      'QUERY_INVALID',
      'FORBIDDEN',
    ]);
    expect(Object.keys(objects)).toEqual(['FORBIDDEN', 'QUERY_INVALID']);
    const single = errorSchema(mixing, 403)['properties'] as {
      errors: { items: JsonSchema };
    };
    expect(objects['FORBIDDEN']).toEqual(single.errors.items);
  });

  it('refuses a format that does not combine entries, as errorResponses refuses objectRef', () => {
    const pinned = createBan({ errors: ERRORS, format: jsonApi() });
    expect(() => errorObjectSchemas(pinned, CODES)).toThrow(
      new TypeError(
        'errorObjectSchemas needs a format that combines entries in one body, such as jsonApi({ mixedEntries: true }); "json-api" does not',
      ),
    );
    expect(() =>
      errorResponses(createBan({ errors: ERRORS }), CODES, { objectRef }),
    ).toThrow(/^objectRef needs .*"problem-details" does not$/u);
  });

  it('refuses a format that combines entries but cannot give an object apart', () => {
    const older: ErrorFormat = { ...jsonApi({ mixedEntries: true }) };
    Reflect.deleteProperty(older, 'objectSchema');
    expect(Object.keys(older)).toContain('mixedSchema');
    const source: SchemaSource = { ...sourceOf(), format: older };
    expect(() => errorObjectSchemas(source, CODES)).toThrow(TypeError);
    expect(() => errorResponses(source, CODES, { objectRef })).toThrow(
      TypeError,
    );
    expect(() => errorResponses(source, CODES)).not.toThrow();
  });
});

function sourceOf(): SchemaSource {
  return {
    format: mixing.format,
    catalog: mixing.catalog,
    docsBaseUrl: mixing.docsBaseUrl,
    validationKey: mixing.validationKey,
  };
}
