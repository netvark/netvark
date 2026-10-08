/**
 * `JsonApiError` (SPEC 4.2): an `Error` carrying JSON:API error objects and
 * the HTTP status of the response that reports them. Factories on the class
 * build every catalog entry; callers throw, and the Hono integration or
 * `app.onError` renders.
 * @ref https://jsonapi.org/format/1.1/#errors
 * @packageDocumentation
 */
import type {
  DocumentBase,
  ErrorDocument,
  ErrorObject,
} from '../document/types';
import type { ErrorCode } from './catalog';
import type { ErrorStatusCode } from './status';

import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
} from '../internal/constants';
import { compact } from '../internal/object';
import { ERROR_CATALOG } from './catalog';
import { isErrorStatusCode } from './status';

const SERVER_ERROR_MIN = 500;

export interface JsonApiErrorOptions {
  /** Overrides the status derived from the error objects. */
  readonly status?: ErrorStatusCode | undefined;
  readonly cause?: unknown;
}

/** The per-occurrence members a factory accepts. */
export interface ErrorObjectInit {
  readonly id?: string | undefined;
  readonly detail?: string | undefined;
  readonly source?: ErrorObject['source'];
  readonly links?: ErrorObject['links'];
  readonly meta?: ErrorObject['meta'];
}

function isList(
  value: ErrorObject | ReadonlyArray<ErrorObject>,
): value is ReadonlyArray<ErrorObject> {
  return Array.isArray(value);
}

/**
 * The "most generally applicable" status for several problems: the common
 * status when all agree, 400 when all are client errors, otherwise 500. An
 * error object whose `status` is not a registered 4xx or 5xx code
 * contributes nothing; no statuses at all is a 500.
 * @ref https://jsonapi.org/format/1.1/#errors-processing
 */
export function responseStatus(
  errors: ReadonlyArray<ErrorObject>,
): ErrorStatusCode {
  const statuses = new Set<ErrorStatusCode>();
  for (const error of errors) {
    const status = Number(error.status);
    if (isErrorStatusCode(status)) {
      statuses.add(status);
    }
  }
  if (statuses.size === 1) {
    return [...statuses][0] ?? HTTP_INTERNAL_SERVER_ERROR;
  }
  if (statuses.size > 1 && [...statuses].every((s) => s < SERVER_ERROR_MIN)) {
    return HTTP_BAD_REQUEST;
  }
  return HTTP_INTERNAL_SERVER_ERROR;
}

/**
 * Builds one error object from a catalog code: `status` (as a string) and
 * `title` come from the catalog, the rest from `init`. Members left
 * `undefined` are omitted so the object serializes without gaps.
 */
export function errorObject(
  code: ErrorCode,
  init: ErrorObjectInit = {},
): ErrorObject {
  const entry = ERROR_CATALOG[code];
  return compact({
    id: init.id,
    links: init.links,
    status: String(entry.status),
    code,
    title: entry.title,
    detail: init.detail,
    source: init.source,
    meta: init.meta,
  });
}

export class JsonApiError extends Error {
  public override readonly name: string = 'JsonApiError';
  /** HTTP status of the response reporting these errors. */
  public readonly status: ErrorStatusCode;
  /** At least one error object. */
  public readonly errors: ReadonlyArray<ErrorObject>;

