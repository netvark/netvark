import { describe, expect, it } from 'vitest';

import { JsonApiError } from '../errors/json-api-error';
import {
  MAX_SIZE_EXCEEDED_TYPE,
  RANGE_PAGINATION_NOT_SUPPORTED_TYPE,
  UNSUPPORTED_SORT_TYPE,
  invalidCursor,
  invalidCursorError,
  maxPageSizeExceededError,
  rangePaginationNotSupportedError,
  unsupportedSort,
  unsupportedSortError,
} from './errors';

const BASE = 'https://jsonapi.org/profiles/ethanresnick/cursor-pagination';

describe('cursor pagination profile errors', () => {
  it('uses the profile error type URIs as links.type', () => {
    expect(UNSUPPORTED_SORT_TYPE).toBe(`${BASE}/unsupported-sort`);
    expect(MAX_SIZE_EXCEEDED_TYPE).toBe(`${BASE}/max-size-exceeded`);
    expect(RANGE_PAGINATION_NOT_SUPPORTED_TYPE).toBe(
      `${BASE}/range-pagination-not-supported`,
    );
  });

  it('builds the max size error with the limit in meta and the parameter as source', () => {
    expect(maxPageSizeExceededError(500, 100)).toEqual({
      links: { type: MAX_SIZE_EXCEEDED_TYPE },
      status: '400',
      code: 'MAX_PAGE_SIZE_EXCEEDED',
      title: 'Max Page Size Exceeded',
      detail: 'page[size] 500 exceeds the maximum of 100',
      source: { parameter: 'page[size]' },
      meta: { page: { maxSize: 100 } },
    });
  });

  it('builds the sort and range errors against their parameters', () => {
    expect(unsupportedSortError('title')).toMatchObject({
      links: { type: UNSUPPORTED_SORT_TYPE },
      code: 'UNSUPPORTED_SORT',
      source: { parameter: 'sort' },
    });
    expect(rangePaginationNotSupportedError()).toMatchObject({
      links: { type: RANGE_PAGINATION_NOT_SUPPORTED_TYPE },
      code: 'RANGE_PAGINATION_NOT_SUPPORTED',
      source: { parameter: 'page[before]' },
    });
  });

  it('gives engines an invalid cursor error with a default or custom detail', () => {
    expect(invalidCursorError('page[after]')).toEqual({
      status: '400',
      code: 'INVALID_QUERY_PARAMETER',
      title: 'Invalid Query Parameter',
      detail: 'page[after] is not a valid cursor',
      source: { parameter: 'page[after]' },
    });
    expect(invalidCursorError('page[before]', 'Expired').detail).toBe(
      'Expired',
    );
  });

  it('wraps the engine errors as throwable JsonApiErrors', () => {
    const cursor = invalidCursor('page[after]');
    expect(cursor).toBeInstanceOf(JsonApiError);
    expect(cursor.status).toBe(400);
    expect(cursor.errors[0]?.source).toEqual({ parameter: 'page[after]' });
    const sort = unsupportedSort('x');
    expect(sort.errors[0]?.links).toEqual({ type: UNSUPPORTED_SORT_TYPE });
  });
});
