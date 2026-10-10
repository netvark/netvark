/**
 * HTTP error status codes (SPEC 2.1): the 4xx and 5xx codes of the IANA
 * registry. Catalog entries, `BanError.status`, and `ban.custom()` take this
 * union, so an error never carries a success or redirect status. The
 * built-in catalog covers every code here except 418.
 * @ref https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-15.5
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-15.6
 * @packageDocumentation
 */

export type ClientErrorStatusCode =
  | 400
  | 401
  | 402
  | 403
  | 404
  | 405
  | 406
  | 407
  | 408
  | 409
  | 410
  | 411
  | 412
  | 413
  | 414
  | 415
  | 416
  | 417
  | 418
  | 421
  | 422
  | 423
  | 424
  | 425
  | 426
  | 428
  | 429
  | 431
  | 451;

export type ServerErrorStatusCode =
  | 500
  | 501
  | 502
  | 503
  | 504
  | 505
  | 506
  | 507
  | 508
  | 510
  | 511;

export type ErrorStatusCode = ClientErrorStatusCode | ServerErrorStatusCode;

const FIRST_CLIENT_ERROR = 400;
const LAST_SERVER_ERROR = 599;

/**
 * Whether `value` is an integer of the 4xx or 5xx class. RFC 9110 section
 * 15 has a recipient treat an unregistered code by its class, so the guard
 * accepts the whole class while the type names the registered codes: a 499
 * passes at runtime, and `reasonPhrase()` has no title for it.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-15
 */
export function isErrorStatus(value: unknown): value is ErrorStatusCode {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= FIRST_CLIENT_ERROR &&
    value <= LAST_SERVER_ERROR
  );
}
