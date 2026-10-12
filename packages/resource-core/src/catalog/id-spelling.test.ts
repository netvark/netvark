import { describe, expect, it } from 'vitest';

import { catalogOf, column, domain } from '../test-support/catalog-builder';
import { idSpelling } from './id-spelling';

const char = (length: number | null) =>
  column({
    type: 'bpchar',
    sqlType: length === null ? 'bpchar' : `character(${String(length)})`,
    maxLength: length,
  });
const numeric = (precision: number | null, scale: number | null) =>
  column({ type: 'numeric', sqlType: 'numeric', precision, scale });

const catalog = catalogOf(
  {},
  {
    code: domain('code', {
      type: 'bpchar',
      sqlType: 'character(4)',
      maxLength: 4,
    }),
    short_code: domain('short_code', { type: 'code', typeKind: 'domain' }),
  },
);
const spelling = (overrides: Parameters<typeof column>[0]) =>
  idSpelling(catalog, column(overrides), 'labels.relationships.code');

describe('idSpelling (SPEC 3.1, 3.4)', () => {
  it('spells a bpchar with the length PostgreSQL pads it to', () => {
    expect(idSpelling(catalog, char(4), 'c')).toBe('bpchar(4)');
    expect(idSpelling(catalog, char(6), 'c')).toBe('bpchar(6)');
    expect(idSpelling(catalog, char(null), 'c')).toBe('bpchar(null)');
  });

  it('takes the modifier from the innermost domain, through domains over domains', () => {
    expect(spelling({ type: 'code', typeKind: 'domain' })).toBe('bpchar(4)');
    expect(spelling({ type: 'short_code', typeKind: 'domain' })).toBe(
      'bpchar(4)',
    );
  });

  it('spells a numeric with its scale, and without one as numeric', () => {
    expect(idSpelling(catalog, numeric(10, 2), 'c')).toBe('numeric(2)');
    expect(idSpelling(catalog, numeric(10, 3), 'c')).toBe('numeric(3)');
    expect(idSpelling(catalog, numeric(10, null), 'c')).toBe('numeric(0)');
    expect(idSpelling(catalog, numeric(null, null), 'c')).toBe('numeric');
  });

  it('spells the integers alike, and text and varchar alike', () => {
    expect(spelling({ type: 'int2' })).toBe('integer');
    expect(spelling({ type: 'int4' })).toBe('integer');
    expect(spelling({ type: 'int8' })).toBe('integer');
    expect(spelling({ type: 'text' })).toBe('text');
    expect(spelling({ type: 'varchar', maxLength: 10 })).toBe('text');
  });

  it('spells every other type by its name', () => {
    expect(spelling({ type: 'float4' })).toBe('float4');
    expect(spelling({ type: 'float8' })).toBe('float8');
    expect(spelling({ type: 'citext' })).toBe('citext');
    expect(spelling({ type: 'uuid' })).toBe('uuid');
    expect(spelling({ type: 'timestamptz', precision: 3 })).toBe('timestamptz');
  });

  it('throws for a domain the catalog does not hold', () => {
    expect(() => spelling({ type: 'missing', typeKind: 'domain' })).toThrow(
      new TypeError(
        'labels.relationships.code: domain missing is not in the catalog',
      ),
    );
  });
});
