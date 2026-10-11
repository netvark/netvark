import { describe, expect, it } from 'vitest';

import { quotable } from './quotable';

describe('quotable', () => {
  it.each([
    ['a member name', 'created_at'],
    ['a member path', 'author.company'],
    ['a parameter name', 'filter[or][0][title][like]'],
    ['an integer', '12345'],
    ['a UUID', '3f2c9a4e-0b1d-4c55-9a7e-2f1f0c3b8d11'],
    ['64 characters', 'a'.repeat(64)],
  ])('quotes %s', (_label, value) => {
    expect(quotable(value)).toBe(true);
  });

  it.each([
    ['the empty text', ''],
    ['65 characters', 'a'.repeat(65)],
    ['a trailing line feed', 'name\n'],
    ['a space', 'two words'],
    ['a quote', 'say"hi'],
    ['markup', '<b>'],
    ['a URL', 'https://evil.example'],
    ['a letter beyond ASCII', 'caf\u00E9'],
  ])('withholds %s', (_label, value) => {
    expect(quotable(value)).toBe(false);
  });
});
