/**
 * The request `Content-Type` an operations endpoint requires (SPEC 11.1):
 * the JSON:API media type with the extension declared in `ext`. The host
 * reads the header; this checks it.
 * @ref https://jsonapi.org/ext/atomic/#processing
 * @packageDocumentation
 */
import { jsonApiError } from '../errors/json-api-error';
import { ATOMIC_OPERATIONS_EXTENSION } from '../internal/constants';
import { jsonApiParameters } from '../media-type/json-api';
import { parseMediaType } from '../media-type/parse';

/**
 * Throws a 415 unless `contentType` is the JSON:API media type whose `ext`
 * parameter lists the Atomic Operations extension ("MUST ... specify the
 * extension in the `ext` media type parameter"). Other parameters are the
 * negotiation layer's concern.
 */
export function assertOperationsContentType(
  contentType: string | undefined,
): void {
  const mediaType =
    contentType === undefined ? undefined : parseMediaType(contentType);
  const declared =
    mediaType !== undefined &&
    jsonApiParameters(mediaType).ext.includes(ATOMIC_OPERATIONS_EXTENSION);
  if (!declared) {
    throw jsonApiError('UNSUPPORTED_MEDIA_TYPE', {
      detail: `Operations requests must declare the extension: Content-Type: application/vnd.api+json; ext="${ATOMIC_OPERATIONS_EXTENSION}"`,
      source: { header: 'Content-Type' },
    });
  }
}
