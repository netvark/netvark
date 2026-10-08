/**
 * `paginatedDocument` (SPEC 8.1): a collection document under the Cursor
 * Pagination profile, assembled from a page of rows and the cursors an
 * engine computed. It adds the profile to `jsonapi.profile`, the pagination
 * links, `meta.page`, and per-item cursors, and leaves everything else to
 * `collectionDocument`.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 * @packageDocumentation
 */
import type { DocumentOptions } from '../document/build';
import type { CollectionDocument, ResourceObject } from '../document/types';
import type { ResourceDefinition } from '../resource/types';
import type { PageCursors, PageLinksOptions, PageMetaInit } from './links';

import { collectionDocument } from '../document/build';
import { CURSOR_PAGINATION_PROFILE } from '../internal/constants';
import { isRecord } from '../internal/object';
import { pageMeta, paginationLinks } from './links';

export interface Page<TRow> extends PageCursors, PageMetaInit {
  readonly rows: ReadonlyArray<TRow>;
  /** The cursor that falls on each row, emitted as `meta.page.cursor`. */
  readonly cursor?: ((row: TRow) => string) | undefined;
}

export interface PaginatedOptions extends DocumentOptions, PageLinksOptions {
  /** The request URL the links are derived from. */
  readonly url: URL | string;
}

/** Adds `meta.page.cursor`, keeping any other `meta` and `meta.page` members. */
function withItemMeta(
  resource: ResourceObject,
  cursor: string,
): ResourceObject {
  const existing = resource.meta?.['page'];
  const page = { ...(isRecord(existing) ? existing : {}), cursor };
  return { ...resource, meta: { ...resource.meta, page } };
}

/**
 * Builds the collection document for one page. Pagination links and
 * `meta.page` are merged over any `links` and `meta` passed in.
 */
export function paginatedDocument<TRow>(
  resource: ResourceDefinition<
    string,
    string,
    string,
    TRow,
    string,
    string,
    unknown,
    unknown
  >,
  page: Page<TRow>,
  options: PaginatedOptions,
): CollectionDocument {
  const profile = [
    ...(options.jsonapi?.profile ?? []).filter(
      (uri) => uri !== CURSOR_PAGINATION_PROFILE,
    ),
    CURSOR_PAGINATION_PROFILE,
  ];
  const document = collectionDocument(resource, page.rows, {
    ...options,
    jsonapi: { ...options.jsonapi, profile },
    links: {
      ...options.links,
      ...paginationLinks(options.url, page, { relative: options.relative }),
    },
    meta: { ...options.meta, ...pageMeta(page) },
  });
  if (page.cursor === undefined) {
    return document;
  }
  const cursor = page.cursor;
  return {
    ...document,
    data: document.data.map((item, index) => {
      const row = page.rows[index];
      return row === undefined ? item : withItemMeta(item, cursor(row));
    }),
  };
}
