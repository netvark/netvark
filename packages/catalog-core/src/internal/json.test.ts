import { describe, expect, it } from 'vitest';

import { isJsonValue, isPlainObject, jsonEqual } from './json';

describe('isPlainObject', () => {
  it('accepts object literals and null-prototype objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject(JSON.parse('{"a": 1}'))).toBe(true);
  });

  it('rejects null, arrays, class instances, and scalars', () => {
    class Point {
      public x = 1;
    }
    for (const value of [
      null,
      [],
      new Date(0),
      new Point(),
      'x',
      1,
      true,
      undefined,
    ]) {
      expect(isPlainObject(value)).toBe(false);
    }
  });
});

describe('isJsonValue', () => {
  it('accepts JSON data all the way down', () => {
    expect(isJsonValue({ a: [1, 'two', null, true, { b: [] }] })).toBe(true);
  });

  it.each([
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['an infinity', Number.POSITIVE_INFINITY],
    ['a function', (): number => 1],
    ['a Date', new Date(0)],
    ['an undefined array element', [1, undefined]],
    ['an undefined member', { a: undefined }],
    ['a bigint', 1n],
  ])('rejects %s', (_name, value) => {
    expect(isJsonValue(value)).toBe(false);
  });
});

describe('jsonEqual: structural equality (SPEC 4)', () => {
  it('compares object members by key, in any order', () => {
    expect(
      jsonEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }),
    ).toBe(true);
  });

  it('compares arrays element by element, in order', () => {
    expect(jsonEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(jsonEqual(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(jsonEqual(['a'], ['a', 'b'])).toBe(false);
  });

  it('tells apart objects with the same number of different keys', () => {
    expect(jsonEqual({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });

  it('compares scalars by value and never equates different shapes', () => {
    expect(jsonEqual('x', 'x')).toBe(true);
    expect(jsonEqual(1, '1')).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
    expect(jsonEqual([], {})).toBe(false);
    expect(jsonEqual({}, [])).toBe(false);
  });
});
