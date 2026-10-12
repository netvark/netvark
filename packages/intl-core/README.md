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
