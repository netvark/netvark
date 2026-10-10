import { describe, expect, it } from 'vitest';

import { typeModifiers } from './modifiers';

describe('typeModifiers (SPEC 7.3)', () => {
  it('decodes the length of varchar(n) and char(n) as typmod minus VARHDRSZ', () => {
    expect(typeModifiers('varchar', 324)).toEqual({
      maxLength: 320,
      precision: null,
      scale: null,
    });
    expect(typeModifiers('bpchar', 7)).toEqual({
      maxLength: 3,
      precision: null,
      scale: null,
    });
  });

  it('decodes numeric(p, s), and numeric(p) as scale 0', () => {
    expect(typeModifiers('numeric', 655_366)).toEqual({
      maxLength: null,
      precision: 10,
      scale: 2,
    });
    expect(typeModifiers('numeric', 524_292)).toEqual({
      maxLength: null,
      precision: 8,
      scale: 0,
    });
  });

  it('sign-extends the 11-bit scale of PostgreSQL 15 and later (numeric(5, -2), numeric(3, 5))', () => {
    expect(typeModifiers('numeric', 329_730)).toEqual({
      maxLength: null,
      precision: 5,
      scale: -2,
    });
    expect(typeModifiers('numeric', 196_617)).toEqual({
      maxLength: null,
      precision: 3,
      scale: 5,
    });
  });

  it.each(['timestamp', 'timestamptz', 'time', 'timetz'])(
    'decodes the precision of %s(p), 0 included, as the modifier itself',
    (type) => {
      expect(typeModifiers(type, 3)).toEqual({
        maxLength: null,
        precision: 3,
        scale: null,
      });
      expect(typeModifiers(type, 0)).toEqual({
        maxLength: null,
        precision: 0,
        scale: null,
      });
    },
  );

  it('gives null for no modifier (-1), for interval, and for every other type', () => {
    const none = { maxLength: null, precision: null, scale: null };
    expect(typeModifiers('varchar', -1)).toEqual(none);
    expect(typeModifiers('numeric', -1)).toEqual(none);
    expect(typeModifiers('timestamptz', -1)).toEqual(none);
    expect(typeModifiers('interval', 268_435_458)).toEqual(none);
    expect(typeModifiers('text', -1)).toEqual(none);
  });
});
