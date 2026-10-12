import type {
  DateInput,
  IntlFormatters,
  IntlOptions,
  NumberInput,
} from './create-intl';

import { describe, expectTypeOf, it } from 'vitest';

import { createIntl } from './create-intl';

/** Paraglide's `getLocale` returns a union of the project's locales. */
declare const getLocale: () => 'en' | 'ar';
/** pg-catalog types a `numeric` column as text. */
declare const numeric: string;
declare const intl: IntlFormatters;

describe('createIntl types (SPEC 3)', () => {
  it('takes a getter of a locale union, such as Paraglide getLocale', () => {
    expectTypeOf(createIntl).toBeCallableWith({
      locale: getLocale,
      timeZone: () => 'UTC',
      formattingLocales: { ar: 'ar-SA-u-ca-gregory-nu-latn' },
      cacheSize: 64,
    });
    expectTypeOf<IntlOptions['locale']>().toEqualTypeOf<() => string>();
  });

  it('takes a date or a time value, never a string', () => {
    expectTypeOf<DateInput>().toEqualTypeOf<Date | number>();
    // @ts-expect-error a string's meaning depends on its format
    intl.date('2026-10-12');
    // @ts-expect-error the same for a range
    intl.dateRange('2026-10-12', new Date());
  });

  it('takes a number, a bigint, or text such as a PostgreSQL numeric', () => {
    expectTypeOf<NumberInput>().toEqualTypeOf<number | bigint | string>();
    expectTypeOf(intl.number).toBeCallableWith(numeric);
    expectTypeOf(intl.number).toBeCallableWith(12n);
  });

  it('requires the display name options, which name the type', () => {
    // @ts-expect-error Intl.DisplayNames requires `type`
    intl.displayName('SA');
    expectTypeOf(intl.displayName('SA', { type: 'region' })).toEqualTypeOf<
      string | undefined
    >();
  });

  it('returns the plural category and passes each formatter on its own', () => {
    expectTypeOf(intl.plural(3)).toEqualTypeOf<Intl.LDMLPluralRule>();
    const cell: (value: number) => string = intl.number;
    const byName: (left: string, right: string) => number = intl.compare;
    expectTypeOf(cell).toBeFunction();
    expectTypeOf(byName).toBeFunction();
  });
});
