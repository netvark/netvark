import { describe, expect, it, vi } from 'vitest';

import { cacheKey, createIntlCache } from './intl-cache';

const build = (tag: string, options: object) => ({ tag, options });

describe('cacheKey (SPEC 3.4)', () => {
  it('does not depend on the order of the options or on undefined values', () => {
    expect(
      cacheKey('NumberFormat', 'en', {
        style: 'percent',
        maximumFractionDigits: 1,
      }),
    ).toBe(
      cacheKey('NumberFormat', 'en', {
        maximumFractionDigits: 1,
        currency: undefined,
        style: 'percent',
      }),
    );
  });

  it('separates the constructor, the tag, the option names, and the value types', () => {
    const keys = [
      cacheKey('NumberFormat', 'en', {}),
      cacheKey('PluralRules', 'en', {}),
      cacheKey('NumberFormat', 'ar', {}),
      cacheKey('NumberFormat', 'en', { minimumIntegerDigits: 2 }),
      cacheKey('NumberFormat', 'en', { minimumIntegerDigits: '2' }),
      cacheKey('NumberFormat', 'en', { minimumFractionDigits: 2 }),
      cacheKey('NumberFormat', 'en', { useGrouping: 'true' }),
      cacheKey('NumberFormat', 'en', { useGrouping: true }),
      cacheKey('NumberFormat', 'en', { maximumFractionDigits: Infinity }),
      cacheKey('NumberFormat', 'en', { maximumFractionDigits: -Infinity }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is undefined for a value that is not a string, a number, or a boolean', () => {
    for (const value of [
      Number.NaN,
      1n,
      null,
      {},
      ['a'],
      () => 'a',
      Symbol('a'),
    ]) {
      expect(cacheKey('NumberFormat', 'en', { roundingIncrement: value })).toBe(
        undefined,
      );
    }
  });
});

describe('createIntlCache (SPEC 3.4)', () => {
  it('builds once per key and hands the builder an own copy of the options', () => {
    const builder = vi.fn(build);
    const get = createIntlCache(4).getter('NumberFormat', builder);
    const options = { style: 'percent' };
    const first = get('en', options);
    expect(get('en', { style: 'percent', currency: undefined })).toBe(first);
    expect(builder).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ tag: 'en', options: { style: 'percent' } });
    expect(first.options).not.toBe(options);
  });

  it('reads only own enumerable options, the ones the key is made of', () => {
    const builder = vi.fn(build);
    const get = createIntlCache(4).getter('DateTimeFormat', builder);
    const inherited: object = Object.create({ timeZone: 'Asia/Riyadh' });
    expect(get('en', inherited).options).toEqual({});
    expect(get('en', {})).toBe(get('en', inherited));
    expect(builder).toHaveBeenCalledTimes(1);
  });

  it('builds for the call only when an option cannot be keyed', () => {
    const builder = vi.fn(build);
    const get = createIntlCache(4).getter('NumberFormat', builder);
    const options = { roundingIncrement: 1n };
    expect(get('en', options)).not.toBe(get('en', options));
    expect(builder).toHaveBeenCalledTimes(2);
  });

  it('drops the least recently used object across getters, never holding more than the size', () => {
    const builder = vi.fn(build);
    const cache = createIntlCache(2);
    const numbers = cache.getter('NumberFormat', builder);
    const plurals = cache.getter('PluralRules', builder);
    const en = numbers('en', {});
    numbers('ar', {});
    expect(numbers('en', {})).toBe(en);
    plurals('en', {});
    expect(builder).toHaveBeenCalledTimes(3);
    expect(numbers('en', {})).toBe(en);
    expect(builder).toHaveBeenCalledTimes(3);
    numbers('ar', {});
    expect(builder).toHaveBeenCalledTimes(4);
    plurals('en', {});
    expect(builder).toHaveBeenCalledTimes(5);
  });

  it('holds one object when the size is 1', () => {
    const builder = vi.fn(build);
    const get = createIntlCache(1).getter('NumberFormat', builder);
    get('en', {});
    get('ar', {});
    get('en', {});
    expect(builder).toHaveBeenCalledTimes(3);
    get('en', {});
    expect(builder).toHaveBeenCalledTimes(3);
  });
});
