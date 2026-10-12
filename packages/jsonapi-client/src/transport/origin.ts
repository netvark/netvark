/**
 * The origin a transport reaches the server at, and the links the client
 * follows (SPEC 15.2, 15.8, ADR 0017). The application names the server
 * once; a definition's own origin is ignored, so one set of definitions
 * serves every environment. A link from a document is the server's data:
 * the client follows it only to the transport's origin, so a response
 * cannot send the application's headers elsewhere, the reason fetch drops
 * `Authorization` on a cross-origin redirect.
 * @ref https://url.spec.whatwg.org/#concept-url-origin
 * @ref https://fetch.spec.whatwg.org/#http-redirect-fetch (step 13: "the moment another origin is seen after the initial request, the Authorization header is removed")
 * @packageDocumentation
 */

const NOT_AN_ORIGIN =
  'createTransport: origin must be an absolute http: or https: URL with no user information, path, query, or fragment';

const SCHEMES = new Set(['http:', 'https:']);

/**
 * `origin` as `URL#origin`. Throws `TypeError` unless it is an absolute
 * `http:` or `https:` URL that is its origin and `/` alone: user
 * information, a path, a query, or a fragment would each be dropped from
 * every request, so each is refused instead.
 */
export function assertOrigin(origin: string): string {
  const url = URL.canParse(origin) ? new URL(origin) : undefined;
  if (
    url === undefined ||
    !SCHEMES.has(url.protocol) ||
    url.href !== `${url.origin}/`
  ) {
    throw new TypeError(NOT_AN_ORIGIN);
  }
  return url.origin;
}

/**
 * The URL `link` names when it is absolute or root-relative and on
 * `origin`; `undefined` for any other link. A relative reference resolves
 * against a URL the client does not know, and one starting `//` or `/\`
 * names another host, which the origin comparison catches.
 * @ref https://www.rfc-editor.org/rfc/rfc3986#section-4.2 (absolute-path and network-path references)
 */
export function atOrigin(origin: string, link: string): URL | undefined {
  if (!link.startsWith('/') && !URL.canParse(link)) {
    return undefined;
  }
  const url = new URL(link, origin);
  return url.origin === origin ? url : undefined;
}
