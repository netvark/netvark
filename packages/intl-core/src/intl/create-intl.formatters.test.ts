import { describe, expect, it } from 'vitest';

import { createIntl } from './create-intl';

const AR_TAG = 'ar-SA-u-ca-gregory-nu-latn';
const ZONE = 'Asia/Riyadh';
const INSTANT = Date.UTC(2026, 9, 12, 21, 30);
const LATER = Date.UTC(2026, 9, 15, 8);
const DECIMAL_TEXT = '12345678901234567890.123456789';
const NINE = 9;

/** The formatters for `locale`, and the tag a fresh `Intl` object needs for the same output. */
function setup(locale: 'en' | 'ar') {
  const intl = createIntl({
    locale: () => locale,
    timeZone: () => ZONE,
    formattingLocales: { ar: AR_TAG },
  });
  return { intl, tag: locale === 'ar' ? AR_TAG : 'en' };
}

describe.each(['en', 'ar'] as const)(
  'each formatter in %s matches a fresh Intl object with the formatting tag (SPEC 3.3)',
  (locale) => {
    const { intl, tag } = setup(locale);

    it('date and dateRange, in the reader zone', () => {
      const options = { dateStyle: 'full', timeStyle: 'short' } as const;
      const fresh = new Intl.DateTimeFormat(tag, {
        ...options,
        timeZone: ZONE,
      });
      expect(intl.date(INSTANT, options)).toBe(fresh.format(INSTANT));
      expect(intl.date(new Date(INSTANT), options)).toBe(fresh.format(INSTANT));
      expect(intl.dateRange(INSTANT, LATER, options)).toBe(
        fresh.formatRange(INSTANT, LATER),
      );
    });

    it('number, through its options', () => {
      const cases: ReadonlyArray<Intl.NumberFormatOptions> = [
        {},
        { style: 'currency', currency: 'SAR' },
        { style: 'percent', maximumFractionDigits: 1 },
        { style: 'unit', unit: 'kilometer-per-hour', unitDisplay: 'long' },
        { notation: 'compact' },
      ];
      for (const options of cases) {
        expect(intl.number(1234.5678, options)).toBe(
          new Intl.NumberFormat(tag, options).format(1234.5678),
        );
      }
    });

    it('number keeps every digit of a bigint and of a decimal string', () => {
      const fresh = new Intl.NumberFormat(tag, { maximumFractionDigits: NINE });
      expect(intl.number(DECIMAL_TEXT, { maximumFractionDigits: NINE })).toBe(
        fresh.format(DECIMAL_TEXT),
      );
      expect(
        intl.number(DECIMAL_TEXT, { maximumFractionDigits: NINE }),
      ).not.toBe(fresh.format(Number(DECIMAL_TEXT)));
      expect(intl.number(2n ** 70n)).toBe(fresh.format(2n ** 70n));
    });

    it('number formats a string that is not numeric as NaN, as Intl does', () => {
      const fresh = new Intl.NumberFormat(tag);
      for (const text of ['abc', '12abc', 'NaN', '1n']) {
        expect(intl.number(text)).toBe(fresh.format(Number.NaN));
      }
      expect(intl.number(' 0x1F ')).toBe(fresh.format(31));
    });

    it('relativeTime, list, displayName, plural, and compare', () => {
      expect(intl.relativeTime(-1, 'day', { numeric: 'auto' })).toBe(
        new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }).format(-1, 'day'),
      );
      expect(intl.list(['Casey', 'محمد', 'Ana'], { type: 'disjunction' })).toBe(
        new Intl.ListFormat(tag, { type: 'disjunction' }).format([
          'Casey',
          'محمد',
          'Ana',
        ]),
      );
      expect(intl.displayName('SA', { type: 'region' })).toBe(
        new Intl.DisplayNames(tag, { type: 'region' }).of('SA'),
      );
      expect([0, 1, 2, 3, 11, 100].map((n) => intl.plural(n))).toEqual(
        [0, 1, 2, 3, 11, 100].map((n) => new Intl.PluralRules(tag).select(n)),
      );
      const words = ['b', 'a10', 'B', 'a2', 'á'];
      const fresh = new Intl.Collator(tag, { numeric: true });
      expect(
        words.toSorted((x, y) => intl.compare(x, y, { numeric: true })),
      ).toEqual(words.toSorted((x, y) => fresh.compare(x, y)));
    });
  },
);

describe('errors from Intl propagate unchanged (SPEC 3.3)', () => {
  const { intl } = setup('en');

  it('an invalid time value', () => {
    const expected = captured(() =>
      new Intl.DateTimeFormat('en').format(Number.NaN),
    );
    expect(() => intl.date(Number.NaN)).toThrow(expected);
    expect(() => intl.dateRange(0, Number.NaN)).toThrow(RangeError);
  });

  it('an unknown time zone', () => {
    const intlIn = createIntl({
      locale: () => 'en',
      timeZone: () => 'Mars/Olympus',
    });
    expect(() => intlIn.date(INSTANT)).toThrow(RangeError);
  });

  it('a tag Intl refuses, from the locale getter', () => {
    const intlIn = createIntl({ locale: () => 'en_US', timeZone: () => ZONE });
    expect(() => intlIn.number(1)).toThrow(RangeError);
  });

  it('an option out of range, and a missing required option', () => {
    expect(() => intl.number(1, { maximumFractionDigits: 101 })).toThrow(
      RangeError,
    );
    expect(() => intl.displayName('SA', {} as never)).toThrow(TypeError);
  });
});

function captured(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
  }
  throw new Error('expected a throw');
}
