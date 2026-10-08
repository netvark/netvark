/**
 * The Cursor Pagination profile's error cases (SPEC 8.4). Each is a 400 whose
 * error object identifies its `source` parameter and, where the profile
 * defines one, carries a `type` link beneath the profile URI. The link is a
 * string: the profile's prose says "has a `type` link of", JSON:API defines
 * `links.type` as a link, and a link is a string, a link object, or `null`.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/ (Error Cases)
 * @ref https://jsonapi.org/format/1.1/#document-links-link
 * @packageDocumentation
 */
import type { ErrorObject } from '../document/types';

import { JsonApiError, errorObject } from '../errors/json-api-error';
import { CURSOR_PAGINATION_ERROR_BASE } from '../internal/constants';

export const UNSUPPORTED_SORT_TYPE: string = `${CURSOR_PAGINATION_ERROR_BASE}/unsupported-sort`;
export const MAX_SIZE_EXCEEDED_TYPE: string = `${CURSOR_PAGINATION_ERROR_BASE}/max-size-exceeded`;
export const RANGE_PAGINATION_NOT_SUPPORTED_TYPE: string = `${CURSOR_PAGINATION_ERROR_BASE}/range-pagination-not-supported`;

/** `page[size]` above the endpoint's max: `meta.page.maxSize` carries the max. */
export function maxPageSizeExceededError(
  requested: number,
  maxSize: number,
): ErrorObject {
  return errorObject('MAX_PAGE_SIZE_EXCEEDED', {
    detail: `page[size] ${String(requested)} exceeds the maximum of ${String(maxSize)}`,
    source: { parameter: 'page[size]' },
    links: { type: MAX_SIZE_EXCEEDED_TYPE },
    meta: { page: { maxSize } },
  });
}

/** A `sort` field the endpoint cannot order by. */
export function unsupportedSortError(field: string): ErrorObject {
  return errorObject('UNSUPPORTED_SORT', {
    detail: `Sort field "${field}" is not supported by this endpoint`,
    source: { parameter: 'sort' },
    links: { type: UNSUPPORTED_SORT_TYPE },
  });
}

/** `page[after]` and `page[before]` together on an endpoint without range support. */
export function rangePaginationNotSupportedError(): ErrorObject {
  return errorObject('RANGE_PAGINATION_NOT_SUPPORTED', {
    detail: 'page[after] and page[before] cannot be combined on this endpoint',
    source: { parameter: 'page[before]' },
    links: { type: RANGE_PAGINATION_NOT_SUPPORTED_TYPE },
  });
}

/**
 * The profile's invalid parameter value error, for a cursor the engine
 * cannot decode. Exported for pagination engines: the parser only checks
 * that cursors are non-empty strings.
 */
export function invalidCursorError(
  parameter: 'page[after]' | 'page[before]',
  detail = `${parameter} is not a valid cursor`,
): ErrorObject {
  return errorObject('INVALID_QUERY_PARAMETER', {
    detail,
    source: { parameter },
  });
}

/** `JsonApiError` wrappers for throwing from an engine. */
export function invalidCursor(
  parameter: 'page[after]' | 'page[before]',
  detail?: string,
): JsonApiError {
  return new JsonApiError(invalidCursorError(parameter, detail));
}

export function unsupportedSort(field: string): JsonApiError {
  return new JsonApiError(unsupportedSortError(field));
}
