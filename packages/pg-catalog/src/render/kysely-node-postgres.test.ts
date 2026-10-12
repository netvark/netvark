/**
 * The node-postgres table of SPEC 9.2 through `mapType`: each row's three
 * types and helpers. `kysely-driver.test.ts` holds the table against the
 * driver itself.
 */
import { describe, expect, it } from 'vitest';

import {
  baseRef,
  catalogOf,
  mappingContext,
  texts,
} from '../test-support/kysely-catalog';
import { mapType } from './kysely-mapping';

const EMPTY = mappingContext(catalogOf({}));

describe('mapType: node-postgres defaults (SPEC 9.2)', () => {
  it.each([
    ['int4', ['number', 'number', 'number']],
    [
      'int8',
      ['string', 'string | number | bigint', 'string | number | bigint'],
    ],
    ['numeric', ['string', 'string | number', 'string | number']],
    ['timestamptz', ['Date', 'Date | string', 'Date | string']],
    ['bytea', ['Buffer', 'Buffer', 'Buffer']],
    ['jsonb', ['JsonValue', 'string', 'string']],
    ['point', ['Point', 'string', 'string']],
    ['citext', ['string', 'string', 'string']],
  ])('%s', (type, expected) => {
    expect(texts(mapType(baseRef(type), EMPTY))).toEqual(expected);
  });

  it('parses the arrays pg-types parses, numeric[] as floats, and returns the rest as text', () => {
    expect(texts(mapType(baseRef('numeric', true), EMPTY))).toEqual([
      'Array<number>',
      'Array<string | number> | string',
      'Array<string | number> | string',
    ]);
    expect(texts(mapType(baseRef('circle', true), EMPTY))).toEqual([
      'string',
      'Array<string> | string',
      'Array<string> | string',
    ]);
    const numranges = {
      type: 'numrange',
      typeKind: 'range',
      array: true,
    } as const;
    expect(mapType(numranges, EMPTY).select.text).toBe('Array<string>');
  });

  it('names the helper types a mapping uses, per position', () => {
    const json = mapType(baseRef('jsonb'), EMPTY);
    expect(json.select.helpers).toEqual(['JsonValue']);
    expect(json.insert.helpers).toEqual([]);
    expect(mapType(baseRef('interval', true), EMPTY).insert.helpers).toEqual([
      'PostgresInterval',
    ]);
  });

  it('types an enum as its label union, and one outside the catalog as text', () => {
    const mood = { type: 'mood', typeKind: 'enum', array: false } as const;
    expect(texts(mapType(mood, EMPTY))).toEqual(['Mood', 'Mood', 'Mood']);
    expect(texts(mapType({ ...mood, array: true }, EMPTY))).toEqual([
      'string',
      'Array<Mood> | string',
      'Array<Mood> | string',
    ]);
    const other = {
      type: 'other.level',
      typeKind: 'enum',
      array: false,
    } as const;
    expect(mapType(other, EMPTY).select.text).toBe('string');
  });
});
