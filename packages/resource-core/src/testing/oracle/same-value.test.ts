import type { ColumnType } from './column-type';

/**
 * Whether a read form is the value sent (ADR 0005): the spellings a type's
 * read form may change, and nothing else; JSON values equal by value.
 */
import { describe, expect, it } from 'vitest';

import { sameJson } from './same-json';
import { sameValue } from './same-value';

function scalar(base: string): ColumnType {
  return { base, enum: false, array: false };
}

describe('sameValue', () => {
  it.each([
    ['bpchar', 'ab  ', 'ab'],
    ['bpchar', 'ab  ', 'ab '],
    ['float4', 0.1, Math.fround(0.1)],
    ['numeric', '1.50', '1.5'],
    ['numeric', '0', '-0'],
    ['numeric', '10', '10'],
    [
      'uuid',
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11',
    ],
    ['timestamp', '2026-10-11T09:30:00', '2026-10-11T09:30:00.000'],
    ['timestamptz', '2026-10-11T08:30:00Z', '2026-10-11T09:30:00+01:00'],
    ['timestamptz', '2026-10-11T08:30:00.5Z', '2026-10-11t08:30:00.500z'],
    ['jsonb', { a: 1, b: [true] }, { b: [true], a: 1 }],
    ['text', 'a', 'a'],
  ])('takes %s %j as %j', (base, stored, sent) => {
    expect(sameValue(stored, sent, scalar(base))).toBe(true);
  });

  it.each([
    ['bpchar', 'ab', 'ab c'],
    ['float4', 0.1, 0.2],
    ['numeric', '1.5', '1.50001'],
    ['numeric', '100', '1'],
    ['timestamptz', '2026-10-11T08:30:00Z', '2026-10-11T08:30:00.000001Z'],
    ['timestamptz', 'infinity', 'infinity'],
    ['text', 'a', 'a '],
    ['int4', -0, 0],
    ['jsonb', { a: 1 }, { a: 1, b: 2 }],
  ])('tells %s %j from %j', (base, stored, sent) => {
    expect(sameValue(stored, sent, scalar(base))).toBe(false);
  });

  it('compares arrays element by element, and only arrays of one length', () => {
    const numbers: ColumnType = { ...scalar('numeric'), array: true };
    expect(sameValue(['1.50', '2'], ['1.5', '2.0'], numbers)).toBe(true);
    expect(sameValue(['1.50'], ['1.5', '2'], numbers)).toBe(false);
    expect(sameValue('1.5', ['1.5'], numbers)).toBe(false);
  });

  it('compares an enum label exactly, whatever the enum is named', () => {
    expect(
      sameValue('ab ', 'ab', { base: 'bpchar', enum: true, array: false }),
    ).toBe(false);
  });
});

describe('sameJson', () => {
  it.each([
    [null, null, true],
    [[1, [2]], [1, [2]], true],
    [[1, 2], [2, 1], false],
    [{ a: { b: null } }, { a: { b: null } }, true],
    [{ a: 1 }, { a: '1' }, false],
    [{ a: undefined }, { b: undefined }, false],
    [[], {}, false],
    [{}, [], false],
    [Number.NaN, Number.NaN, true],
    [0, -0, false],
  ])('compares %j and %j', (left, right, same) => {
    expect(sameJson(left, right)).toBe(same);
  });
});
