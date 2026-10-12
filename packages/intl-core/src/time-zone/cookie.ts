/**
 * The reader's time zone cookie (SPEC 4.3, ADR 0005): read from a `Cookie`
 * request header or `document.cookie`, and written as a `Set-Cookie` value
 * with Paraglide's locale cookie attributes by default, so the language
 * and the zone cookies live and expire together. The cookie must stay
 * readable by `document.cookie`, so it is never `HttpOnly`.
 * @ref https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-4.1.1 (the Set-Cookie grammar)
 * @ref https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-5.7 (steps 19 to 21: cookies a user agent drops)
 * @ref https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/runtime/set-locale.js (path=/; max-age=34560000)
 * @packageDocumentation
 */
import { toTimeZone } from './to-time-zone';

/** 400 days in seconds: Paraglide's locale cookie, and the longest lifetime a user agent honors (RFC 6265bis-22, 5.5). */
export const TIME_ZONE_COOKIE_MAX_AGE = 34_560_000;

export interface TimeZoneCookieOptions {
  /** The cookie name, an HTTP token. */
  readonly name: string;
  /** `/` by default. */
  readonly path?: string | undefined;
  /** Seconds; `TIME_ZONE_COOKIE_MAX_AGE` by default. */
  readonly maxAge?: number | undefined;
  readonly domain?: string | undefined;
  /** `None` requires `secure`, or the user agent drops the cookie. */
  readonly sameSite?: 'Strict' | 'Lax' | 'None' | undefined;
  readonly secure?: boolean | undefined;
}

const CALLER = 'timeZoneCookie';

/**
 * RFC 9110 `token`, the cookie-name of RFC 6265bis-22 4.1.1.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-5.6.2
 */
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
/** `av-octet` (%x20-3A / %x3C-7E): printable US-ASCII and the space, without `;`. */
const ATTRIBUTE_VALUE = /^[ -:<-~]*$/u;
/** Cookie prefixes a user agent honors only with `Secure`, and `__Host-` only host-only at `/` (RFC 6265bis-22, 5.7 steps 20 and 21). */
const SECURE_PREFIX = /^__secure-/iu;
const HOST_PREFIX = /^__host-/iu;
const SAME_SITE: ReadonlySet<unknown> = new Set(['Strict', 'Lax', 'None']);
const QUOTED = /^"(.*)"$/u;

/** Whether `name` can name a cookie. */
export function isCookieName(name: unknown): name is string {
  return typeof name === 'string' && TOKEN.test(name);
}

/**
 * The time zone in the cookie `name` of a `Cookie` header or
 * `document.cookie`; `undefined` without that cookie or when its value is
 * not a time zone. The first pair named exactly `name` is read; a quoted
 * value is unquoted, and a percent-encoded one decoded.
 * @ref https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-5.4
 */
export function timeZoneFromCookie(
  header: string | null | undefined,
  name: string,
): string | undefined {
  if (header === null || header === undefined) {
    return undefined;
  }
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator !== -1 && pair.slice(0, separator).trim() === name) {
      return toTimeZone(decoded(pair.slice(separator + 1).trim()));
    }
  }
  return undefined;
}

function decoded(value: string): string {
  const text = QUOTED.exec(value)?.[1] ?? value;
  try {
    return decodeURIComponent(text);
  } catch {
    // A malformed escape: read the value as it is.
    return text;
  }
}

/**
 * The `Set-Cookie` value that stores `zone` in the cookie `options.name`:
 * `<name>=<zone>; Path=/; Max-Age=34560000` by default, then `Domain`,
 * `SameSite`, and `Secure` when given. An IANA name is made of
 * cookie-octets, so it is written as it is. Throws `TypeError` for a zone
 * that is not one, a name that is not a token, an attribute value outside
 * `av-octet`, an unknown `sameSite`, and a cookie a user agent would drop,
 * and `RangeError` for a `maxAge` that is not a positive integer.
 */
export function timeZoneCookie(
  zone: string,
  options: TimeZoneCookieOptions,
): string {
  const value = toTimeZone(zone);
  if (value === undefined) {
    throw new TypeError(`${CALLER}: zone is not a time zone`);
  }
  const { name, path = '/', maxAge = TIME_ZONE_COOKIE_MAX_AGE } = options;
  const { domain, sameSite, secure = false } = options;
  checkAttributes(options, path, maxAge);
  return [
    `${name}=${value}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    ...(domain === undefined ? [] : [`Domain=${domain}`]),
    ...(sameSite === undefined ? [] : [`SameSite=${sameSite}`]),
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function checkAttributes(
  options: TimeZoneCookieOptions,
  path: string,
  maxAge: number,
): void {
  const { name, domain, sameSite } = options;
  if (!isCookieName(name)) {
    throw new TypeError(`${CALLER}: name is not a cookie name`);
  }
  for (const [attribute, text] of [
    ['path', path],
    ['domain', domain ?? ''],
  ] as const) {
    if (!ATTRIBUTE_VALUE.test(text)) {
      throw new TypeError(
        `${CALLER}: ${attribute} holds a control character, a semicolon, or a character outside US-ASCII`,
      );
    }
  }
  // RFC 6265bis-22 4.1.1: max-age-av = "Max-Age=" non-zero-digit *DIGIT.
  if (!Number.isSafeInteger(maxAge) || maxAge < 1) {
    throw new RangeError(`${CALLER}: maxAge is not a positive integer`);
  }
  if (sameSite !== undefined && !SAME_SITE.has(sameSite)) {
    throw new TypeError(`${CALLER}: sameSite is not Strict, Lax, or None`);
  }
  checkKept(options, path);
}

/** Refuses a cookie a user agent would drop (RFC 6265bis-22, 5.7 steps 19 to 21). */
function checkKept(options: TimeZoneCookieOptions, path: string): void {
  const { name, domain, sameSite, secure } = options;
  const host = HOST_PREFIX.test(name);
  if (
    secure !== true &&
    (sameSite === 'None' || host || SECURE_PREFIX.test(name))
  ) {
    throw new TypeError(
      `${CALLER}: the cookie needs secure, or user agents drop it`,
    );
  }
  if (host && (path !== '/' || domain !== undefined)) {
    throw new TypeError(
      `${CALLER}: a __Host- cookie needs the path / and no domain, or user agents drop it`,
    );
  }
}
