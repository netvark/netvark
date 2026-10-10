import type { Catalog } from '@netvark/catalog-core';

import type { MappingContext, PositionTypes, TypeRef } from './kysely-mapping';

import { describe, expect, it } from 'vitest';

import { catalogOf, domain } from '../test-support/kysely-catalog';
import { mapType } from './kysely-mapping';

function context(
  catalog: Catalog,
  overrides: Readonly<Record<string, PositionTypes>> = {},
): MappingContext {
  return {
    catalog,
    enumNames: new Map([['mood', 'Mood']]),
    overrides: new Map(Object.entries(overrides)),
  };
}

function texts(types: PositionTypes): ReadonlyArray<string> {
  return [types.select.text, types.insert.text, types.update.text];
}

function base(type: string, array = false): TypeRef {
  return { type, typeKind: 'base', array };
}

const plain = (text: string): PositionTypes => ({
  select: { text, helpers: [] },
  insert: { text, helpers: [] },
  update: { text, helpers: [] },
});

const EMPTY = context(catalogOf({}));

describe('mapType: node-postgres defaults (SPEC 9.2)', () => {
  it.each([
    ['int4', ['number', 'number', 'number']],
    [
      'int8',
      ['string', 'string | number | bigint', 'string | number | bigint'],
    ],
    ['numeric', ['string', 'string | number', 'string | number']],
    ['timestamptz', ['Date', 'Date | string', 'Date | string']],
    ['point', ['Point', 'string', 'string']],
    ['citext', ['string', 'string', 'string']],
  ])('%s', (type, expected) => {
    expect(texts(mapType(base(type), EMPTY))).toEqual(expected);
  });

  it('parses the arrays pg-types parses, numeric[] as floats, and returns the rest as text', () => {
    expect(texts(mapType(base('numeric', true), EMPTY))).toEqual([
      'Array<number>',
      'Array<string | number> | string',
      'Array<string | number> | string',
    ]);
    expect(texts(mapType(base('circle', true), EMPTY))).toEqual([
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
    const json = mapType(base('jsonb'), EMPTY);
    expect(json.select.helpers).toEqual(['JsonValue']);
    expect(json.insert.helpers).toEqual([]);
    expect(mapType(base('interval', true), EMPTY).insert.helpers).toEqual([
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

describe('mapType: domains and overrides', () => {
  const catalog = catalogOf({
    domains: {
      amount: domain('amount', 'int8'),
      small_amount: domain('small_amount', 'amount', { typeKind: 'domain' }),
      amounts: domain('amounts', 'int8', { array: true }),
    },
  });
  const small = {
    type: 'small_amount',
    typeKind: 'domain',
    array: false,
  } as const;

  it('resolves a domain through domains over domains to its base type', () => {
    expect(mapType(small, context(catalog)).select.text).toBe('string');
    const amounts = {
      type: 'amounts',
      typeKind: 'domain',
      array: false,
    } as const;
    expect(mapType(amounts, context(catalog)).select.text).toBe(
      'Array<string>',
    );
  });

  it('returns an array of a domain as text, its elements typed as the domain', () => {
    expect(texts(mapType({ ...small, array: true }, context(catalog)))).toEqual(
      [
        'string',
        'Array<string | number | bigint> | string',
        'Array<string | number | bigint> | string',
      ],
    );
  });

  it('types a domain outside the catalog as unknown', () => {
    const outside = {
      type: 'other.score',
      typeKind: 'domain',
      array: false,
    } as const;
    expect(texts(mapType(outside, EMPTY))).toEqual([
      'unknown',
      'unknown',
      'unknown',
    ]);
  });

  it('lets the nearest override win: the column type, then each domain, then the base type', () => {
    const overrides = { int8: plain('bigint'), amount: plain('Amount') };
    expect(mapType(small, context(catalog, overrides)).select.text).toBe(
      'Amount',
    );
    expect(
      mapType(
        small,
        context(catalog, { ...overrides, small_amount: plain('Small') }),
      ).select.text,
    ).toBe('Small');
    expect(mapType(base('int8'), context(catalog, overrides)).select.text).toBe(
      'bigint',
    );
  });

  it('keys an array override by <type>[] and leaves parsed arrays to the table otherwise', () => {
    const overrides = { int8: plain('bigint') };
    expect(
      mapType(base('int8', true), context(catalog, overrides)).select.text,
    ).toBe('Array<string>');
    expect(
      mapType(
        base('int8', true),
        context(catalog, { 'int8[]': plain('Array<bigint>') }),
      ).select.text,
    ).toBe('Array<bigint>');
  });
});
