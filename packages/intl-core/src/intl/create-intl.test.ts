import { describe, expect, it, vi } from 'vitest';

import { createIntl } from './create-intl';

const AR_TAG = 'ar-SA-u-ca-gregory-nu-latn';
/** 2026-10-12 21:30 UTC: already 13 October in Riyadh (UTC+3). */
const INSTANT = Date.UTC(2026, 9, 12, 21, 30);
const DAY_MS = 86_400_000;
const CONSTRUCTORS = [
  'DateTimeFormat',
  'NumberFormat',
  'RelativeTimeFormat',
  'ListFormat',
  'DisplayNames',
  'PluralRules',
  'Collator',
] as const;

function reader(locale = 'ar', zone = 'Asia/Riyadh') {
  return { locale: vi.fn(() => locale), timeZone: vi.fn(() => zone) };
}

/** Calls every formatter once. */
function formatAll(intl: ReturnType<typeof createIntl>): void {
  intl.date(INSTANT);
  intl.dateRange(INSTANT, INSTANT + DAY_MS);
  intl.number(1234.5);
  intl.relativeTime(-1, 'day');
  intl.list(['a', 'b']);
  intl.displayName('SA', { type: 'region' });
  intl.plural(3);
  intl.compare('a', 'b');
}

describe('createIntl options (SPEC 3.1, 5)', () => {
  const getters = { locale: () => 'ar', timeZone: () => 'UTC' };

  it.each([
    ['options that are not an object', undefined, 'options is not an object'],
    [
      'a locale that is not a function',
      { ...getters, locale: 'ar' },
      'locale is not a function',
    ],
    [
      'a zone that is not a function',
      { ...getters, timeZone: 'UTC' },
      'timeZone is not a function',
    ],
    [
      'formattingLocales that are not an object',
      { ...getters, formattingLocales: [AR_TAG] },
      'formattingLocales is not an object',
    ],
  ])('refuses %s with a TypeError', (_, options, message) => {
    expect(() => createIntl(options as never)).toThrow(TypeError);
    expect(() => createIntl(options as never)).toThrow(
      `createIntl: ${message}`,
    );
  });

  it.each([0, -1, 1.5, Infinity, Number.NaN, '8'])(
    'refuses a cacheSize of %s with a RangeError',
    (cacheSize) => {
      const create = () => createIntl({ ...getters, cacheSize } as never);
      expect(create).toThrow(RangeError);
      expect(create).toThrow(
        'createIntl: cacheSize is not an integer of at least 1',
      );
    },
  );

  it('reads neither getter while it is created', () => {
    const { locale, timeZone } = reader();
    createIntl({
      locale,
      timeZone,
      formattingLocales: { ar: AR_TAG },
      cacheSize: 1,
    });
    expect(locale).not.toHaveBeenCalled();
    expect(timeZone).not.toHaveBeenCalled();
  });

  it('returns frozen closures that work on their own', () => {
    const intl = createIntl({ ...getters, formattingLocales: { ar: AR_TAG } });
    expect(Object.isFrozen(intl)).toBe(true);
    const { formattingLocale, plural } = intl;
    expect(formattingLocale()).toBe(AR_TAG);
    expect(plural(3)).toBe('few');
  });
});

describe('the getters (SPEC 3.3, ADR 0003)', () => {
  it('reads the locale once per call, on every call, and the zone only for dates', () => {
    const { locale, timeZone } = reader();
    formatAll(createIntl({ locale, timeZone }));
    expect(locale).toHaveBeenCalledTimes(8);
    expect(timeZone).toHaveBeenCalledTimes(2);
  });

  it('does not read the zone when the options name one', () => {
    const { locale, timeZone } = reader();
    const intl = createIntl({ locale, timeZone });
    intl.date(INSTANT, { timeZone: 'UTC' });
    intl.dateRange(INSTANT, INSTANT + DAY_MS, { timeZone: 'UTC' });
    expect(timeZone).not.toHaveBeenCalled();
  });

  it('follows the locale and the zone from one call to the next', () => {
    let locale = 'en';
    let zone = 'UTC';
    const intl = createIntl({
      locale: () => locale,
      timeZone: () => zone,
      formattingLocales: { ar: AR_TAG },
    });
    const day = (): string => intl.date(INSTANT, { day: 'numeric' });
    expect([intl.formattingLocale(), intl.plural(3), day()]).toEqual([
      'en',
      'other',
      '12',
    ]);
    locale = 'ar';
    zone = 'Asia/Riyadh';
    expect([intl.formattingLocale(), intl.plural(3), day()]).toEqual([
      AR_TAG,
      'few',
      '13',
    ]);
  });

  it('formats in the reader zone by default and in a zone the options name', () => {
    const intl = createIntl({
      locale: () => 'en',
      timeZone: () => 'Asia/Riyadh',
    });
    const options = { dateStyle: 'medium', timeStyle: 'short' } as const;
    const riyadh = new Intl.DateTimeFormat('en', {
      ...options,
      timeZone: 'Asia/Riyadh',
    });
    const utc = new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' });
    expect(intl.date(INSTANT, options)).toBe(riyadh.format(INSTANT));
    expect(intl.date(INSTANT, { ...options, timeZone: 'UTC' })).toBe(
      utc.format(INSTANT),
    );
    expect(riyadh.format(INSTANT)).not.toBe(utc.format(INSTANT));
  });
});

describe('the formatting tag (SPEC 3.2)', () => {
  it('reaches every constructor as its only requested locale', () => {
    // date and dateRange share one object: same tag, options, and zone.
    const spies = CONSTRUCTORS.map((name) => vi.spyOn(Intl, name));
    formatAll(
      createIntl({
        ...reader(),
        formattingLocales: { ar: 'ar-sa-u-nu-latn-ca-gregory' },
      }),
    );
    for (const spy of spies) {
      expect(spy.mock.calls.map(([tag]) => tag)).toEqual([AR_TAG]);
    }
  });

  it('passes a locale the map omits through unchanged', () => {
    const spy = vi.spyOn(Intl, 'NumberFormat');
    createIntl({ ...reader('en'), formattingLocales: { ar: AR_TAG } }).number(
      1,
    );
    expect(spy.mock.calls[0]?.[0]).toBe('en');
  });
});

describe('the cache (SPEC 3.4)', () => {
  it('builds one object per constructor, tag, and options', () => {
    const spy = vi.spyOn(Intl, 'NumberFormat');
    const intl = createIntl(reader());
    intl.number(1);
    intl.number(2, {});
    intl.number(3, { style: 'percent' });
    intl.number(4, { currency: undefined, style: 'percent' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('builds a date object per zone', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat');
    let zone = 'UTC';
    const intl = createIntl({ locale: () => 'en', timeZone: () => zone });
    intl.date(INSTANT);
    zone = 'Asia/Riyadh';
    intl.date(INSTANT);
    intl.dateRange(INSTANT, INSTANT + DAY_MS);
    zone = 'UTC';
    intl.date(INSTANT);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('keeps no more objects than cacheSize', () => {
    const spy = vi.spyOn(Intl, 'NumberFormat');
    const intl = createIntl({ ...reader(), cacheSize: 1 });
    intl.number(1);
    intl.number(1, { style: 'percent' });
    intl.number(1);
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
