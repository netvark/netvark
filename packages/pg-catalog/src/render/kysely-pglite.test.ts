/**
 * The PGlite table of SPEC 9.2 (ADR 0013) through `mapType`: each row's
 * three types and helpers, arrays, and the parameter types of domains.
 * `kysely-pglite-driver.test.ts` holds the table against PGlite itself.
 */
import type { TypeRef } from './kysely-type-table';

import { describe, expect, it } from 'vitest';

import {
  baseRef,
  catalogOf,
  domain,
  mappingContext,
  texts,
} from '../test-support/kysely-catalog';
import { mapType } from './kysely-mapping';

const EMPTY = mappingContext(catalogOf({}), 'pglite');

/** A reference to the domain `type`, or to its arrays. */
function domainRef(type: string, array = false): TypeRef {
  return { type, typeKind: 'domain', array };
}

describe('mapType: PGlite (SPEC 9.2, ADR 0013)', () => {
  it.each([
    ['int4', ['number', 'number', 'number']],
    [
      'int8',
      [
        'number | bigint',
        'string | number | bigint',
        'string | number | bigint',
      ],
    ],
    ['numeric', ['string', 'string | number', 'string | number']],
    ['bool', ['boolean', 'boolean', 'boolean']],
    ['date', ['Date', 'Date | string', 'Date | string']],
    ['bytea', ['Uint8Array', 'Uint8Array', 'Uint8Array']],
    ['jsonb', ['JsonValue', 'JsonParameter', 'JsonParameter']],
    ['interval', ['string', 'string', 'string']],
    ['point', ['string', 'string', 'string']],
    ['circle', ['string', 'string', 'string']],
    ['citext', ['string', 'string', 'string']],
  ])('%s', (type, expected) => {
    expect(texts(mapType(baseRef(type), EMPTY))).toEqual(expected);
  });

  it('names JsonValue with JsonParameter, which its declaration uses', () => {
    const json = mapType(baseRef('json'), EMPTY);
    expect(json.select.helpers).toEqual(['JsonValue']);
    expect(json.insert.helpers).toEqual(['JsonParameter', 'JsonValue']);
  });

  it('parses every array with its element type, whose own types it takes', () => {
    expect(texts(mapType(baseRef('int8', true), EMPTY))).toEqual([
      'Array<number | bigint>',
      'Array<string | number | bigint> | string',
      'Array<string | number | bigint> | string',
    ]);
    expect(texts(mapType(baseRef('numeric', true), EMPTY))).toEqual([
      'Array<string>',
      'Array<string | number> | string',
      'Array<string | number> | string',
    ]);
    expect(texts(mapType(baseRef('circle', true), EMPTY))).toEqual([
      'Array<string>',
      'Array<string> | string',
      'Array<string> | string',
    ]);
    const moods = { type: 'mood', typeKind: 'enum', array: true } as const;
    expect(texts(mapType(moods, EMPTY))).toEqual([
      'Array<Mood>',
      'Array<Mood> | string',
      'Array<Mood> | string',
    ]);
  });

  describe('domains', () => {
    const catalog = catalogOf({
      domains: {
        moment: domain('moment', 'timestamptz'),
        blob: domain('blob', 'bytea'),
        settings: domain('settings', 'jsonb'),
        amount: domain('amount', 'int8'),
        int_list: domain('int_list', 'int4', { array: true }),
        feeling: domain('feeling', 'mood', { typeKind: 'enum' }),
      },
    });
    const context = mappingContext(catalog, 'pglite');

    it.each([
      ['moment', ['Date', 'string', 'string']],
      ['blob', ['Uint8Array', 'string', 'string']],
      ['settings', ['JsonValue', 'string', 'string']],
      ['int_list', ['Array<number>', 'string', 'string']],
      [
        'amount',
        [
          'number | bigint',
          'string | number | bigint',
          'string | number | bigint',
        ],
      ],
      ['feeling', ['Mood', 'Mood', 'Mood']],
    ])(
      'reads %s as its base type and takes what toString() writes as its text',
      (name, expected) => {
        expect(texts(mapType(domainRef(name), context))).toEqual(expected);
      },
    );

    it('returns the elements of an array of a domain as text', () => {
      expect(texts(mapType(domainRef('moment', true), context))).toEqual([
        'Array<string>',
        'Array<string> | string',
        'Array<string> | string',
      ]);
      expect(texts(mapType(domainRef('amount', true), context))).toEqual([
        'Array<string>',
        'Array<string | number | bigint> | string',
        'Array<string | number | bigint> | string',
      ]);
      expect(texts(mapType(domainRef('other.score', true), EMPTY))).toEqual([
        'Array<string>',
        'Array<unknown> | string',
        'Array<unknown> | string',
      ]);
    });
  });
});
