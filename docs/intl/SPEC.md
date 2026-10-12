# intl: implementation specification

- Status: normative for the 0.x line of `@netvark/intl-core` and `@netvark/paraglide-intl`;
  `docs/intl/DESIGN.md` explains the why

The key words MUST, MUST NOT, SHOULD, and MAY are used as in RFC 2119. Every section names the
source file that implements it and the decision records behind it. When this document and the code
disagree, fix one of them in the same pull request. "ECMA-402" is the
[ECMAScript Internationalization API](https://tc39.es/ecma402/) draft of 2026-10-12; "UAX #9" is the
[Unicode Bidirectional Algorithm](https://www.unicode.org/reports/tr9/), revision 52 (Unicode 18.0).

Contents

1. Public surface and module map
2. Isolation
3. Formatters
4. Time zones
5. Errors
6. Paraglide binding (`@netvark/paraglide-intl`)
7. Test plan
8. Packaging and support
9. Constants

---

## 1. Public surface and module map

Two packages (ADR 0002). `@netvark/intl-core` is the core: web standards only, no dependencies,
nothing imported from Paraglide or the inlang SDK. `@netvark/paraglide-intl` is the Paraglide
binding: it depends on the core through `workspace:^`, re-exports all of it, and adds `compile()`.
`@inlang/paraglide-js` and `@inlang/sdk` are its peer dependencies (root ADR 0009).

| Package                   | Exports                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@netvark/intl-core`      | Values: `isolate`, `createIntl`, `toTimeZone`, `detectTimeZone`, `timeZoneFromCookie`, `timeZoneCookie`, `createTimeZone`, and the constants `FIRST_STRONG_ISOLATE`, `POP_DIRECTIONAL_ISOLATE`, `DEFAULT_CACHE_SIZE`, `DEFAULT_TIME_ZONE`, `TIME_ZONE_COOKIE_MAX_AGE`. Types: `IntlOptions`, `IntlFormatters`, `DateInput`, `NumberInput`, `TimeZoneCookieOptions`, `TimeZoneOptions`, `TimeZoneResolver`, `RequestScope` |
| `@netvark/paraglide-intl` | Everything of `@netvark/intl-core` (the same bindings), plus `compile` and `MessageFormattingError`; and the types `CompileOptions`, `CompileResult`, `FormattingFinding`                                                                                                                                                                                                                                                 |

`e2e/intl/package-surface.e2e.test.ts` asserts the exact value export list of both built packages
and that the binding's re-exports are the core's own bindings.

```
packages/intl-core/src/
  index.ts                    the public surface (re-exports only)
  isolate.ts                  isolate and the two isolate characters (section 2)
  intl/
    create-intl.ts            createIntl and the formatters (section 3)
    formatting-locales.ts     the formatting tag of a locale (3.2)
    intl-cache.ts             the bounded cache of Intl objects (3.4)
  internal/
    is-record.ts              the options-object check
  time-zone/
    to-time-zone.ts           toTimeZone, detectTimeZone (4.1, 4.2)
    cookie.ts                 timeZoneFromCookie, timeZoneCookie (4.3)
    create-time-zone.ts       createTimeZone (4.4)
packages/paraglide-intl/src/
  index.ts                    the public surface
  compile.ts                  compile (6.1)
  compile-options.ts          the binding's own options (6.1)
  isolate-patterns.ts         the pattern rewrite (6.2)
  formatting-annotations.ts   the annotations a message formats with (6.3)
```

Every module with behavior has a sibling `*.test.ts`; contract types have `*.test-d.ts`.

## 2. Isolation (`isolate.ts`, ADR 0006)

- `FIRST_STRONG_ISOLATE` is U+2068 and `POP_DIRECTIONAL_ISOLATE` is U+2069, typed `string`: a
  literal type would print the invisible character itself in declarations and editor hovers. The
  published code writes both as escapes.
- `isolate(value)` MUST return `FIRST_STRONG_ISOLATE + value + POP_DIRECTIONAL_ISOLATE` for every
  string, the empty string and an already isolated one included. Outside the isolate the value
  counts as one neutral character, and inside it takes its direction from its first strong character
  (UAX #9, 2.4, and rule X5c).
- `isolate` MUST NOT rewrite the value. A value whose own isolate controls are unbalanced escapes:
  an unmatched U+2069 in it closes the isolate, and an unmatched U+2066, U+2067, or U+2068 takes the
  closing U+2069 (UAX #9, BD9), as inside a `<bdi>` element (CSS Writing Modes 3, 2.4.2).
  Applications remove `\p{Bidi_Control}` from text they accept from users (ADR 0006).

## 3. Formatters (`intl/`, ADR 0003, ADR 0004)

### 3.1 `createIntl(options)` (`create-intl.ts`)

```ts
interface IntlOptions {
  readonly locale: () => string;
  readonly timeZone: () => string;
  readonly formattingLocales?: Readonly<Record<string, string>>;
  readonly cacheSize?: number;
}
```

- `locale` MUST be a function; it returns the application's current locale (Paraglide's
  `getLocale`). `timeZone` MUST be a function; it returns the reader's IANA time zone (4.4).
- `formattingLocales`, when given, MUST be an object whose own enumerable values are strings; each
  value MUST be a structurally valid BCP 47 language tag, checked and canonicalized once with
  `Intl.getCanonicalLocales()`.
- `cacheSize`, when given, MUST be an integer of at least 1; it defaults to `DEFAULT_CACHE_SIZE`.
- A violation throws when `createIntl()` runs (section 5). Nothing else is validated ahead of a
  call: a locale or zone a getter returns is checked by `Intl` itself when an object is built.

### 3.2 The formatting tag (`formatting-locales.ts`)

The formatting tag of a locale `l` is the canonicalized `formattingLocales[l]` when
`Object.hasOwn(formattingLocales, l)`, and `l` itself otherwise. `formattingLocale()` returns the
formatting tag of `locale()`. Every `Intl` object a formatter uses MUST be built with the formatting
tag of the locale `locale()` returned for that call, as its only requested locale.

### 3.3 The formatters (`create-intl.ts`)

`createIntl()` returns an `IntlFormatters`, a frozen object whose methods are closures, so a method
MAY be passed on its own (`intl.date` as a cell formatter). Each method calls `locale()` exactly
once; the date methods also call `timeZone()` exactly once, and only when their options name no
`timeZone`.

| Method                                | Builds                                               | Returns                   |
| ------------------------------------- | ---------------------------------------------------- | ------------------------- |
| `formattingLocale()`                  | nothing                                              | the formatting tag        |
| `date(value, options?)`               | `Intl.DateTimeFormat(tag, { ...options, timeZone })` | `format(value)`           |
| `dateRange(start, end, options?)`     | `Intl.DateTimeFormat(tag, { ...options, timeZone })` | `formatRange(start, end)` |
| `number(value, options?)`             | `Intl.NumberFormat(tag, options)`                    | `format(value)`           |
| `relativeTime(value, unit, options?)` | `Intl.RelativeTimeFormat(tag, options)`              | `format(value, unit)`     |
| `list(values, options?)`              | `Intl.ListFormat(tag, options)`                      | `format(values)`          |
| `displayName(code, options)`          | `Intl.DisplayNames(tag, options)`                    | `of(code)`                |
| `plural(value, options?)`             | `Intl.PluralRules(tag, options)`                     | `select(value)`           |
| `compare(left, right, options?)`      | `Intl.Collator(tag, options)`                        | `compare(left, right)`    |

- `DateInput` is `Date | number` (a time value in milliseconds). The date methods MUST NOT parse
  strings: a string's meaning depends on its format, and the caller knows it.
- `timeZone` in the table is `options.timeZone` when that is not `undefined`, and `timeZone()`
  otherwise.
- `NumberInput` is `number | bigint | string`. A string is read as ECMA-402 reads it
  ([ToIntlMathematicalValue](https://tc39.es/ecma402/#sec-tointlmathematicalvalue)): a
  StringNumericLiteral formats exactly, so a PostgreSQL `numeric` read as text (which pg-catalog
  types `string`) keeps its digits, and any other string formats as NaN.
- Errors from `Intl` propagate unchanged: a `RangeError` for an invalid time value
  ([PartitionDateTimePattern](https://tc39.es/ecma402/#sec-partitiondatetimepattern), step 2), an
  unknown time zone, an option out of range, or a tag `Intl` refuses.

### 3.4 The cache (`intl-cache.ts`)

- Each `createIntl()` result owns one cache. A formatter takes its `Intl` object from the cache
  under the key made of the constructor's name, the formatting tag, and the options: the own
  enumerable entries whose value is not `undefined`, sorted by name, each value with its type. The
  zone a date method fills in is part of its options. The constructor receives a copy of the own
  enumerable entries, so it reads exactly what the key is made of, each getter once.
- An options object with a value that is not a string, a finite or infinite number, or a boolean
  MUST NOT be cached: the object is built for that call only.
- On a hit the entry becomes the most recently used; on a miss with a full cache the least recently
  used entry is dropped before the new one is added. The cache never holds more than `cacheSize`
  entries.

## 4. Time zones (`time-zone/`, ADR 0005)

### 4.1 `toTimeZone(value)` (`to-time-zone.ts`)

Returns the trimmed `value` when it is a time zone, and `undefined` otherwise:

1. `undefined`, `null`, and a string that is empty after trimming are not time zones.
2. A string whose first character is `+`, `-`, or U+2212 is not a time zone: ECMA-402 accepts a UTC
   offset ([CreateDateTimeFormat](https://tc39.es/ecma402/#sec-createdatetimeformat), step 18), and
   Node 24 and Deno accept U+2212 as its sign, but an offset holds only until the next transition.
3. Otherwise the value is a time zone when `new Intl.DateTimeFormat(undefined, { timeZone })` does
   not throw; the lookup matches names ASCII-case-insensitively
   ([GetAvailableNamedTimeZoneIdentifier](https://tc39.es/ecma402/#sec-getavailablenamedtimezoneidentifier)).
   The value is returned as written, not canonicalized: engines canonicalize differently (Node 24
   resolves `Europe/Kyiv` to `Europe/Kiev`, Bun keeps it).

Nothing is remembered between calls, so input cannot grow memory: names match
ASCII-case-insensitively, so even the accepted spellings are unbounded. A call constructs one
`Intl.DateTimeFormat`, once per request on a server.

### 4.2 `detectTimeZone()` (`to-time-zone.ts`)

Returns `toTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone)`: the device's zone, for
seeding the cookie (4.3), never for formatting a render.

### 4.3 Cookies (`cookie.ts`)

- A cookie name MUST be an HTTP `token`
  ([RFC 9110, 5.6.2](https://www.rfc-editor.org/rfc/rfc9110#section-5.6.2);
  [RFC 6265bis-22, 4.1.1](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-4.1.1)).
- `timeZoneFromCookie(header, name)` reads a `Cookie` request header or `document.cookie`: the pairs
  are separated by `;` with optional whitespace
  ([RFC 6265, 5.4](https://www.rfc-editor.org/rfc/rfc6265#section-5.4)); the first pair whose name
  equals `name` exactly is used; a value in double quotes is unquoted, a percent-encoded value is
  decoded (a value that does not decode is used as is), and the result goes through `toTimeZone`.
  `undefined` or `null` for `header` reads as no cookie.
- `timeZoneCookie(zone, options)` returns the `Set-Cookie` value
  `<name>=<zone>; Path=<path>; Max-Age=<maxAge>`, followed by `; Domain=<domain>`,
  `; SameSite=<sameSite>`, and `; Secure` when given. `zone` MUST be a time zone (4.1); an IANA name
  is made of cookie-octets, so it is written unencoded. `path` defaults to `/` and `maxAge` to
  `TIME_ZONE_COOKIE_MAX_AGE`, Paraglide's locale cookie attributes. `maxAge` MUST be a positive
  integer (`max-age-av` is `non-zero-digit *DIGIT`); `path` and `domain` MUST be `av-octet`s, so no
  control character, no `;`, and nothing outside US-ASCII; `sameSite` is `'Strict'`, `'Lax'`, or
  `'None'`. A cookie a user agent would drop is refused: `sameSite: 'None'`, a `__Secure-` name, or
  a `__Host-` name without `secure`, and a `__Host-` name with a `domain` or a `path` other than `/`
  ([RFC 6265bis-22, 5.7](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-5.7),
  steps 19 to 21). The cookie is never `HttpOnly`: the browser reads it (4.4).

### 4.4 `createTimeZone(options)` (`create-time-zone.ts`)

```ts
interface RequestScope<TStore> {
  getStore(): TStore | undefined;
  run<TResult>(store: TStore, callback: () => TResult): TResult;
}
interface TimeZoneOptions {
  readonly cookieName: string;
  readonly fallback?: string;
  readonly scope?: RequestScope<string>;
}
interface TimeZoneResolver {
  get(): string;
  fromRequest(request: Request): string;
  run<TResult>(request: Request, callback: () => TResult): TResult;
  useScope(scope: RequestScope<string>): void;
}
```

- `cookieName` MUST be a cookie name (4.3); `fallback`, when given, MUST be a time zone (4.1) and
  defaults to `DEFAULT_TIME_ZONE`; `scope`, when given, MUST have `getStore` and `run` functions (an
  `AsyncLocalStorage<string>` does).
- The resolver is a frozen object whose methods are closures; `get` MAY be passed on its own, as
  `createIntl({ timeZone: resolver.get })` does.
- `fromRequest(request)` returns `timeZoneFromCookie(request.headers.get('cookie'), cookieName)`, or
  the fallback.
- `useScope(scope)` checks the scope as the option is checked and makes it the resolver's scope,
  replacing any. A server entry calls it once with an `AsyncLocalStorage`, so the module that
  creates the resolver, shared with the browser, never imports `node:async_hooks`, as Paraglide's
  `overwriteServerAsyncLocalStorage()` lets its runtime do.
- `run(request, callback)` calls `scope.run(fromRequest(request), callback)` and returns its result.
  Without a scope it throws (section 5).
- `get()` returns, in order: `scope.getStore()` when a scope is given and that is not `undefined`;
  when `globalThis.document` existed as `createTimeZone()` ran, the zone of its `cookie` at that
  moment, or the fallback without one, returned unchanged by every later call (the pin); the
  fallback otherwise. A document with an opaque origin, such as a sandboxed iframe, throws a
  `SecurityError` when its cookie is read
  ([HTML, `document.cookie`](https://html.spec.whatwg.org/multipage/dom.html#dom-document-cookie))
  and reads as one without the cookie. Reading the cookie at creation, before any script can write
  it, keeps the zone the server rendered with.

## 5. Errors

Every message is constant apart from the names of options and of configured locales, and names the
function. No message contains a cookie, a header, a request URL, or a value read from a request.

| Thrown by                     | Class                    | When                                                                                                                                                       |
| ----------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createIntl()`                | `TypeError`              | the options are not an object; `locale` or `timeZone` is not a function; `formattingLocales` is not an object or holds a value that is not a string        |
| `createIntl()`                | `RangeError`             | a `formattingLocales` value is not a BCP 47 tag; `cacheSize` is not an integer of at least 1                                                               |
| `timeZoneCookie()`            | `TypeError`              | `zone` is not a time zone; the name is not a token; `path` or `domain` is not `av-octet`s; `sameSite` is another value; a user agent would drop the cookie |
| `timeZoneCookie()`            | `RangeError`             | `maxAge` is not a positive integer                                                                                                                         |
| `createTimeZone()`            | `TypeError`              | the options are not an object; the cookie name is not a token; `fallback` is not a time zone; `scope` lacks `getStore` or `run`                            |
| `TimeZoneResolver.useScope()` | `TypeError`              | `scope` lacks `getStore` or `run`                                                                                                                          |
| `TimeZoneResolver.run()`      | `TypeError`              | the resolver has no scope: none was given to `createTimeZone()` or `useScope()`                                                                            |
| `compile()`                   | `TypeError`              | `isolate` is not a boolean or an array of strings, or names a locale the project does not declare; `formatters` is another value                           |
| `compile()`                   | `MessageFormattingError` | a message formats and `formatters` is `'refuse'` (6.3)                                                                                                     |

## 6. Paraglide binding (`@netvark/paraglide-intl`, `packages/paraglide-intl/src/`)

### 6.1 `compile(options)` (`compile.ts`, `compile-options.ts`, ADR 0007)

```ts
type CompileOptions = CompilerOptions & {
  readonly previousCompilation?: CompilationResult;
  readonly isolate?: boolean | ReadonlyArray<string>;
  readonly formatters?: 'refuse' | 'allow';
};
interface CompileResult {
  readonly outputHashes: Record<string, string> | undefined;
  readonly warnings: ReadonlyArray<Error>;
}
```

`CompilerOptions` and `CompilationResult` are Paraglide's. `compile()` MUST:

1. Check `isolate` (absent, a boolean, or an array of strings) and `formatters` (absent, `'refuse'`,
   or `'allow'`), and throw a `TypeError` before reading anything when either is another value.
2. Merge Paraglide's `defaultCompilerOptions` under the given options, without `isolate`,
   `formatters`, and `previousCompilation`, as Paraglide's `compile()` does.
3. Load the project with `loadProjectFromDirectory({ path: project, fs })`, where `fs` is the `fs`
   option or `node:fs`.
4. Throw a `TypeError` when `isolate` lists a locale the project's settings do not declare.
5. Read every bundle with its messages and variants (`selectBundleNested(project.db)`).
6. When `formatters` is `'refuse'` (the default), throw a `MessageFormattingError` carrying every
   finding (6.3) when there is any. Nothing has been written at that point.
7. Rewrite the patterns (6.2) and write each changed bundle back with `upsertBundleNested()`.
8. Compile with `compileProject({ project, projectPath: project, compilerOptions })` and write the
   output with `writeOutput()` into the resolved `outdir`, cleaning it when `cleanOutdir` is set and
   passing `previousCompilation.outputHashes` so unchanged files are not rewritten.
9. Return the output hashes and `await project.errors.get()` as `warnings` (a plugin that failed to
   import, a file that failed to parse), and close the project whether or not a step threw.

The catalogs on disk MUST be unchanged: the project is loaded without a `syncInterval`, so the SDK
writes nothing back after the load (measured on inlang SDK 4.0.0, ADR 0007).

### 6.2 Isolating patterns (`isolate-patterns.ts`, ADR 0006)

- The isolated locales are every locale of the project's settings when `isolate` is `true` or
  absent, none when it is `false`, and the listed ones otherwise.
- For each message of an isolated locale, each variant's pattern with two or more parts is
  rewritten: each part of type `expression` is replaced by three parts, a `text` part
  `FIRST_STRONG_ISOLATE`, the expression part unchanged, and a `text` part
  `POP_DIRECTIONAL_ISOLATE`. Every other part (`text`, `markup-start`, `markup-end`,
  `markup-standalone`) keeps its place. A pattern of one part is left as is, as Fluent does (ADR
  0006).
- Declarations, selectors, and matches are not changed. A bundle is written back only when one of
  its patterns changed.

### 6.3 Formatting annotations (`formatting-annotations.ts`, ADR 0008)

- The formatting annotations are `number`, `datetime`, `date`, `time`, `relativetime`, and
  `icu:pound`, the function references Paraglide compiles to a `registry` call that formats.
  `plural` selects and is not one.
- A finding is an expression part of a variant's pattern, or a local declaration, whose annotation
  is a formatting annotation. Local declarations are read wherever the SDK holds them (on the bundle
  in SDK 4, on each message before it).
- `FormattingFinding` is `{ bundleId, locale, variable, annotation }`: `locale` is `undefined` for a
  declaration on the bundle, `variable` is the name the expression refers to or declares,
  `undefined` for a literal.
- `MessageFormattingError` extends `Error`, has the name `MessageFormattingError`, and carries the
  findings sorted by bundle id, locale, and variable, with each listed once. Its message names the
  count and lists one finding per line as
  `<bundleId> (<locale or "every locale">): <variable>: <annotation>`; bundle ids are the
  application's own message keys.

### 6.4 Peers and floors

`@inlang/paraglide-js` and `@inlang/sdk` are peer dependencies (root ADR 0009, ADR 0002). Each range
starts at the oldest release on which `compileProject()`, `writeOutput()`, `selectBundleNested()`,
and `upsertBundleNested()` behave as 6.1 to 6.3 require, past any published advisory (root ADR
0007), and a CI job runs the binding's tests there. Section 8 lists the ranges.

## 7. Test plan

### 7.1 Unit tests

- `isolate.test.ts`: the characters by code point, the empty string, nesting.
- `create-intl.test.ts`: option checks; each formatter against the same call on a fresh `Intl`
  object with the formatting tag; the zone default and an explicit zone winning; the getters read
  once per call and on every call; the formatting tag reaching every constructor.
- `intl-cache.test.ts`: key canonicalization (option order, `undefined` values), the bypass for
  other values, the least recently used eviction and the bound.
- `to-time-zone.test.ts`, `cookie.test.ts`, `create-time-zone.test.ts`: every rule of section 4,
  including a scope given by an `AsyncLocalStorage` in the type tests and the tests.
- `isolate-patterns.test.ts`, `formatting-annotations.test.ts`: the rules of 6.2 and 6.3 over
  patterns and bundles written as data.
- `compile.test.ts`: fixture projects in `mkdtemp` directories compiled with Paraglide, the emitted
  functions called in each locale, the catalogs compared byte for byte before and after, the refusal
  raised before any output exists.

### 7.2 End-to-end suite (`e2e/intl/`)

A private package that consumes the built packages through `workspace:*` and never imports `src/`:

- `package-surface.e2e.test.ts`: the export lists of 1.
- `time-zone.e2e.test.ts`: concurrent requests resolved from their cookies in a request scope, the
  cookie `timeZoneCookie` writes read back by the next request, and a browser resolver keeping the
  zone its document had when it was created.
- `compile.e2e.test.ts`: a fixture project compiled with the built binding, its messages called in
  English and Arabic.
- `hydration.e2e.test.ts`: a server render inside a request scope and a jsdom document render from
  the same cookie produce the same strings; without the cookie both use the fallback.
- `visual-order.e2e.test.ts`: bidi-js (UAX #9 C1) resolves the compiled messages' visual order with
  each value in place, where the plain interpolation reorders it.

### 7.3 Runtime smoke test (`e2e/intl/smoke/`)

The core's formatters and time zone resolver, and the compiled fixture messages, on Bun, Deno, and
workerd. The resolver's request scope is an `AsyncLocalStorage` from `node:async_hooks` on each;
workerd runs with the `nodejs_als` compatibility flag, which compatibility dates before 2026-08-04
need.

## 8. Packaging and support

ESM only, TypeScript declarations emitted with isolated declarations, `sideEffects: false`.
`@netvark/intl-core` runs on Node 22.12+, Bun, Deno, Cloudflare Workers, and browsers.
`@netvark/paraglide-intl` runs at build time on Node 22.12+, Bun, and Deno; it reads and writes
files through the `fs` it is given (ADR 0002). Peer ranges are recorded here when the binding lands
(#166).

## 9. Constants

| Name                       | Value      | Why                                                                    |
| -------------------------- | ---------- | ---------------------------------------------------------------------- |
| `FIRST_STRONG_ISOLATE`     | `'\u2068'` | UAX #9, 2.4                                                            |
| `POP_DIRECTIONAL_ISOLATE`  | `'\u2069'` | UAX #9, 2.4                                                            |
| `DEFAULT_CACHE_SIZE`       | `256`      | ADR 0003: a few locales, a few styles, the zones of concurrent readers |
| `DEFAULT_TIME_ZONE`        | `'UTC'`    | ADR 0005: the same answer on every host                                |
| `TIME_ZONE_COOKIE_MAX_AGE` | `34560000` | 400 days, Paraglide's locale cookie and RFC 6265bis-22, 5.5            |
