import { describe as group, expect, it } from 'vitest';

import { describe, isRecord, ownValue } from './object';

group('isRecord', () => {
  it('accepts objects and rejects null, arrays, and scalars', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
    for (const value of [null, [], 'x', 1, true, undefined]) {
      expect(isRecord(value)).toBe(false);
    }
  });
});

group('ownValue', () => {
  it('reads own members only, so a column named constructor is found or absent', () => {
    expect(ownValue({ a: 1 }, 'a')).toBe(1);
    expect(ownValue<number>({}, 'constructor')).toBeUndefined();
    expect(ownValue<number>({}, 'toString')).toBeUndefined();
    expect(ownValue({ constructor: 2 }, 'constructor')).toBe(2);
  });
});

group('describe', () => {
  it('prints JSON text, or the type when there is none', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const cases: ReadonlyArray<readonly [unknown, string]> = [
      ['x', '"x"'],
      [{ a: [1] }, '{"a":[1]}'],
      [undefined, 'undefined'],
      [1n, 'bigint'],
      [circular, 'object'],
    ];
    for (const [value, text] of cases) {
      expect(describe(value)).toBe(text);
    }
  });
});
