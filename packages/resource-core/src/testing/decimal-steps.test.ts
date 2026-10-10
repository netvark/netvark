import { describe, expect, it } from 'vitest';

import { stepDecimal } from './decimal-steps';

describe('stepDecimal', () => {
  it.each([
    ['999.99', 1, -2, '1000'],
    ['1000', -1, -2, '999.99'],
    ['0', 5, -3, '0.005'],
    ['999.99', 5, -3, '999.995'],
    ['0.5', -1, -2, '0.49'],
    ['-0.01', 1, -2, '0'],
    ['-1000', 1, -2, '-999.99'],
    ['100', 1, -1, '100.1'],
    ['1000', -1, 3, '0'],
    ['0', 5, 2, '500'],
    ['9223372036854775807', 1, 0, '9223372036854775808'],
    ['-9223372036854775808', -1, 0, '-9223372036854775809'],
  ])(
    'moves %s by %i times 10^%i to %s, exactly',
    (text, steps, exponent, expected) => {
      expect(stepDecimal(text, steps, exponent)).toBe(expected);
    },
  );
});
