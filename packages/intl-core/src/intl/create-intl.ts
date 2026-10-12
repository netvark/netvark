/**
 * `createIntl()` (SPEC 3.1, 3.3, ADR 0003): formatters that read the
 * locale and the reader's time zone on every call, each through a cached
 * `Intl` object built for the locale's formatting tag. One set of
 * formatters serves every request on a server and the whole document in a
 * browser; the getters supply the request's or the document's locale and
 * zone.
 * @ref https://tc39.es/ecma402/
 * @packageDocumentation
 */
import { isRecord } from '../internal/is-record';
import { formattingLocales, formattingTag } from './formatting-locales';
import { createIntlCache } from './intl-cache';

const CALLER = 'createIntl';

/** How many `Intl` objects a `createIntl()` result keeps by default (ADR 0003). */
export const DEFAULT_CACHE_SIZE = 256;

/**
 * A point in time: a `Date`, or a time value in milliseconds since the
 * epoch. Never a string: a string's meaning depends on its format, and the
 * caller knows it.
 */
export type DateInput = Date | number;

/**
 * A number to format. A string is read as ECMA-402 reads it: a decimal
 * string keeps every digit, so a PostgreSQL `numeric` read as text formats
 * exactly, and a string that is not numeric formats as NaN.
 * @ref https://tc39.es/ecma402/#sec-tointlmathematicalvalue
 */
export type NumberInput = number | bigint | string;

export interface IntlOptions {
  /** The current locale, read on every call: Paraglide's `getLocale`. */
  readonly locale: () => string;
  /** The reader's IANA time zone, read on every date call whose options name none. */
  readonly timeZone: () => string;
  /**
   * The BCP 47 tag each locale formats with, such as
   * `{ ar: 'ar-SA-u-ca-gregory-nu-latn' }`; a locale missing here formats
   * as itself.
   */
  readonly formattingLocales?: Readonly<Record<string, string>> | undefined;
  /** How many `Intl` objects to keep; `DEFAULT_CACHE_SIZE` by default. */
  readonly cacheSize?: number | undefined;
}

/**
 * Formatters over ECMA-402, each a closure that may be passed on its own.
 * Each call reads the locale once; a date call also reads the time zone
 * once, unless its options name one. Errors from `Intl` propagate
 * unchanged.
 */
