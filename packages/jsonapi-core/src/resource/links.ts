/**
 * The links convention (SPEC 5.1, ADR 0015). A definition's `links.base`
 * derives `self` and the relationship links by the URL design the
 * specification recommends: `<base>/<type>/<id>`,
 * `<base>/<type>/<id>/relationships/<name>`, `<base>/<type>/<id>/<name>`,
 * each segment percent-encoded. The recommendations are not normative, so
 * nothing is derived unless `base` is set, and a builder the definition
 * gives wins over the derived one.
 * @ref https://jsonapi.org/recommendations/#urls
 * @ref https://jsonapi.org/format/1.1/#document-links-link (a link is a URI-reference)
 * @ref https://www.rfc-editor.org/rfc/rfc3986#section-3.1 (the scheme grammar)
 * @packageDocumentation
 */
/**
 * `links.self` and `links.related` of a relationship. An object type, not an
 * interface, so it is assignable to `Links` (an interface has no implicit
 * index signature) and the builder's result can feed a relationship
 * document's `links`.
 */
export type RelationshipLinks = {
  readonly self?: string;
  readonly related?: string;
};

export interface ResourceLinks {
  /** The resource's `links.self`. */
  readonly self?: ((id: string) => string) | undefined;
  /** `links.self` and `links.related` of each relationship object. */
  readonly relationship?:
    | ((id: string, name: string) => RelationshipLinks)
    | undefined;
}

/**
 * `links` as a definition declares them: the builders of `ResourceLinks`,
 * or a `base` both are derived from by the URL design the specification
 * recommends (`<base>/<type>/<id>`, `<base>/<type>/<id>/relationships/<name>`,
 * `<base>/<type>/<id>/<name>`); a builder given here wins over its derived
 * one.
 */
export interface ResourceLinksInit extends ResourceLinks {
  /**
   * `''` for root-relative links, a path such as `/api/v1`, or an absolute
   * URL such as `https://api.example.com/v1`; no trailing slash, query, or
   * fragment. Absent: nothing is derived.
   */
  readonly base?: string | undefined;
}

/** A scheme followed by `//`: an absolute URL with an authority. */
const ABSOLUTE_URL_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u;

interface DerivedLinks {
  readonly self: (id: string) => string;
  readonly relationship: (id: string, name: string) => RelationshipLinks;
}

/**
 * `base` MUST be empty, a path starting with `/`, or an absolute URL, with
 * no trailing slash (the derived links add their own) and no query or
 * fragment (a path appended after either would become part of it).
 */
export function assertLinkBase(what: string, base: string): void {
  if (base.endsWith('/')) {
    throw new TypeError(`${what} must not end with "/"`);
  }
  if (base.includes('?') || base.includes('#')) {
    throw new TypeError(`${what} must not contain a query or a fragment`);
  }
  if (
    base !== '' &&
    !base.startsWith('/') &&
    !ABSOLUTE_URL_PATTERN.test(base)
  ) {
    throw new TypeError(
      `${what} must be empty, start with "/", or be an absolute URL`,
    );
  }
}

function conventionalLinks(type: string, base: string): DerivedLinks {
  const prefix = `${base}/${encodeURIComponent(type)}`;
  const self = (id: string): string => `${prefix}/${encodeURIComponent(id)}`;
  return {
    self,
    relationship: (id, name) => ({
      self: `${self(id)}/relationships/${encodeURIComponent(name)}`,
      related: `${self(id)}/${encodeURIComponent(name)}`,
    }),
  };
}

/**
 * The resolved `links` of a definition: with `base`, each builder the
 * definition gives, falling back to the derived one; without it, only what
 * was given. Throws `TypeError` for a `base` the convention cannot use.
 */
export function resolveLinks(
  init: ResourceLinksInit,
  type: string,
): ResourceLinks {
  if (init.base === undefined) {
    return {
      ...(init.self === undefined ? {} : { self: init.self }),
      ...(init.relationship === undefined
        ? {}
        : { relationship: init.relationship }),
    };
  }
  assertLinkBase('links.base', init.base);
  const derived = conventionalLinks(type, init.base);
  return {
    self: init.self ?? derived.self,
    relationship: init.relationship ?? derived.relationship,
  };
}
