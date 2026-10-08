import { describe, expect, it } from 'vitest';

import { compact, hasOwnMember, isRecord, ownKeys, ownMember } from './object';

describe('isRecord', () => {
  it('accepts plain and null-prototype objects only', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
  });
});

describe('ownMember', () => {
  it('never reads through the prototype chain', () => {
    const parsed: Record<string, unknown> = JSON.parse('{"a":1}');
    expect(ownMember(parsed, 'a')).toBe(1);
    expect(ownMember(parsed, 'constructor')).toBeUndefined();
    expect(ownMember(parsed, '__proto__')).toBeUndefined();
    expect(ownMember(parsed, 'toString')).toBeUndefined();
    expect(hasOwnMember(parsed, 'toString')).toBe(false);
  });

  it('reads an own member literally named __proto__ from parsed JSON', () => {
    const parsed: Record<string, unknown> = JSON.parse('{"__proto__":{"x":1}}');
    expect(ownMember(parsed, '__proto__')).toEqual({ x: 1 });
    expect(ownKeys(parsed)).toEqual(['__proto__']);
  });
});

describe('compact', () => {
  it('drops undefined members and keeps the rest in order', () => {
    expect(compact({ a: 1, b: undefined, c: null, d: 0 })).toEqual({
      a: 1,
      c: null,
      d: 0,
    });
    expect(Object.keys(compact({ z: 1, a: 2 }))).toEqual(['z', 'a']);
  });
});