  public constructor(
    errors: ErrorObject | ReadonlyArray<ErrorObject>,
    options: JsonApiErrorOptions = {},
  ) {
    const list = isList(errors) ? errors : [errors];
    if (list.length === 0) {
      throw new TypeError('JsonApiError needs at least one error object');
    }
    const status = options.status ?? responseStatus(list);
    if (!isErrorStatusCode(status)) {
      throw new TypeError(
        `JsonApiError status ${String(status)} is not a registered 4xx or 5xx status code`,
      );
    }
    super(
      describe(list, status),
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.status = status;
    this.errors = list;
  }

  /** An error document carrying these errors and any top-level members. */
  public document(base: DocumentBase = {}): ErrorDocument {
    return compact({
      jsonapi: base.jsonapi,
      links: base.links,
      meta: base.meta,
      errors: this.errors,
    });
  }

  /** One error object from the catalog; `status` follows the catalog entry. */
  public static of(code: ErrorCode, init: ErrorObjectInit = {}): JsonApiError {
    return new JsonApiError(errorObject(code, init));
  }

  public static invalidParameter(
    parameter: string,
    detail: string,
  ): JsonApiError {
    return JsonApiError.of('INVALID_QUERY_PARAMETER', {
      detail,
      source: { parameter },
    });
  }

  public static unknownParameter(
    parameter: string,
    detail?: string,
  ): JsonApiError {
    return JsonApiError.of('UNKNOWN_QUERY_PARAMETER', {
      detail:
        detail ??
        `Query parameter "${parameter}" is not supported by this endpoint`,
      source: { parameter },
    });
  }

  /** `pointer` is an RFC 6901 JSON Pointer into the request document. */
  public static invalidDocument(pointer: string, detail: string): JsonApiError {
    return JsonApiError.of('INVALID_DOCUMENT', { detail, source: { pointer } });
  }

  public static malformedJson(): JsonApiError {
    return JsonApiError.of('MALFORMED_JSON', {
      detail: 'The request body is not valid JSON',
    });
  }

  public static forbidden(
    detail: string,
    source?: ErrorObject['source'],
  ): JsonApiError {
    return JsonApiError.of('FORBIDDEN', { detail, source });
  }

  /**
   * 403 for a client-generated `id` on a resource that does not accept them.
   * @ref https://jsonapi.org/format/1.1/#crud-creating-client-ids
   */
  public static clientGeneratedIdNotSupported(
    pointer = '/data/id',
  ): JsonApiError {
    return JsonApiError.of('CLIENT_GENERATED_ID_NOT_SUPPORTED', {
      detail: 'This resource does not accept client-generated ids',
      source: { pointer },
    });
  }

  public static notFound(
    detail?: string,
    source?: ErrorObject['source'],
  ): JsonApiError {
    return JsonApiError.of('NOT_FOUND', {
      detail: detail ?? 'The requested resource does not exist',
      source,
    });
  }

  public static notAcceptable(detail: string): JsonApiError {
    return JsonApiError.of('NOT_ACCEPTABLE', {
      detail,
      source: { header: 'Accept' },
    });
  }

  public static conflict(
    detail: string,
    source?: ErrorObject['source'],
  ): JsonApiError {
    return JsonApiError.of('CONFLICT', { detail, source });
  }

  public static unsupportedMediaType(detail: string): JsonApiError {
    return JsonApiError.of('UNSUPPORTED_MEDIA_TYPE', {
      detail,
      source: { header: 'Content-Type' },
    });
  }

  /** 422 with one error object per issue, each pointing at its member. */
  public static validationFailed(
    issues: ReadonlyArray<{
      readonly pointer: string;
      readonly detail: string;
    }>,
  ): JsonApiError {
    if (issues.length === 0) {
      throw new TypeError('validationFailed needs at least one issue');
    }
    return new JsonApiError(
      issues.map((issue) =>
        errorObject('VALIDATION_FAILED', {
          detail: issue.detail,
          source: { pointer: issue.pointer },
        }),
      ),
    );
  }

  /** A constant 500 that reveals nothing about the failure. */
  public static internal(cause?: unknown): JsonApiError {
    return new JsonApiError(
      errorObject('INTERNAL_SERVER_ERROR', {
        detail: 'An unexpected error occurred',
      }),
      { cause },
    );
  }
}

/** A one-line message for logs: status, codes, and the first detail. */
function describe(
  errors: ReadonlyArray<ErrorObject>,
  status: ErrorStatusCode,
): string {
  const codes = [...new Set(errors.map((error) => error.code ?? 'unknown'))];
  const detail = errors.find((error) => error.detail !== undefined)?.detail;
  return `${String(status)} ${codes.join(', ')}${detail === undefined ? '' : `: ${detail}`}`;
}

/**
 * Narrows to `JsonApiError` structurally as well as by `instanceof`, so an
 * error thrown by a second installed copy of this package is still rendered
 * as JSON:API rather than as a 500.
 */
export function isJsonApiError(value: unknown): value is JsonApiError {
  if (value instanceof JsonApiError) {
    return true;
  }
  return (
    value instanceof Error &&
    value.name === 'JsonApiError' &&
    'errors' in value &&
    Array.isArray(value.errors) &&
    'status' in value &&
    typeof value.status === 'number'
  );
}

/** An error document from error objects, for callers without a `JsonApiError`. */
export function errorDocument(
  errors: ReadonlyArray<ErrorObject>,
  base: DocumentBase = {},
): ErrorDocument {
  return compact({
    jsonapi: base.jsonapi,
    links: base.links,
    meta: base.meta,
    errors,
  });
}
