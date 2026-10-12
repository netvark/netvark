import { describe, expect, it } from 'vitest';

import { formattingLocales, formattingTag } from './formatting-locales';

describe('formattingLocales (SPEC 3.1, 3.2)', () => {
  it('is empty when no map is given', () => {
    const options: { formattingLocales?: unknown } = {};
    expect(formattingLocales(options.formattingLocales).size).toBe(0);
  });

  it('canonicalizes each tag once', () => {
    const tags = formattingLocales({
      ar: 'AR-sa-u-nu-latn-ca-gregory',
      en: 'en-us',
    });
    expect([...tags]).toEqual([
      ['ar', 'ar-SA-u-ca-gregory-nu-latn'],
      ['en', 'en-US'],
    ]);
  });

  it('keeps every own key as a locale, prototype names included', () => {
    const tags = formattingLocales(JSON.parse('{"__proto__": "ar-SA"}'));
    expect(formattingTag(tags, '__proto__')).toBe('ar-SA');
    expect(formattingTag(tags, 'constructor')).toBe('constructor');
  });

  it('refuses a map that is not an object', () => {
    for (const value of [null, ['ar-SA'], 'ar-SA', () => 'ar-SA']) {
      expect(() => formattingLocales(value)).toThrow(
        new TypeError('createIntl: formattingLocales is not an object'),
      );
    }
  });

  it('refuses a tag that is not a string, naming the locale', () => {
    expect(() => formattingLocales({ ar: ['ar-SA'] })).toThrow(
      new TypeError('createIntl: formattingLocales.ar is not a string'),
    );
  });

  it('refuses a tag that is not structurally valid, naming the locale but not the tag', () => {
    for (const tag of ['', 'ar_SA', 'ar-SA-u', 'not a tag']) {
      expect(() => formattingLocales({ ar: tag })).toThrow(
        new RangeError(
          'createIntl: formattingLocales.ar is not a BCP 47 language tag',
        ),
      );
    }
  });
});

describe('formattingTag (SPEC 3.2)', () => {
  const tags = formattingLocales({ ar: 'ar-SA-u-ca-gregory-nu-latn' });

  it('is the configured tag of a configured locale', () => {
    expect(formattingTag(tags, 'ar')).toBe('ar-SA-u-ca-gregory-nu-latn');
  });

  it('is the locale itself otherwise, exactly as given', () => {
    expect(formattingTag(tags, 'en')).toBe('en');
    expect(formattingTag(tags, 'AR')).toBe('AR');
  });
});
