/**
 * The closed catalog of error codes this package emits (SPEC 4.1). Each entry
 * fixes the HTTP status and the `title`, which the specification says SHOULD
 * NOT change from occurrence to occurrence; `detail` and `source` vary per
 * occurrence.
 * @ref https://jsonapi.org/format/1.1/#error-objects
 * @packageDocumentation
 */
import type { ErrorStatusCode } from './status';

import {
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_FORBIDDEN,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_ACCEPTABLE,
  HTTP_NOT_FOUND,
  HTTP_UNSUPPORTED_MEDIA_TYPE,
} from '../internal/constants';

export interface CatalogEntry {
  readonly status: ErrorStatusCode;
  readonly title: string;
}

/** 422 Unprocessable Content: the request was well-formed but semantically invalid. */
const HTTP_UNPROCESSABLE_CONTENT = 422;

export type ErrorCode =
  | 'INVALID_QUERY_PARAMETER'
  | 'UNKNOWN_QUERY_PARAMETER'
  | 'INVALID_DOCUMENT'
  | 'MALFORMED_JSON'
  | 'UNSUPPORTED_SORT'
  | 'MAX_PAGE_SIZE_EXCEEDED'
  | 'RANGE_PAGINATION_NOT_SUPPORTED'
  | 'FORBIDDEN'
  | 'CLIENT_GENERATED_ID_NOT_SUPPORTED'
  | 'NOT_FOUND'
  | 'NOT_ACCEPTABLE'
  | 'CONFLICT'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'VALIDATION_FAILED'
  | 'INTERNAL_SERVER_ERROR';

export const ERROR_CATALOG: Readonly<Record<ErrorCode, CatalogEntry>> = {
  /** A query parameter whose value cannot be processed. */
  INVALID_QUERY_PARAMETER: {
    status: HTTP_BAD_REQUEST,
    title: 'Invalid Query Parameter',
  },
  /** A query parameter the endpoint does not know how to process. */
  UNKNOWN_QUERY_PARAMETER: {
    status: HTTP_BAD_REQUEST,
    title: 'Unknown Query Parameter',
  },
  /** A request document that violates the document structure rules. */
  INVALID_DOCUMENT: { status: HTTP_BAD_REQUEST, title: 'Invalid Document' },
  /** A request body that is not JSON. */
  MALFORMED_JSON: { status: HTTP_BAD_REQUEST, title: 'Malformed JSON' },
  /** The Cursor Pagination profile's unsupported sort error. */
  UNSUPPORTED_SORT: { status: HTTP_BAD_REQUEST, title: 'Unsupported Sort' },
  /** The Cursor Pagination profile's max page size exceeded error. */
  MAX_PAGE_SIZE_EXCEEDED: {
    status: HTTP_BAD_REQUEST,
    title: 'Max Page Size Exceeded',
  },
  /** The Cursor Pagination profile's range pagination not supported error. */
  RANGE_PAGINATION_NOT_SUPPORTED: {
    status: HTTP_BAD_REQUEST,
    title: 'Range Pagination Not Supported',
  },
  FORBIDDEN: { status: HTTP_FORBIDDEN, title: 'Forbidden' },
  /** A client-generated `id` on a resource whose definition does not accept them. */
  CLIENT_GENERATED_ID_NOT_SUPPORTED: {
    status: HTTP_FORBIDDEN,
    title: 'Client-Generated ID Not Supported',
  },
  NOT_FOUND: { status: HTTP_NOT_FOUND, title: 'Not Found' },
  NOT_ACCEPTABLE: { status: HTTP_NOT_ACCEPTABLE, title: 'Not Acceptable' },
  CONFLICT: { status: HTTP_CONFLICT, title: 'Conflict' },
  UNSUPPORTED_MEDIA_TYPE: {
    status: HTTP_UNSUPPORTED_MEDIA_TYPE,
    title: 'Unsupported Media Type',
  },
  /** Attribute validation failed; one error object per issue. */
  VALIDATION_FAILED: {
    status: HTTP_UNPROCESSABLE_CONTENT,
    title: 'Validation Failed',
  },
  INTERNAL_SERVER_ERROR: {
    status: HTTP_INTERNAL_SERVER_ERROR,
    title: 'Internal Server Error',
  },
};

/** Every code, in catalog order. */
export const ERROR_CODES: ReadonlyArray<ErrorCode> = [
  'INVALID_QUERY_PARAMETER',
  'UNKNOWN_QUERY_PARAMETER',
  'INVALID_DOCUMENT',
  'MALFORMED_JSON',
  'UNSUPPORTED_SORT',
  'MAX_PAGE_SIZE_EXCEEDED',
  'RANGE_PAGINATION_NOT_SUPPORTED',
  'FORBIDDEN',
  'CLIENT_GENERATED_ID_NOT_SUPPORTED',
  'NOT_FOUND',
  'NOT_ACCEPTABLE',
  'CONFLICT',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_FAILED',
  'INTERNAL_SERVER_ERROR',
];
