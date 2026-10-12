/**
 * Formatting tags (SPEC 3.2, ADR 0004). An application's locales are short
 * codes, and an engine resolves a code's calendar and digits from its own
 * CLDR data, so each locale may name the BCP 47 tag it formats with
 * (`ar` to `ar-SA-u-ca-gregory-nu-latn`). Each tag is checked and
 * canonicalized once, when `createIntl()` runs; a locale the map omits
 * formats as itself.
 * @ref https://tc39.es/ecma402/#sec-intl.getcanonicallocales
 * @ref https://www.unicode.org/reports/tr35/#Key_Type_Definitions (`ca` and `nu`)
 * @packageDocumentation
 */
import { isRecord } from '../internal/is-record';

const CALLER = 'createIntl';

/**
 * Each configured locale's canonical tag. Throws `TypeError` when the map
 * is not an object or holds a value that is not a string, and `RangeError`
 * when a value is not a structurally valid tag, naming the locale.
 */
export function formattingLocales(value: unknown): ReadonlyMap<string, string> {
  const tags = new Map<string, string>();
  if (value === undefined) {
    return tags;
  }
  if (!isRecord(value)) {
    throw new TypeError(`${CALLER}: formattingLocales is not an object`);
  }
  for (const [locale, tag] of Object.entries(value)) {
    if (typeof tag !== 'string') {
      throw new TypeError(
        `${CALLER}: formattingLocales.${locale} is not a string`,
      );
    }
    tags.set(locale, canonicalTag(locale, tag));
  }
  return tags;
}

function canonicalTag(locale: string, tag: string): string {
  let canonical: Array<string>;
  try {
    canonical = Intl.getCanonicalLocales(tag);
  } catch {
    // A RangeError naming the tag: the message names the locale instead.
    throw new RangeError(
      `${CALLER}: formattingLocales.${locale} is not a BCP 47 language tag`,
    );
  }
  // One tag in, one canonical tag out.
  return canonical.join();
}

/** The tag `locale` formats with: its configured tag, or itself. */
export function formattingTag(
  tags: ReadonlyMap<string, string>,
  locale: string,
): string {
  return tags.get(locale) ?? locale;
}
