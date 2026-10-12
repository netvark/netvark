import type { ColumnType } from '../../wire/column-type';

/**
 * Wire values as PostgreSQL parameter text (SPEC 5.1, 7.3): JSON as JSON
 * text, an array as a literal whose string elements are quoted and
 * escaped, and a value with no text form, or one JSON writes as another,
 * refused.
 * @ref https://www.postgresql.org/docs/18/arrays.html#ARRAYS-IO
 */
import { describe, expect, it } from 'vitest';

import { parameterText } from './pg-text';
import { Unwritable } from './unwritable';

const TEXT: ColumnType = { base: 'text', enum: false, array: false };
const TEXTS: ColumnType = { ...TEXT, array: true };
const NUMBERS: ColumnType = { base: 'int4', enum: false, array: true };
const JSONB: ColumnType = { base: 'jsonb', enum: false, array: false };

describe('parameterText', () => {
  it.each([
    ['text as it is', 'a "b"', TEXT, 'a "b"'],
    ['a number', 1.5, { ...TEXT, base: 'float8' }, '1.5'],
    ['a boolean', true, { ...TEXT, base: 'bool' }, 'true'],
    ['JSON as JSON text, even a string', 'a', JSONB, '"a"'],
    [
      'a JSON array as one value',
      [1, 'a'],
      { ...JSONB, array: true },
      '[1,"a"]',
    ],
    [
      'string elements quoted and escaped',
      ['a', 'b"c', 'd\\e', ''],
      TEXTS,
      '{"a","b\\"c","d\\\\e",""}',
    ],
    ['number elements bare', [1, -2], NUMBERS, '{1,-2}'],
    ['an empty array', [], TEXTS, '{}'],
    [
      'a bigint',
      2n ** 64n,
      { ...TEXT, base: 'numeric' },
      '18446744073709551616',
    ],
  ])('writes %s', (_, value, type, text) => {
    expect(parameterText(value, type)).toBe(text);
  });

  it.each([
    ['undefined', undefined, TEXT],
    ['a symbol', Symbol('s'), TEXT],
    ['a function', () => 1, JSONB],
    ['a bigint in JSON', 1n, JSONB],
    ['a symbol element', [Symbol('s')], TEXTS],
  ])('refuses %s, which has no text form', (_, value, type) => {
    expect(() => parameterText(value, type)).toThrow(
      new Unwritable('it has no text form'),
    );
  });

  it('refuses a cycle, which has no text form', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(() => parameterText(cyclic, JSONB)).toThrow(Unwritable);
  });

  it.each([
    ['NaN', Number.NaN, 'null'],
    ['an undefined member', { a: 1, b: undefined }, '{"a":1}'],
    ['a date', new Date(Date.UTC(2026, 0, 5)), '"2026-01-05T00:00:00.000Z"'],
  ])('refuses %s, which JSON writes as another value', (_, value, text) => {
    expect(() => parameterText(value, JSONB)).toThrow(
      new Unwritable(`JSON writes it as ${text}`),
    );
  });
});
