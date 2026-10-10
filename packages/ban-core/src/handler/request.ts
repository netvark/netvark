import type { ErrorRequest } from '../core/types';

/**
 * `ErrorRequest` from a Fetch `Request` (SPEC 6.1), for a handler called
 * straight from `fetch`: `handle(thrown, fromRequest(request))`. `path` is
 * the URL's path component; the query string is neither part of `instance`
 * (SPEC 7.1.1) nor reported.
 * @ref https://fetch.spec.whatwg.org/#request-class
 * @ref https://url.spec.whatwg.org/#dom-url-pathname
 */
export function fromRequest(request: Request): ErrorRequest {
  return {
    method: request.method,
    path: new URL(request.url).pathname,
    header: (name: string): string | undefined =>
      request.headers.get(name) ?? undefined,
  };
}
