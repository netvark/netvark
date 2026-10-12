import type { ColumnType } from './column-type';

/**
 * The read form (SPEC 5.1) of what PostgreSQL prints in a UTC session with
 * ISO dates: numbers as numbers, `numeric` and `int8` as their text, dates
 * and date-times in RFC 3339 form, JSON parsed, arrays element by element,
 * and `UNREPRESENTABLE` for what the wire cannot carry.
 */
import { describe, expect, it } from 'vitest';

import { readForm, UNREPRESENTABLE } from './read-form';

function scalar(base: string): ColumnType {
  return { base, enum: false, array: false };
}

describe('readForm', () => {
  it.each([
    ['int4', '42', 42],
    ['int8', '9007199254740993', '9007199254740993'],
    ['float4', '3.4028235e+38', 3.4028235e38],
    ['float8', '-0', -0],
    ['numeric', '1.50', '1.50'],
    ['bool', 'true', true],
    ['bool', 'false', false],
    ['date', '2026-10-11', '2026-10-11'],
    ['timestamp', '2026-10-11 09:30:00.25', '2026-10-11T09:30:00.25'],
    ['timestamptz', '2026-10-11 09:30:00+00', '2026-10-11T09:30:00Z'],
    ['jsonb', '{"a": [1, null]}', { a: [1, null] }],
    [
      'uuid',
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    ],
    ['text', 'a b', 'a b'],
  ])('reads %s %s', (base, text, value) => {
    expect(readForm(text, scalar(base))).toEqual(value);
  });

  it('reads an enum label as it is, whatever the enum is named', () => {
    expect(readForm('true', { base: 'bool', enum: true, array: false })).toBe(
      'true',
    );
  });

  it('reads an array element by element', () => {
    expect(readForm('{1,2}', { ...scalar('int4'), array: true })).toEqual([
      1, 2,
    ]);
    expect(readForm('{"a b",c}', { ...scalar('text'), array: true })).toEqual([
      'a b',
      'c',
    ]);
  });

  it('reads the elements of a boolean array, which PostgreSQL prints as t and f', () => {
    const flags: ColumnType = { ...scalar('bool'), array: true };
    expect(readForm('{t,f}', flags)).toEqual([true, false]);
    expect(readForm('{}', flags)).toEqual([]);
  });

  it.each([
    ['float8', 'Infinity'],
    ['float4', 'NaN'],
    ['numeric', 'NaN'],
    ['date', '10000-01-01'],
    ['date', '2026-10-11 BC'],
    ['timestamp', 'infinity'],
    ['timestamptz', '2026-10-11 09:30:00+01'],
    ['jsonb', 'null'],
    ['bool', 'yes'],
    ['bool', 'TRUE'],
  ])('gives UNREPRESENTABLE for %s %s', (base, text) => {
    expect(readForm(text, scalar(base))).toBe(UNREPRESENTABLE);
  });

  it('gives UNREPRESENTABLE for an array with a NULL element or an unreadable one', () => {
    const numbers: ColumnType = { ...scalar('float8'), array: true };
    expect(readForm('{1,NULL}', numbers)).toBe(UNREPRESENTABLE);
    expect(readForm('{1,Infinity}', numbers)).toBe(UNREPRESENTABLE);
    expect(readForm('{{1}}', numbers)).toBe(UNREPRESENTABLE);
  });
});
