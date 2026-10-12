/**
 * Pagination links and metadata for the Cursor Pagination profile (SPEC 8.2,
 * 8.3). Links are derived from the request URL so every parameter the
 * client sent (filters, fields, include, sort, custom) survives, as the
 * top-level `self` link requires; only the `page` cursors change.
 * @ref https://jsonapi.org/format/1.1/#document-top-level (self link note)
 * @ref https://jsonapi.org/format/1.1/#fetching-pagination
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/ (Links, Collection Sizes)
 * @packageDocumentation
 */
import type { Links, Meta } from '../document/types';

export interface PageCursors {
  /**
   * Cursor for `next` (`page[after]`), `null` when there is no next page,
   * or `undefined` when the page could not be determined and the link
   * should repeat the last item's cursor. Omit `page[before]` requests'
   * uncertainty by passing the last item cursor directly.
   */
  readonly next: string | null;
  /** Cursor for `prev` (`page[before]`), or `null` when there is no previous page. */
  readonly prev: string | null;
  /** Cursor for `last` (`page[before]` past the end); omitted when unknown. */
  readonly last?: string | null | undefined;
  /** Whether to emit `first`; default true (it is always cheap). */
  readonly first?: boolean | undefined;
}

export interface PageLinksOptions {
  /** Emit path and query only, without the origin. Default false. */
  readonly relative?: boolean | undefined;
}

const AFTER = 'page[after]';
const BEFORE = 'page[before]';

function render(url: URL, relative: boolean): string {
  return relative ? `${url.pathname}${url.search}` : url.href;
}

function withCursor(
  url: URL,
  set: string,
  remove: string,
  cursor: string,
): URL {
  const next = new URL(url);
  next.searchParams.delete(remove);
  next.searchParams.set(set, cursor);
  return next;
}

/**
 * `self`, `first`, `prev`, `next`, and optionally `last` for the request
 * `url`. `prev` and `next` are always present: a cursor makes a link, `null`
 * says the page does not exist. `first` drops both cursors; `last` sets
 * `page[before]`.
 */
export function paginationLinks(
  url: URL | string,
  cursors: PageCursors,
  options: PageLinksOptions = {},
): Links {
  const relative = options.relative ?? false;
  const self = new URL(url);
  // A fragment is no part of what was requested, though a literal `#` can
  // reach the request URL; every link derives from `self`, so none carries it.
  // @ref https://www.rfc-editor.org/rfc/rfc3986#section-3.5
  self.hash = '';
  // Serialize the query once so square brackets a browser left bare come out
  // percent-encoded, as the specification's serialization rules say; the
  // request is to be treated as equivalent either way.
  // @ref https://jsonapi.org/format/1.1/#appendix-query-details-square-brackets
  self.search = self.searchParams.toString();
  const links: Record<string, string | null> = { self: render(self, relative) };
  if (cursors.first ?? true) {
    const first = new URL(self);
    first.searchParams.delete(AFTER);
    first.searchParams.delete(BEFORE);
    links['first'] = render(first, relative);
  }
  if (cursors.last !== undefined) {
    links['last'] =
      cursors.last === null
        ? null
        : render(withCursor(self, BEFORE, AFTER, cursors.last), relative);
  }
  links['prev'] =
    cursors.prev === null
      ? null
      : render(withCursor(self, BEFORE, AFTER, cursors.prev), relative);
  links['next'] =
    cursors.next === null
      ? null
      : render(withCursor(self, AFTER, BEFORE, cursors.next), relative);
  return links;
}

export interface PageMetaInit {
  /** Total number of items in the list being paginated. */
  readonly total?: number | undefined;
  /** The server's best estimate when the exact total is costly. */
  readonly estimatedTotal?: number | undefined;
  /** Set on a range request whose results exceeded the used page size. */
  readonly rangeTruncated?: boolean | undefined;
}

/**
 * The `page` member of the top-level `meta`, with only the members the
 * profile recognizes. `rangeTruncated` is emitted only when true, because
 * the profile defines it as a flag to add, not a field to report.
 */
export function pageMeta(init: PageMetaInit): Meta {
  const page: Record<string, unknown> = {};
  if (init.total !== undefined) {
    page['total'] = init.total;
  }
  if (init.estimatedTotal !== undefined) {
    page['estimatedTotal'] = { bestGuess: init.estimatedTotal };
  }
  if (init.rangeTruncated === true) {
    page['rangeTruncated'] = true;
  }
  return { page };
}

/** Item metadata carrying the item's cursor. */
export function itemCursorMeta(cursor: string): Meta {
  return { page: { cursor } };
}
