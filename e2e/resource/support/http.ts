/**
 * Requests to the contacts application's API, sent through Hono's
 * `app.request`, the full pipeline without a socket: `Accept` and, with a
 * body, `Content-Type` are the JSON:API media type unless a test sets
 * them, and `X-Actor` names the member.
 * @ref https://hono.dev/docs/api/hono#request
 * @ref https://jsonapi.org/format/1.1/#content-negotiation-clients
 */
import type { Hono } from 'hono';

import type { AppEnv } from '../runtime/api.ts';

const JSON_API = 'application/vnd.api+json';

/** What a request sends. */
export interface Request {
  readonly actor?: string | undefined;
  /** A request document, sent as JSON. */
  readonly body?: unknown;
  /** A body sent as is, in place of `body`. */
  readonly raw?: string | undefined;
  readonly accept?: string | undefined;
  readonly contentType?: string | undefined;
}

/** What came back: the status, the headers, the media type without parameters, and the parsed body. */
export interface Sent {
  readonly status: number;
  readonly headers: Headers;
  readonly mediaType: string | undefined;
  readonly body: unknown;
}

/** Sends `request` to `url` with `method`. */
export async function send(
  app: Hono<AppEnv>,
  method: string,
  url: string,
  request: Request = {},
): Promise<Sent> {
  const text =
    request.raw ??
    (request.body === undefined ? undefined : JSON.stringify(request.body));
  const headers = new Headers({ Accept: request.accept ?? JSON_API });
  if (text !== undefined) {
    headers.set('Content-Type', request.contentType ?? JSON_API);
  }
  if (request.actor !== undefined) {
    headers.set('X-Actor', request.actor);
  }
  const response = await app.request(url, {
    method: method.toUpperCase(),
    headers,
    ...(text === undefined ? {} : { body: text }),
  });
  const contentType = response.headers.get('Content-Type');
  const body = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    mediaType: contentType?.split(';')[0]?.trim().toLowerCase(),
    body: body === '' ? undefined : (JSON.parse(body) as unknown),
  };
}
