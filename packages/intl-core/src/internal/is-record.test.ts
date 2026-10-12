import { describe, expect, it } from 'vitest';

import { isRecord } from './is-record';

describe('isRecord', () => {
  it('accepts an object, with or without a prototype', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
  });

  it('refuses null, an array, a function, and a primitive', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(['ar'])).toBe(false);
    expect(isRecord(() => 'ar')).toBe(false);
    expect(isRecord('ar')).toBe(false);
  });
});