export interface IntlFormatters {
  /** The BCP 47 tag the current locale formats with. */
  readonly formattingLocale: () => string;
  /** A date and time, in the reader's zone unless the options name one. */
  readonly date: (
    value: DateInput,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  /** A range of dates and times, in the reader's zone unless the options name one. */
  readonly dateRange: (
    start: DateInput,
    end: DateInput,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  /** A number, a currency amount, a percentage, or a unit, by the options. */
  readonly number: (
    value: NumberInput,
    options?: Intl.NumberFormatOptions,
  ) => string;
  /** `value` units from now: `-1, 'day'` is yesterday. */
  readonly relativeTime: (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
  ) => string;
  /** A conjunction, disjunction, or unit list. */
  readonly list: (
    values: Iterable<string>,
    options?: Intl.ListFormatOptions,
  ) => string;
  /** The name of a language, region, script, currency, calendar, or date field. */
  readonly displayName: (
    code: string,
    options: Intl.DisplayNamesOptions,
  ) => string | undefined;
  /** The plural category of `value`, for choosing a message variant. */
  readonly plural: (
    value: number,
    options?: Intl.PluralRulesOptions,
  ) => Intl.LDMLPluralRule;
  /** The collation order of two strings, for `Array#sort`. */
  readonly compare: (
    left: string,
    right: string,
    options?: Intl.CollatorOptions,
  ) => number;
}

interface IntlConfig {
  readonly tags: ReadonlyMap<string, string>;
  readonly cacheSize: number;
}

/** Checks the options; throws naming the first one `createIntl()` cannot use (SPEC 5). */
function intlConfig(options: IntlOptions): IntlConfig {
  const value: unknown = options;
  if (!isRecord(value)) {
    throw new TypeError(`${CALLER}: options is not an object`);
  }
  for (const getter of ['locale', 'timeZone']) {
    if (typeof value[getter] !== 'function') {
      throw new TypeError(`${CALLER}: ${getter} is not a function`);
    }
  }
  const cacheSize = value['cacheSize'] ?? DEFAULT_CACHE_SIZE;
  if (
    typeof cacheSize !== 'number' ||
    !Number.isInteger(cacheSize) ||
    cacheSize < 1
  ) {
    throw new RangeError(
      `${CALLER}: cacheSize is not an integer of at least 1`,
    );
  }
  return { tags: formattingLocales(value['formattingLocales']), cacheSize };
}

/**
 * What `Intl.NumberFormat` reads `value` as: a string that is not a
 * StringNumericLiteral has no mathematical value and formats as NaN.
 * @ref https://tc39.es/ecma402/#sec-tointlmathematicalvalue
 */
function numberValue(
  value: NumberInput,
): number | bigint | Intl.StringNumericLiteral {
  if (typeof value !== 'string' || isNumericString(value)) {
    return value;
  }
  return Number.NaN;
}

/** StringToNumber parses the same grammar, StringNumericLiteral, and fails with NaN. */
function isNumericString(value: string): value is Intl.StringNumericLiteral {
  return !Number.isNaN(Number(value));
}

/** Formatters for the locale and the zone the getters return at each call. */
export function createIntl(options: IntlOptions): IntlFormatters {
  const { tags, cacheSize } = intlConfig(options);
  const { locale, timeZone } = options;
  const cache = createIntlCache(cacheSize);
  const dateTimeFormat = cache.getter(
    'DateTimeFormat',
    (tag, init: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(tag, init),
  );
  const numberFormat = cache.getter(
    'NumberFormat',
    (tag, init: Intl.NumberFormatOptions) => new Intl.NumberFormat(tag, init),
  );
  const relativeTimeFormat = cache.getter(
    'RelativeTimeFormat',
    (tag, init: Intl.RelativeTimeFormatOptions) =>
      new Intl.RelativeTimeFormat(tag, init),
  );
  const listFormat = cache.getter(
    'ListFormat',
    (tag, init: Intl.ListFormatOptions) => new Intl.ListFormat(tag, init),
  );
  const displayNames = cache.getter(
    'DisplayNames',
    (tag, init: Intl.DisplayNamesOptions) => new Intl.DisplayNames(tag, init),
  );
  const pluralRules = cache.getter(
    'PluralRules',
    (tag, init: Intl.PluralRulesOptions) => new Intl.PluralRules(tag, init),
  );
  const collator = cache.getter(
    'Collator',
    (tag, init: Intl.CollatorOptions) => new Intl.Collator(tag, init),
  );

  const tag = (): string => formattingTag(tags, locale());
  /** The options with the reader's zone, unless they name one. */
  const zoned = (
    init: Intl.DateTimeFormatOptions = {},
  ): Intl.DateTimeFormatOptions =>
    init.timeZone === undefined ? { ...init, timeZone: timeZone() } : init;

  const formatters: IntlFormatters = {
    formattingLocale: tag,
    date: (value, init) => dateTimeFormat(tag(), zoned(init)).format(value),
    dateRange: (start, end, init) =>
      dateTimeFormat(tag(), zoned(init)).formatRange(start, end),
    number: (value, init = {}) =>
      numberFormat(tag(), init).format(numberValue(value)),
    relativeTime: (value, unit, init = {}) =>
      relativeTimeFormat(tag(), init).format(value, unit),
    list: (values, init = {}) => listFormat(tag(), init).format(values),
    displayName: (code, init) => displayNames(tag(), init).of(code),
    plural: (value, init = {}) => pluralRules(tag(), init).select(value),
    compare: (left, right, init = {}) =>
      collator(tag(), init).compare(left, right),
  };
  return Object.freeze(formatters);
}
