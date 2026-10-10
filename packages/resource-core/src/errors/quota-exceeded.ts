/**
 * resource-core's own error code (SPEC 12.6, 17): the server runtime
 * refuses with it a create that would exceed a quota. 403, since the server
 * understood the request and refuses to fulfill it, and JSON:API allows 403
 * for an unsupported create.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-15.5.4
 * @ref https://jsonapi.org/format/1.1/#crud-creating-responses-403
 * @packageDocumentation
 */

export const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED';

/** The catalog fragment of resource-core's own code. */
export interface QuotaExceededCatalog {
  readonly QUOTA_EXCEEDED: {
    readonly status: 403;
    readonly title: 'Quota Exceeded';
  };
}

export const QUOTA_EXCEEDED_CATALOG: QuotaExceededCatalog = Object.freeze({
  QUOTA_EXCEEDED: Object.freeze({ status: 403, title: 'Quota Exceeded' }),
});
