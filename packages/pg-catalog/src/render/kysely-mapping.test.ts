/**
 * `mapType` across drivers (SPEC 9.2): domains over domains and arrays,
 * types outside the catalog, and the overrides, the nearest winning. The
 * rows of each driver's table are in `kysely-node-postgres.test.ts` and
 * `kysely-pglite.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  baseRef,
  catalogOf,
  domain,
  mappingContext,
  plainTypes,
  texts,
} from '../test-support/kysely-catalog';
import { mapType } from './kysely-mapping';

const catalog = catalogOf({
  domains: {
    amount: domain('amount', 'int8'),
    small_amount: domain('small_amount', 'amount', { typeKind: 'domain' }),
    amounts: domain('amounts', 'int8', { array: true }),
    moment: domain('moment', 'timestamptz'),
  },
});
const small = {
  type: 'small_amount',
  typeKind: 'domain',
  array: false,
} as const;
const moment = { type: 'moment', typeKind: 'domain', array: false } as const;

describe('mapType: domains', () => {
  it('resolves a domain through domains over domains to its base type', () => {
    expect(mapType(small, mappingContext(catalog)).select.text).toBe('string');
    const amounts = {
      type: 'amounts',
      typeKind: 'domain',
      array: false,
    } as const;
    expect(mapType(amounts, mappingContext(catalog)).select.text).toBe(
      'Array<string>',
    );
    expect(mapType(small, mappingContext(catalog, 'pglite')).select.text).toBe(
      'number | bigint',
    );
  });

  it('returns an array of a domain as text with node-postgres, its elements typed as the domain', () => {
    expect(
      texts(mapType({ ...small, array: true }, mappingContext(catalog))),
    ).toEqual([
      'string',
      'Array<string | number | bigint> | string',
      'Array<string | number | bigint> | string',
    ]);
  });

  it('types a domain outside the catalog as unknown with either driver', () => {
    const outside = {
      type: 'other.score',
      typeKind: 'domain',
      array: false,
    } as const;
    const unknown = ['unknown', 'unknown', 'unknown'];
    expect(texts(mapType(outside, mappingContext(catalog)))).toEqual(unknown);
    expect(texts(mapType(outside, mappingContext(catalog, 'pglite')))).toEqual(
      unknown,
    );
  });

  it("gives a domain the driver's parameter type: node-postgres's base type, PGlite's text", () => {
    expect(texts(mapType(moment, mappingContext(catalog)))).toEqual([
      'Date',
      'Date | string',
      'Date | string',
    ]);
    expect(texts(mapType(moment, mappingContext(catalog, 'pglite')))).toEqual([
      'Date',
      'string',
      'string',
    ]);
  });
});

describe('mapType: overrides', () => {
  it('lets the nearest override win: the column type, then each domain, then the base type', () => {
    const overrides = {
      int8: plainTypes('bigint'),
      amount: plainTypes('Amount'),
    };
    expect(
      mapType(small, mappingContext(catalog, 'node-postgres', overrides)).select
        .text,
    ).toBe('Amount');
    expect(
      mapType(
        small,
        mappingContext(catalog, 'node-postgres', {
          ...overrides,
          small_amount: plainTypes('Small'),
        }),
      ).select.text,
    ).toBe('Small');
    expect(
      mapType(
        baseRef('int8'),
        mappingContext(catalog, 'node-postgres', overrides),
      ).select.text,
    ).toBe('bigint');
  });

  it('keeps an override as written under a domain, PGlite included', () => {
    const overrides = { timestamptz: plainTypes('Instant') };
    expect(
      texts(mapType(moment, mappingContext(catalog, 'pglite', overrides))),
    ).toEqual(['Instant', 'Instant', 'Instant']);
  });

  it('keys an array override by <type>[]; node-postgres leaves parsed arrays to the table otherwise', () => {
    const overrides = { int8: plainTypes('bigint') };
    const context = mappingContext(catalog, 'node-postgres', overrides);
    expect(mapType(baseRef('int8', true), context).select.text).toBe(
      'Array<string>',
    );
    expect(
      mapType(
        baseRef('int8', true),
        mappingContext(catalog, 'node-postgres', {
          'int8[]': plainTypes('Array<bigint>'),
        }),
      ).select.text,
    ).toBe('Array<bigint>');
  });

  it('types the elements of a PGlite array with the override of the element type, except under a domain', () => {
    const overrides = {
      int8: plainTypes('bigint'),
      amount: plainTypes('Amount'),
    };
    const context = mappingContext(catalog, 'pglite', overrides);
    expect(texts(mapType(baseRef('int8', true), context))).toEqual([
      'Array<bigint>',
      'Array<bigint> | string',
      'Array<bigint> | string',
    ]);
    const amounts = {
      type: 'amount',
      typeKind: 'domain',
      array: true,
    } as const;
    expect(texts(mapType(amounts, context))).toEqual([
      'Array<string>',
      'Array<Amount> | string',
      'Array<Amount> | string',
    ]);
  });
});
