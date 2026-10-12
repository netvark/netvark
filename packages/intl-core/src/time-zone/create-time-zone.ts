/**
 * The reader's time zone resolver (SPEC 4.4, ADR 0005). During SSR the
 * server sees the request, not the device, so the zone comes from a cookie
 * both sides read before they render: the request's cookie inside a
 * request scope, the document's cookie in a browser, read when the
 * resolver is created and pinned for the document's life so a later write
 * cannot contradict the HTML already rendered, and the fallback otherwise. The scope is injected (an
 * `AsyncLocalStorage` the server entry creates), so this module stays on
 * web standards and is shared with the browser.
 * @ref https://nodejs.org/api/async_context.html#class-asynclocalstorage
 * @packageDocumentation
 */
import { isRecord } from '../internal/is-record';
import { isCookieName, timeZoneFromCookie } from './cookie';
import { toTimeZone } from './to-time-zone';

/** The zone a render without a cookie formats in: the same answer on every host. */
export const DEFAULT_TIME_ZONE = 'UTC';

/** The part of `AsyncLocalStorage` the resolver uses. */
export interface RequestScope<TStore> {
  getStore(): TStore | undefined;
  run<TResult>(store: TStore, callback: () => TResult): TResult;
}

export interface TimeZoneOptions {
  /** The cookie that holds the reader's zone, an HTTP token. */
  readonly cookieName: string;
  /** The zone without a cookie; `DEFAULT_TIME_ZONE` by default. */
  readonly fallback?: string | undefined;
  /** The request scope; a server entry may pass it later with `useScope`. */
  readonly scope?: RequestScope<string> | undefined;
}

/** The reader's time zone; each member is a closure that may be passed on its own. */
export interface TimeZoneResolver {
  /** The zone of the active request, else the document's pinned zone, else the fallback. */
  readonly get: () => string;
  /** The zone in the request's cookie, or the fallback. */
  readonly fromRequest: (request: Request) => string;
  /** Runs `callback` with the request's zone as the active one. */
  readonly run: <TResult>(request: Request, callback: () => TResult) => TResult;
  /** Makes `scope` the request scope, replacing any. */
  readonly useScope: (scope: RequestScope<string>) => void;
}

const CALLER = 'createTimeZone';

interface TimeZoneConfig {
  readonly cookieName: string;
  readonly fallback: string;
}

/** Checks the options; throws naming the first one the resolver cannot use (SPEC 5). */
function timeZoneConfig(options: TimeZoneOptions): TimeZoneConfig {
  const value: unknown = options;
  if (!isRecord(value)) {
    throw new TypeError(`${CALLER}: options is not an object`);
  }
  if (!isCookieName(value['cookieName'])) {
    throw new TypeError(`${CALLER}: cookieName is not a cookie name`);
  }
  const fallback =
    value['fallback'] === undefined
      ? DEFAULT_TIME_ZONE
      : toTimeZone(value['fallback']);
  if (fallback === undefined) {
    throw new TypeError(`${CALLER}: fallback is not a time zone`);
  }
  return { cookieName: options.cookieName, fallback };
}

function checkedScope(
  caller: string,
  scope: RequestScope<string>,
): RequestScope<string> {
  const value: unknown = scope;
  if (
    !isRecord(value) ||
    typeof value['getStore'] !== 'function' ||
    typeof value['run'] !== 'function'
  ) {
    throw new TypeError(`${caller}: scope lacks getStore or run`);
  }
  return scope;
}

/**
 * `document.cookie` in a browser; `undefined` where there is no document,
 * and in a document with an opaque origin, such as a sandboxed iframe,
 * whose `cookie` getter throws a `SecurityError`.
 * @ref https://html.spec.whatwg.org/multipage/dom.html#dom-document-cookie
 */
function documentCookie(): string | undefined {
  const document: unknown = Reflect.get(globalThis, 'document');
  if (!isRecord(document)) {
    return undefined;
  }
  try {
    const cookie = document['cookie'];
    return typeof cookie === 'string' ? cookie : undefined;
  } catch {
    return undefined;
  }
}

/** A resolver of the reader's time zone from the cookie `cookieName`. */
export function createTimeZone(options: TimeZoneOptions): TimeZoneResolver {
  const { cookieName, fallback } = timeZoneConfig(options);
  let scope =
    options.scope === undefined
      ? undefined
      : checkedScope(CALLER, options.scope);
  const fromCookie = (header: string | null | undefined): string =>
    timeZoneFromCookie(header, cookieName) ?? fallback;
  // In a browser, the document's zone as the resolver is created, before
  // any script can write the cookie: the zone the server rendered with,
  // kept for the document's life.
  const cookie = documentCookie();
  const pinned = cookie === undefined ? undefined : fromCookie(cookie);

  const resolver: TimeZoneResolver = {
    get: () => scope?.getStore() ?? pinned ?? fallback,
    fromRequest: (request) => fromCookie(request.headers.get('cookie')),
    run: (request, callback) => {
      if (scope === undefined) {
        throw new TypeError(
          'TimeZoneResolver.run: the resolver has no scope; call useScope first',
        );
      }
      return scope.run(fromCookie(request.headers.get('cookie')), callback);
    },
    useScope: (next) => {
      scope = checkedScope('TimeZoneResolver.useScope', next);
    },
  };
  return Object.freeze(resolver);
}
