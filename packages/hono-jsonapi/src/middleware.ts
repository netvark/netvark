/**
 * `jsonApi()` (SPEC 10.1): content negotiation as Hono middleware. A
 * request the specification says to reject gets a 415 or 406 error
 * document; otherwise the negotiation result is stored as the `jsonApi`
 * context variable and `Vary: Accept` is added to every JSON:API response.
 * @ref https://jsonapi.org/format/1.1/#content-negotiation-servers
 * @packageDocumentation
 */
import type { Context, MiddlewareHandler, Next } from 'hono';

import type {
  JsonApiError,
  NegotiationOptions,
  NegotiationSuccess,
} from 'jsonapi-kit';

import type { JsonApiEnv } from './types';

import { createMiddleware } from 'hono/factory';

import { negotiate } from 'jsonapi-kit';

import { isJsonApiResponse, respondError, varyAccept } from './respond';

export type JsonApiOptions = NegotiationOptions;

/** The 415 or 406; it varies by `Accept` like any other JSON:API response. */
function rejected(c: Context<JsonApiEnv>, error: JsonApiError): Response {
  const response = respondError(c, error);
  response.headers.set('Vary', varyAccept(response.headers.get('vary')));
  return response;
}

async function accepted(
  c: Context<JsonApiEnv>,
  negotiation: NegotiationSuccess,
  next: Next,
): Promise<void> {
  c.set('jsonApi', {
    request: negotiation.request,
    extensions: negotiation.extensions,
    profiles: negotiation.profiles,
  });
  await next();
  if (isJsonApiResponse(c.res)) {
    c.header('Vary', varyAccept(c.res.headers.get('vary')));
  }
}

/**
 * Negotiates `Content-Type` and `Accept` against the extensions and
 * profiles the mounted routes support. Mount it where JSON:API routes live;
 * responses with other media types pass through untouched.
 */
export function jsonApi(
  options: JsonApiOptions = {},
): MiddlewareHandler<JsonApiEnv> {
  return createMiddleware<JsonApiEnv>(async (c, next) => {
    const negotiation = negotiate(
      {
        contentType: c.req.header('content-type'),
        accept: c.req.header('accept'),
      },
      options,
    );
    return negotiation.ok
      ? accepted(c, negotiation, next)
      : rejected(c, negotiation.error);
  });
}
