/**
 * `showValue` (SPEC 10.3): JSON for a JSON value, and JavaScript notation
 * for what JSON would write as another value or not at all.
 */
import { describe, expect, it } from 'vitest';

import { showValue } from './show-value';

function check(): void {
  // A function with a name, for the report to show.
}

describe('showValue', () => {
  it.each([
    ['a string, control characters escaped', 'a\n"b"', String.raw`"a\n\"b\""`],
    ['a lone surrogate escaped', '\uD800', String.raw`"\ud800"`],
    ['a number', 1.5, '1.5'],
    ['a boolean', false, 'false'],
    ['null', null, 'null'],
    ['an array', [1, 'a', null], '[1,"a",null]'],
    ['an object, keys quoted', { 'a b': { c: [] } }, '{"a b":{"c":[]}}'],
  ])('shows %s as JSON', (_, value, text) => {
    expect(showValue(value)).toBe(text);
  });

  it.each([
    ['NaN', Number.NaN, 'NaN'],
    ['an infinity', Number.NEGATIVE_INFINITY, '-Infinity'],
    ['negative zero', -0, '-0'],
    ['a bigint', 2n ** 64n, '18446744073709551616n'],
    ['undefined', undefined, 'undefined'],
    ['an undefined member', { a: undefined }, '{"a":undefined}'],
    ['a symbol', Symbol('rejected'), 'Symbol(rejected)'],
    ['a named function', check, '[function check]'],
    ['an anonymous function', [() => 1], '[[function]]'],
    [
      'a date',
      new Date(Date.UTC(2026, 0, 5, 9)),
      'Date(2026-01-05T09:00:00.000Z)',
    ],
    ['an invalid date', new Date(Number.NaN), 'Date(invalid)'],
  ])('shows %s as JavaScript writes it', (_, value, text) => {
    expect(showValue(value)).toBe(text);
  });

  it('shows a cycle where it closes, and a value held twice in full each time', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic['self'] = cyclic;
    const shared = [1];
    expect(showValue(cyclic)).toBe('{"a":1,"self":[cycle]}');
    expect(showValue({ x: shared, y: shared })).toBe('{"x":[1],"y":[1]}');
  });
});
