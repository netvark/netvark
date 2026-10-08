/**
 * Request body reading (SPEC 10.3): the JSON of a request document, or a
 * 415 when the body is not declared as JSON:API, or a 400 when it is not
 * JSON. The media type parameters were already checked by `jsonApi()`.
 * @ref https://jsonapi.org/format/1.1/#content-negotiation-all
 * @packageDocumentation
 */
import type { Context, Env } from 'hono';

import { JsonApiError } from '../errors/json-api-error';
import { isJsonApiMediaType } from '../media-type/json-api';
import { parseMediaType } from '../media-type/parse';

/** The parsed JSON body of a request declared as `application/vnd.api+json`. */
export async function readDocument<E extends Env>(
  c: Context<E>,
): Promise<unknown> {
  const contentType = c.req.header('content-type');
  const mediaType =
    contentType === undefined ? undefined : parseMediaType(contentType);
  if (mediaType === undefined || !isJsonApiMediaType(mediaType)) {
    throw JsonApiError.unsupportedMediaType(
      'Request documents must be sent with Content-Type application/vnd.api+json',
    );
  }
  const text = await c.req.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw JsonApiError.malformedJson();
  }
}
