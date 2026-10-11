/**
 * The paths of a resource's operations (SPEC 13.1), read from its JSON:API
 * definition's links: the resource at `links.self(id)`, the collection at
 * that path without its last segment, and each relationship's `self` and
 * `related` links. A link is built for a marker id of unreserved
 * characters, which `encodeURIComponent` keeps, and the marker becomes
 * the template `{id}`. An absolute link splits into its origin, the
 * document's server, and its path. A host mounts its routes at the same
 * paths (SPEC 19.2).
 * @ref https://jsonapi.org/recommendations/#urls
 * @ref https://spec.openapis.org/oas/v3.1.2.html#path-templating
 * @packageDocumentation
 */
import type { AnyResource } from '@netvark/jsonapi-core';

/** Where a resource's operations live. */
export interface ResourcePaths {
  /** The server the paths are relative to: an absolute link's origin, else `undefined`. */
  readonly origin: string | undefined;
  readonly collection: string;
  readonly resource: string;
  /** By relationship: its relationship link's and related link's paths, when the definition builds them. */
  readonly relationships: ReadonlyMap<
    string,
    { readonly self?: string; readonly related?: string }
  >;
}

const MARKER = 'netvark-openapi-id';
const TEMPLATE = '{id}';
/** A base for parsing a root-relative link; never part of a result. */
const PLACEHOLDER = 'http://placeholder.invalid';

interface Located {
  readonly origin: string | undefined;
  readonly path: string;
}

/** A link's origin and path, which must hold the marker once and no query or fragment. */
function locate(caller: string, what: string, link: string): Located {
  if (!link.startsWith('/') && !URL.canParse(link)) {
    throw new TypeError(
      `${caller}: ${what} must be an absolute URL or a path starting with "/"`,
    );
  }
  const url = new URL(link, PLACEHOLDER);
  if (
    url.search !== '' ||
    url.hash !== '' ||
    url.pathname.split(MARKER).length !== 2
  ) {
    throw new TypeError(
      `${caller}: ${what} must be a path that holds the id once, without a query or fragment`,
    );
  }
  return {
    origin: link.startsWith('/') ? undefined : url.origin,
    path: url.pathname.replace(MARKER, TEMPLATE),
  };
}

function sameOrigin(
  caller: string,
  what: string,
  first: Located,
  other: Located,
): string {
  if (first.origin !== other.origin) {
    throw new TypeError(
      `${caller}: ${what} has another origin than links.self`,
    );
  }
  return other.path;
}

/**
 * The paths of `definition`'s operations, each message of a link it
 * cannot read starting with `caller`.
 */
export function readPaths(
  caller: string,
  definition: AnyResource,
): ResourcePaths {
  const { type, links } = definition;
  if (links.self === undefined) {
    throw new TypeError(
      `${caller}: ${type} has no links.self, so its paths are unknown; give the definer links.base`,
    );
  }
  const self = locate(caller, `${type} links.self`, links.self(MARKER));
  const suffix = `/${TEMPLATE}`;
  if (!self.path.endsWith(suffix) || self.path === suffix) {
    throw new TypeError(
      `${caller}: ${type} links.self must end with the id after the collection's path`,
    );
  }
  const relationships = new Map(
    Object.keys(definition.relationships).map((name) => {
      const built = links.relationship?.(MARKER, name) ?? {};
      const what = `${type} links.relationship(id, "${name}")`;
      const pathOf = (link: string): string =>
        sameOrigin(caller, what, self, locate(caller, what, link));
      return [
        name,
        {
          ...(built.self === undefined ? {} : { self: pathOf(built.self) }),
          ...(built.related === undefined
            ? {}
            : { related: pathOf(built.related) }),
        },
      ] as const;
    }),
  );
  return {
    origin: self.origin,
    collection: self.path.slice(0, -suffix.length),
    resource: self.path,
    relationships,
  };
}

/**
 * The paths of `definition`'s operations, as the OpenAPI document lists
 * them and a host mounts its routes; throws `TypeError` when its links
 * cannot give them.
 */
export function resourcePaths(definition: AnyResource): ResourcePaths {
  return readPaths('resourcePaths', definition);
}
