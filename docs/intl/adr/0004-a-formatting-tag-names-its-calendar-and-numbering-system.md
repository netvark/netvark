# ADR 0004: A formatting tag names its calendar and numbering system

- Status: accepted
- Date: 2026-10-12

## Context

An application's locales are short codes (`en`, `ar`) because they appear in URLs, cookies, and
message keys. `Intl` resolves a code's calendar and digits from the CLDR data of the engine it runs
on, and engines disagree (2026-10-12):

| Call                                                          | Node 24.20 (ICU 78.3) | Bun 1.4.2 (ICU 76.1) | Deno 2.1.4         | Node 18.14 (ICU 72.1) |
| ------------------------------------------------------------- | --------------------- | -------------------- | ------------------ | --------------------- |
| `new Intl.DateTimeFormat('ar-SA').resolvedOptions().calendar` | `gregory`             | `islamic-umalqura`   | `islamic-umalqura` | `islamic-umalqura`    |
| `new Intl.NumberFormat('ar').format(1234.5)`                  | `1,234.5`             | `1,234.5`            | `1,234.5`          | `١٬٢٣٤٫٥`             |
| `new Intl.NumberFormat('ar-SA').format(1234.5)`               | `١٬٢٣٤٫٥`             | `١٬٢٣٤٫٥`            | `١٬٢٣٤٫٥`          | `١٬٢٣٤٫٥`             |
| the same with `ar-SA-u-ca-gregory-nu-latn`                    | `gregory`, `1,234.5`  | same                 | same               | same                  |

A server and a browser on different engines render one value two ways, and hydration replaces the
server's text with the browser's. The Unicode locale extension keys `ca` (calendar algorithm) and
`nu` (numbering system) name both explicitly
([UTS #35, Key/Type Definitions](https://www.unicode.org/reports/tr35/#Key_Type_Definitions)), and
ECMA-402 reads them: `ca`, `hc`, and `nu` are `Intl.DateTimeFormat`'s relevant extension keys, `nu`
is `Intl.NumberFormat`'s
([ECMA-402, 11.2.3 and 16.2.3](https://tc39.es/ecma402/#sec-intl.datetimeformat-internal-slots)).

## Decision

- `createIntl({ formattingLocales })` maps each locale `locale()` can return to the BCP 47 tag it
  formats with; a locale the map omits formats as itself. Each tag is canonicalized with
  `Intl.getCanonicalLocales()` when `createIntl()` runs, which also refuses a malformed one.
- The documentation recommends a tag with `-u-ca-` and `-u-nu-` for every locale whose defaults
  differ between engines, and names the measurement above.

## Consequences

Output is a function of the tag and the options, not of the engine's CLDR version, for the calendar
and the digits. Other CLDR changes (a month name's spelling, a separator) still differ between
engine versions; the e2e suite's agreement test runs server and browser on one engine, and the docs
say so.
