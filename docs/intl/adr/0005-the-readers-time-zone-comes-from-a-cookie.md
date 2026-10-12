# ADR 0005: The reader's time zone comes from a cookie, UTC without one

- Status: accepted
- Date: 2026-10-12

## Context

`Intl.DateTimeFormat` without a `timeZone` option formats in `SystemTimeZoneIdentifier()`, the
runtime's own zone
([ECMA-402, CreateDateTimeFormat](https://tc39.es/ecma402/#sec-createdatetimeformat)): the server's
during SSR and the device's after hydration. An instant near midnight renders as two different days,
and hydration replaces the server's text. The server cannot see the device's zone; it sees the
request. Paraglide solves the same problem for the language with a cookie it reads at the request
boundary and writes as `<name>=<locale>; path=/; max-age=34560000`
([`set-locale.js`, 2.27.0](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/runtime/set-locale.js)),
400 days being the longest lifetime a user agent honors
([RFC 6265bis-22, 5.5](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-5.5)).

ECMA-402 accepts a UTC offset (`+03:00`) as a time zone since 2024 (the same clause); Node 24, Bun
1.4, and Deno 2.1 format with one, Node 24 and Deno also with a U+2212 MINUS SIGN for the sign, and
Node 18.14 throws a `RangeError` (2026-10-12). An offset is true only until the zone's next
transition, so a date months away renders an hour off across a daylight saving change. Engines also
canonicalize names differently: Node 24 resolves `Europe/Kyiv` to `Europe/Kiev`, and
`Intl.supportedValuesOf('timeZone')` lists `UTC` on Bun and not on Node or Deno, so the list is not
a validity test.

## Decision

- A time zone is an IANA name the runtime's `Intl.DateTimeFormat` accepts, kept as written
  (trimmed), never canonicalized; a value that starts with `+`, `-`, or U+2212 is refused as an
  offset (`toTimeZone()`).
- `createTimeZone({ cookieName, fallback, scope })` answers, in order: the zone of the request whose
  scope is active (read from its `cookie` header when `run()` entered the scope); in a browser, the
  zone of `document.cookie`, read when the resolver is created, before any script can write the
  cookie, and kept for the document's life; otherwise the fallback, `UTC` by default. The device's
  own zone is never an answer during a render; it only seeds the cookie for the next load
  (`detectTimeZone()`, `timeZoneCookie()`).
- `timeZoneCookie()` writes Paraglide's attributes by default (`Path=/`, `Max-Age=34560000`), so the
  language and zone cookies live and expire together.

## Consequences

Server and browser format the first render from one cookie, and both fall back to UTC when there is
none. A zone the reader changes takes effect on the next load, as Paraglide's cookie strategy does,
because a document already rendered in one zone must not hydrate in another. A zone the browser's
engine does not know (a name newer than its tzdata) falls back to the fallback there; the docs name
the case.
