# intl: hydration-safe formatting and bidi isolation for Paraglide apps

Formatting and message isolation for server-rendered applications that use
[Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs), as two packages:

| Package                                                    | What it is                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@netvark/intl-core`](../../packages/intl-core)           | Formatters that read the locale and the reader's time zone on every call, each through a cached `Intl` object built for a formatting tag that names its calendar and digits; the reader's time zone from a cookie, the same during SSR and after hydration; `isolate()`. Web standards only, no dependencies. |
| [`@netvark/paraglide-intl`](../../packages/paraglide-intl) | Paraglide's `compile()` with every interpolated value wrapped in Unicode bidi isolates and every message that formats a value refused. Re-exports the core.                                                                                                                                                   |

Why each piece exists, with the measurements, is in [`DESIGN.md`](DESIGN.md); the contract is in
[`SPEC.md`](SPEC.md); the decisions are in [`adr/`](adr).

## Install

```bash
pnpm add @netvark/intl-core                                   # formatters and time zones
pnpm add -D @netvark/paraglide-intl @inlang/paraglide-js @inlang/sdk  # the compile step
```

`@netvark/intl-core` runs on Node 22.12+, Bun, Deno, Cloudflare Workers, and browsers.
`@netvark/paraglide-intl` runs at build time on Node 22.12+, Bun, and Deno, and takes
`@inlang/paraglide-js` and `@inlang/sdk` as peers: install the SDK major your Paraglide uses. It
re-exports the core for build scripts, but its entry also loads the inlang SDK, so application code
imports the formatters from `@netvark/intl-core`.

## Quick start

```ts
// src/lib/intl.ts, shared by the server and the browser
import { createIntl, createTimeZone } from '@netvark/intl-core';

import { getLocale } from './paraglide/runtime.js';

export const timeZone = createTimeZone({ cookieName: 'TIME_ZONE' });
export const intl = createIntl({
  locale: getLocale,
  timeZone: timeZone.get,
  formattingLocales: { ar: 'ar-SA-u-ca-gregory-nu-latn', en: 'en-US' },
});

intl.date(order.placedAt, { dateStyle: 'medium' }); // in the reader's zone
intl.number(order.total, { style: 'currency', currency: 'SAR' });
intl.number(row.amount); // a PostgreSQL numeric read as text keeps every digit
```

```ts
// the server entry: one scope per request, filled from the request's cookie
import { AsyncLocalStorage } from 'node:async_hooks';

import { timeZone } from './lib/intl';
import { paraglideMiddleware } from './lib/paraglide/server.js';

timeZone.useScope(new AsyncLocalStorage());
export default {
  fetch: (request: Request) =>
    paraglideMiddleware(request, ({ request }) =>
      timeZone.run(request, () => handler.fetch(request)),
    ),
};
```

```ts
// scripts/compile-messages.ts, run before the bundler instead of Paraglide's compile()
import { compile } from '@netvark/paraglide-intl';

const { warnings } = await compile({ project: './project.inlang', outdir: './src/lib/paraglide' });
for (const warning of warnings) console.warn(warning);
```

`m.shared_by({ name: 'محمد', count: 2 })` now returns `Shared by ⁨محمد⁩ (⁨2⁩)`, which every browser
displays in order.

## Best practices

- **Name the calendar and the digits** in every formatting tag whose defaults differ between
  engines: `ar-SA-u-ca-gregory-nu-latn`, not `ar-SA`. Engines disagree on both (ADR 0004).
- **Store the reader's zone in a cookie** beside Paraglide's locale cookie: seed it in the browser
  with `document.cookie = timeZoneCookie(detectTimeZone() ?? 'UTC', { name: 'TIME_ZONE' })` when it
  is missing, and set it from the profile on sign-in. Never format a render in the device's zone
  (ADR 0005).
- **Create the formatters once, at module scope.** They read the locale and the zone on every call
  (ADR 0003); the cache makes repeated formats cheap.
- **Format outside the message, interpolate the string.** `compile()` refuses `{x: number}` and
  `{x: datetime}`; pass `intl.number(x)` instead, and keep `plural` selecting on the raw count (ADR
  0008).
- **Expect the isolates in tests** that compare a message with a value: `'⁨'` and `'⁩'` around it.
  Strip U+2066 to U+2069 from text a user pastes into a search field (ADR 0006).
- **Check catalogs with `inlang check`** in CI and before a push, with
  `@inlang/plugin-m-function-matcher` 2.3+ in the project's modules so unused messages are found:
  Paraglide renders the base locale for a missing translation and the message key for a missing
  plural form (ADR 0009).
- **Call message functions where they render**, never at module scope: a message called at import
  keeps the first request's locale, like any formatter would.
