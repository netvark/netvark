/**
 * Time zone names (SPEC 4.1, 4.2, ADR 0005). A time zone is an IANA name
 * the runtime's `Intl.DateTimeFormat` accepts, kept as written: engines
 * canonicalize differently (Node 24 and Deno 2.1 resolve `Europe/Kyiv` to
 * `Europe/Kiev` and `US/Pacific` to `America/Los_Angeles`; Bun 1.4 keeps
 * both). A UTC offset is refused although ECMA-402 accepts one: it holds
 * only until the zone's next transition.
 * @ref https://tc39.es/ecma402/#sec-createdatetimeformat (step 18: an offset or an available named zone)
 * @ref https://tc39.es/ecma402/#sec-getavailablenamedtimezoneidentifier (ASCII-case-insensitive lookup)
 * @packageDocumentation
 */

/** The signs of a UTC offset; Node 24 and Deno 2.1 also accept U+2212 MINUS SIGN. */
const OFFSET_SIGNS: ReadonlySet<string> = new Set(['+', '-', '\u2212']);

/**
 * `value` trimmed when it names a time zone the runtime knows, and
 * `undefined` for anything else: a value that is not a string, an empty
 * one, a UTC offset, or a name the runtime does not know.
 */
export function toTimeZone(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const zone = value.trim();
  if (zone === '' || OFFSET_SIGNS.has(zone.charAt(0))) {
    return undefined;
  }
  return formatterIn(zone) === undefined ? undefined : zone;
}

/** A formatter in `zone`; `undefined` when the runtime does not know the zone and throws a RangeError. */
function formatterIn(zone: string): Intl.DateTimeFormat | undefined {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: zone });
  } catch {
    return undefined;
  }
}

/**
 * The device's own zone, for seeding the reader's time zone cookie;
 * `undefined` when the runtime reports an offset or nothing usable. Never
 * for formatting a render: the server cannot see it.
 */
export function detectTimeZone(): string | undefined {
  return toTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone);
}
