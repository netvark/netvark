# ADR 0003: Formatters read the locale and the time zone on every call

- Status: accepted
- Date: 2026-10-12

## Context

On a server, Paraglide keeps the request's locale in an `AsyncLocalStorage` that its middleware
fills, and `getLocale()` reads it; in a browser, `getLocale()` reads the strategy (URL, cookie)
([Paraglide server middleware](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/server/middleware.js)).
A formatter that reads the locale once, at import or into a closure, keeps whichever request loaded
it first and serves that locale to every later request. The repository already settled the same
question for messages: libraries take message functions and keep no locale store of their own
([resource ADR 0009](../../resource/adr/0009-messages-are-functions-the-i18n-library-owns-the-locale.md)).
The reader's time zone has the same shape: per request on a server, per document in a browser.

Building an `Intl.DateTimeFormat` cost 43 to 54 µs and reusing one about 1 µs on Node 24.20, Node
18.14, Bun 1.4.2, and Deno 2.1.4 (2,000 iterations each, 2026-10-12), so a formatter cannot build a
fresh `Intl` object per call either: a table of a few hundred cells pays it hundreds of times.

## Decision

- `createIntl()` takes two getters, `locale` and `timeZone`, and calls each on every formatter call
  that needs it, once per call. It keeps no locale and no zone.
- Each call takes its `Intl` object from a cache owned by that `createIntl()` result, keyed by the
  constructor, the formatting tag (ADR 0004), and the options with the zone filled in. The cache
  keeps the 256 most recently used objects by default; an options value that is not a string, a
  number, or a boolean bypasses the cache rather than risk two option sets sharing a key.

## Consequences

`createIntl()` is called once, at module scope, and its formatters are safe to call from any request
or render. An application that formats in many zones at once (one per signed-in reader) evicts and
rebuilds, which costs the measured construction time per miss, never a wrong answer.
