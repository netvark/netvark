/**
 * The Cursor Pagination profile from a client's side (SPEC 15.8, 8): the
 * cursors of a page's `next` and `prev` links, and an item's own cursor
 * in its `meta`. A link is a string or a link object, whose `href` is
 * read. An infinite list keys each page by its cursor and lists with
 * `page: { after }`; a page with no records ends the list in its
 * direction, since the profile lets `next` point at an empty page.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id-links
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id-pagination-item-metadata
 * @ref https://jsonapi.org/format/1.1/#document-links-link
 * @packageDocumentation
 */
import { isRecord, ownMember } from '../internal/object';

/** The cursors a page's links carry, each `undefined` when its link has none. */
export interface PageCursors {
  /** `page[after]` of `links.next`. */
  readonly next: string | undefined;
  /** `page[before]` of `links.prev`. */
  readonly prev: string | undefined;
}

/** A base for parsing a root-relative or relative link; never part of a result. */
const PLACEHOLDER = 'http://placeholder.invalid';

/** A link's URL: the string, or a link object's `href`. */
function hrefOf(link: unknown): string | undefined {
  if (typeof link === 'string') {
    return link;
  }
  const href = isRecord(link) ? ownMember(link, 'href') : undefined;
  return typeof href === 'string' ? href : undefined;
}

/** The value of `parameter` in the query of the link named `name`. */
function cursorIn(
  links: unknown,
  name: string,
  parameter: string,
): string | undefined {
  const href = isRecord(links) ? hrefOf(ownMember(links, name)) : undefined;
  if (href === undefined || !URL.canParse(href, PLACEHOLDER)) {
    return undefined;
  }
  return new URL(href, PLACEHOLDER).searchParams.get(parameter) ?? undefined;
}

/** The cursors of a page's `next` and `prev` links. */
export function pageCursors(result: { readonly links?: unknown }): PageCursors {
  return {
    next: cursorIn(result.links, 'next', 'page[after]'),
    prev: cursorIn(result.links, 'prev', 'page[before]'),
  };
}

/** A record's own cursor: `$meta.page.cursor` when it is a string (SPEC 8.3). */
export function cursorOf(record: {
  readonly $meta?: unknown;
}): string | undefined {
  const page = isRecord(record.$meta)
    ? ownMember(record.$meta, 'page')
    : undefined;
  const cursor = isRecord(page) ? ownMember(page, 'cursor') : undefined;
  return typeof cursor === 'string' ? cursor : undefined;
}
