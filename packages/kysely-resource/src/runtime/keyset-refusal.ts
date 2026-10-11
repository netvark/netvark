/**
 * A keyset refusal as the client's error (resource SPEC 18.5), as keyset's
 * design maps refusals onto `@netvark/jsonapi-core` (keyset DESIGN 3.6):
 * the Cursor Pagination profile's error where the profile defines one,
 * and `INVALID_QUERY_PARAMETER` at the parameter the refusal names
 * otherwise. A detail written here names the parameter, never its value,
 * and a field or operator only once the keyset has accepted it as
 * declared.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--errors
 * @ref https://jsonapi.org/format/1.1/#query-parameters ("the server MUST respond with 400 Bad Request")
 * @packageDocumentation
 */
import type { BanError } from '@netvark/ban-core';

import {
  invalidCursor,
  jsonApiError,
  maxPageSizeExceededError,
  rangePaginationNotSupportedError,
  unsupportedSortError,
} from '@netvark/jsonapi-core';
import {
  InvalidCursorError,
  InvalidFilterError,
  InvalidFilterValueError,
  InvalidPageSizeError,
  PageSizeExceededError,
  RangeNotSupportedError,
  UnsupportedFilterError,
  UnsupportedSearchError,
  UnsupportedSortError,
} from '@netvark/keyset-core';

/** The profile's own error for a refusal it defines one for. */
function profileError(error: unknown): BanError | undefined {
  if (error instanceof UnsupportedSortError) {
    return jsonApiError(
      error.fields.map((field) => unsupportedSortError(field)),
    );
  }
  if (error instanceof PageSizeExceededError) {
    return jsonApiError(maxPageSizeExceededError(error.requested, error.max));
  }
  if (error instanceof RangeNotSupportedError) {
    return jsonApiError(rangePaginationNotSupportedError());
  }
  if (error instanceof InvalidCursorError) {
    return invalidCursor(`page[${error.parameter}]`);
  }
  return undefined;
}

/** The parameter a refusal names and what is wrong with it, for the refusals the profile leaves to the server. */
function refusedParameter(
  error: unknown,
): { readonly parameter: string; readonly detail: string } | undefined {
  if (error instanceof InvalidFilterValueError) {
    const parameter = `filter[${error.field}][${error.operator}]`;
    return {
      parameter,
      detail: `${parameter} has a value its field does not accept.`,
    };
  }
  if (error instanceof UnsupportedFilterError) {
    return {
      parameter: 'filter',
      detail:
        'filter names a field or an operator this endpoint does not support.',
    };
  }
  if (error instanceof InvalidFilterError) {
    return {
      parameter: 'filter',
      detail: 'filter is not a filter this endpoint can read.',
    };
  }
  if (error instanceof UnsupportedSearchError) {
    return {
      parameter: 'filter[q]',
      detail: 'filter[q] is not supported by this endpoint.',
    };
  }
  if (error instanceof InvalidPageSizeError) {
    return {
      parameter: 'page[size]',
      detail: 'page[size] must be a positive integer.',
    };
  }
  return undefined;
}

/**
 * The client's error for a keyset refusal, or `undefined` for anything
 * that is not one.
 */
export function keysetRefusal(error: unknown): BanError | undefined {
  const profile = profileError(error);
  if (profile !== undefined) {
    return profile;
  }
  const refused = refusedParameter(error);
  return refused === undefined
    ? undefined
    : jsonApiError('INVALID_QUERY_PARAMETER', {
        detail: refused.detail,
        source: { parameter: refused.parameter },
      });
}
