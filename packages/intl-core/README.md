# @netvark/intl-core

Hydration-safe formatting for any JavaScript runtime, built for server-rendered applications that
localize with [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) and usable
without it. Every rule is a cited clause of Unicode, ECMA-402, or an RFC; where a choice is the
library's, it is written down in
[`docs/intl/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/intl/SPEC.md), and the
decisions, with their measurements, in
[`docs/intl/adr`](https://github.com/netvark/netvark/tree/main/docs/intl/adr).

Compiling Paraglide messages?
[`@netvark/paraglide-intl`](https://www.npmjs.com/package/@netvark/paraglide-intl) wraps every
interpolated value of every message in the isolates below when it compiles them, and re-exports all
of this package.

## Install

```bash
pnpm add @netvark/intl-core
```

No dependencies. Node 22.12+, Bun, Deno, Cloudflare Workers, and browsers are supported; the package
uses web standards only and never reads the environment.

## Format dates, numbers, and the rest

```ts
// src/lib/intl.ts: created once, at module scope, shared by the server and the browser
import { createIntl } from '@netvark/intl-core';

import { getLocale } from './paraglide/runtime.js';

export const intl = createIntl({
  locale: getLocale,
  timeZone: readerTimeZone, // () => the reader's IANA time zone
  formattingLocales: { ar: 'ar-SA-u-ca-gregory-nu-latn', en: 'en-US' },
});
```

```ts
intl.date(order.placedAt, { dateStyle: 'medium', timeStyle: 'short' }); // in the reader's zone
intl.dateRange(trip.start, trip.end, { dateStyle: 'medium' });
intl.number(order.total, { style: 'currency', currency: 'SAR' });
intl.number(row.amount); // a PostgreSQL numeric read as text keeps every digit
intl.relativeTime(-1, 'day', { numeric: 'auto' }); // "yesterday"
intl.list(names, { type: 'conjunction' });
intl.displayName('SA', { type: 'region' });
intl.plural(count); // 'one', 'few', 'many', ...
rows.toSorted((a, b) => intl.compare(a.name, b.name));
```

Each formatter reads `locale()` on every call, and a date formatter reads `timeZone()` too unless
its options name a zone, so one set of formatters serves every request on a server and the whole
document in a browser. A formatter that read the locale once would keep whichever request loaded it
first. Each call takes its `Intl` object from a cache of the 256 most recently used ones
(`cacheSize`), keyed by the constructor, the formatting tag, and the options: building an
`Intl.DateTimeFormat` costs about 44 µs, reusing one about 1 µs. `Intl`'s own errors propagate
unchanged.

### Formatting tags

An application's locales are short codes, and engines disagree on what a code formats with: `ar-SA`
formats with the Gregorian calendar on Node 24 and with the Islamic calendar on Bun 1.4, Deno 2.1,
and Node 18, and `Intl.NumberFormat('ar')` writes Arabic-Indic digits on Node 18 only. A server and
a browser on different engines then render one date two ways, and hydration replaces the server's
text with the browser's. `formattingLocales` maps each locale to the BCP 47 tag it formats with, and
the Unicode extension keys `ca` (calendar) and `nu` (numbering system) pin both
([UTS #35](https://www.unicode.org/reports/tr35/#Key_Type_Definitions)). Each tag is canonicalized
when `createIntl()` runs, and a malformed one throws there. A locale the map omits formats as
itself.

### Best practices

- **Create the formatters once, at module scope**, and import them where you render. They keep no
  locale and no zone, only the cache.
- **Name the calendar and the digits** in every formatting tag whose defaults differ between
  engines: `ar-SA-u-ca-gregory-nu-latn`, not `ar-SA`. Other CLDR data can still differ between
  engine versions (Bun 1.4 writes a comma between an Arabic month and year, Node 24 does not), so
  text that must match byte for byte is formatted on the server and sent as a string.
- **Call the formatters where they render**, never at module scope: a value formatted at import
  keeps the first request's locale.
- **Pass a `Date` or a time value**, never a string: parse the string where you know its format.
- **Pass PostgreSQL `numeric` and `int8` text as it is**: `intl.number(row.amount)` keeps every
  digit, where `Number(row.amount)` can lose digits beyond 15 significant ones. A string that is not
  numeric formats as NaN, as `Intl` does.
- **Name a zone only for a place**, such as a store's opening hours in the store's zone
  (`{ timeZone: store.timeZone }`); everything about the reader uses the reader's zone.
- **Keep option values plain**: strings, numbers, and booleans. An options object that holds
  anything else builds a new `Intl` object on every call.
- **Wrap a formatter you pass to `map`**: `values.map(intl.number)` would hand each index over as
  the options; TypeScript refuses it, so write `values.map((value) => intl.number(value))`.

## Isolate an interpolated value

```ts
import { isolate } from '@netvark/intl-core';

const title = `Shared by ${isolate(owner.name)} (${isolate(String(count))})`;
```

A value inserted into a sentence takes part in the sentence's bidirectional layout. In
`Shared by محمد (2)`, the `(2)` displays before the Arabic name, because the digits take their
direction from the strong character before them
([UAX #9, W2 and W7](https://www.unicode.org/reports/tr9/#W2)). `isolate(value)` returns the value
between U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE: outside, the value counts as
one neutral character; inside, it takes the direction of its own first strong character
([UAX #9, 2.4](https://www.unicode.org/reports/tr9/#Explicit_Directional_Isolates)). The name then
displays in place in both directions, the way a `<bdi>` element displays it in markup.

Every string is wrapped, the empty string and an already isolated one included, in every locale: a
value's direction is the data's, not the locale's. The constants `FIRST_STRONG_ISOLATE` and
`POP_DIRECTIONAL_ISOLATE` are the two characters.

### Best practices

- **Isolate every value whose direction you do not control** in text that is not markup: a `title`
  or `aria-label` attribute, `document.title`, a notification, an email subject, an `<option>`. In
  markup, `<bdi>` does the same
  ([W3C, How to use Unicode controls for bidi text](https://www.w3.org/International/questions/qa-bidi-unicode-controls)).
- **Isolate numbers next to names too**: inside an isolate, digits resolve on their own.
- **Remove bidi controls from names and other text you accept from users**, where you accept it:
  `value.replace(/\p{Bidi_Control}/gu, '')`. `isolate` never rewrites a value, and a value that
  carries its own unmatched U+2069 closes the isolate early, after which an override reverses the
  rest of the sentence ([UAX #9, BD9](https://www.unicode.org/reports/tr9/#BD9); measured in ADR
  0006).
- **Never isolate a value that is not displayed as text**: a URL, an `href`, an identifier, a key.
  The isolates are characters and travel with the string.
- **Expect the isolates in tests** that compare a sentence with a value: `isolate(name)`, or
  `'\u2068'` and `'\u2069'` around it. Text copied from the page carries them too, so strip U+2066
  to U+2069 from text a user pastes into a search field.

## License

MIT
