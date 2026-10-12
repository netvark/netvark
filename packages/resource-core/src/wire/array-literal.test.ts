/**
 * Array literals as PostgreSQL prints them, read back into their elements
 * (SPEC 5.1): `NULL` and quoted elements kept apart, escapes undone, and
 * every literal that is not one-dimensional refused.
 * @ref https://www.postgresql.org/docs/18/arrays.html#ARRAYS-IO
 */
import { describe, expect, it } from 'vitest';

import { arrayElements } from './array-literal';

describe('arrayElements', () => {
  it.each([
    ['{}', []],
    ['{a,b}', ['a', 'b']],
    ['{"a b","c\\"d","e\\\\f"}', ['a b', 'c"d', 'e\\f']],
    ['{NULL,"NULL"}', [null, 'NULL']],
    ['{"",a}', ['', 'a']],
    ['{"line\nbreak","{}"}', ['line\nbreak', '{}']],
    ['{a\u00A0b}', ['a\u00A0b']],
  ])('reads %s', (text, elements) => {
    expect(arrayElements(text)).toEqual(elements);
  });

  it.each([
    'a',
    '{a',
    'a}',
    '{{a}}',
    '{a,{b}}',
    '[0:1]={a,b}',
    '{1,,2}',
    '{a,}',
    '{a b}',
    '{"a"b}',
    '{"a\\}',
  ])(
    'gives undefined for %s, which PostgreSQL never prints for a one-dimensional array',
    (text) => {
      expect(arrayElements(text)).toBeUndefined();
    },
  );
});
