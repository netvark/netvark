import { describe, expect, it } from 'vitest';

import {
  compareDecimals,
  DECIMAL_TEXT,
  exponentOfPowerOfTen,
  integerDigits,
  INTEGER_TEXT,
  isBelowPowerOfTen,
  isMultipleOfPowerOfTen,
  powerOfTen,
  writtenFractionDigits,
} from './decimal';

describe('compareDecimals (SPEC 5.3)', () => {
  it.each([
    ['1', '2', -1],
    ['2', '1', 1],
    ['1.0', '1', 0],
    ['0.10', '0.1', 0],
    ['0.09', '0.1', -1],
    ['10', '9', 1],
    ['-1', '1', -1],
    ['-2', '-1', -1],
    ['-0.5', '-0.49', -1],
    ['007', '7', 0],
  ] as const)('compares %s with %s', (a, b, order) => {
    expect(compareDecimals(a, b)).toBe(order);
  });

  it('treats negative zero as zero, as numeric has no negative zero', () => {
    expect(compareDecimals('-0', '0')).toBe(0);
    expect(compareDecimals('-0.00', '0')).toBe(0);
    expect(compareDecimals('-0', '-1')).toBe(1);
  });

  it('keeps digits a double loses', () => {
    const max = '9223372036854775807';
    const next = '9223372036854775808';
    expect(Number(max)).toBe(Number(next));
    expect(compareDecimals(max, next)).toBe(-1);
    expect(compareDecimals(`-${next}`, `-${max}`)).toBe(-1);
  });
});

describe('digit counts', () => {
  it('counts written fraction digits, trailing zeros included', () => {
    expect(writtenFractionDigits('1')).toBe(0);
    expect(writtenFractionDigits('1.50')).toBe(2);
  });

  it('counts integer digits without leading zeros', () => {
    expect(integerDigits('0')).toBe(0);
    expect(integerDigits('0.5')).toBe(0);
    expect(integerDigits('-10')).toBe(2);
    expect(integerDigits('123.4')).toBe(3);
  });
});

describe('powers of ten', () => {
  it('reads the exponent back from the literal', () => {
    for (const exponent of [5, 1, 0, -1, -3]) {
      expect(exponentOfPowerOfTen(powerOfTen(exponent))).toBe(exponent);
    }
  });

  it('spells 10^n as a decimal literal', () => {
    expect(powerOfTen(3)).toBe('1000');
    expect(powerOfTen(0)).toBe('1');
    expect(powerOfTen(-1)).toBe('0.1');
    expect(powerOfTen(-2)).toBe('0.01');
  });

  // Each case was run through PostgreSQL 18.3 (PGlite) as `$1::numeric(p, s)`:
  // a multiple of 10^-s keeps its value, any other value is rounded.
  it.each([
    ['1.50', -1, true],
    ['1.55', -1, false],
    ['5', 0, true],
    ['5.1', 0, false],
    ['0.00999', -5, true],
    ['0.000001', -5, false],
    ['12000', 3, true],
    ['12000.0', 3, true],
    ['1500', 3, false],
    ['99499', 3, false],
    ['0', 3, true],
  ] as const)('%s is a multiple of 10^%i: %s', (value, exponent, expected) => {
    expect(isMultipleOfPowerOfTen(value, exponent)).toBe(expected);
  });

  // numeric(5,2) refuses 1000 (|v| < 10^3), numeric(2,-3) refuses 99500
  // after rounding to 100000 (|v| < 10^5), numeric(3,5) refuses 0.01.
  it.each([
    ['999.99', 3, true],
    ['-999.99', 3, true],
    ['1000', 3, false],
    ['99000', 5, true],
    ['100000', 5, false],
    ['0.5', 0, true],
    ['1', 0, false],
    ['0.00999', -2, true],
    ['0.01', -2, false],
    ['0', -2, true],
  ] as const)('|%s| < 10^%i: %s', (value, exponent, expected) => {
    expect(isBelowPowerOfTen(value, exponent)).toBe(expected);
  });
});

describe('canonical spellings (SPEC 5.1)', () => {
  it('accepts one spelling per integer', () => {
    for (const text of ['0', '7', '-7', '9223372036854775807']) {
      expect(INTEGER_TEXT.test(text)).toBe(true);
    }
    for (const text of ['-0', '+5', '007', ' 5', '5 ', '1e3', '1.0', '', '-']) {
      expect(INTEGER_TEXT.test(text)).toBe(false);
    }
  });

  it('accepts one spelling per decimal, any fraction digits', () => {
    for (const text of ['0', '0.00', '0.5', '-0.5', '1.50', '-12.000']) {
      expect(DECIMAL_TEXT.test(text)).toBe(true);
    }
    for (const text of [
      '-0',
      '-0.00',
      '.5',
      '5.',
      '1e5',
      '+1',
      '01.5',
      'NaN',
      'Infinity',
    ]) {
      expect(DECIMAL_TEXT.test(text)).toBe(false);
    }
  });
});
