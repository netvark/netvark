/**
 * The contacts API as the screen tests meet it (resource SPEC 20.8): the
 * fixture's clients over a `fetch` that records each request as it
 * arrives and answers with what the test's handler returns, a JSON:API
 * document or an error document, once the handler's promise settles. A
 * `QueryClient` that does not retry, so a refused call settles at once.
 * Not published with the package.
 * @packageDocumentation
 */
import type { Clients } from '@netvark/jsonapi-client';
import type { AnyResource } from '@netvark/jsonapi-core';

import { QueryClient } from '@tanstack/react-query';

import { createClients, createTransport } from '@netvark/jsonapi-client';

import { Contacts, Organizations, Plans } from './resources';

const NO_CONTENT = 204;
const MEDIA_TYPE = 'application/vnd.api+json';

/** The fixture's definitions, by the names the clients take; a type alias, which `createClients`'s record constraint accepts. */
export type FixtureDefinitions = {
  readonly plans: AnyResource;
  readonly organizations: AnyResource;
  readonly contacts: AnyResource;
};

const DEFINITIONS: FixtureDefinitions = {
  plans: Plans.resource,
  organizations: Organizations.resource,
  contacts: Contacts.resource,
};

/** A request as it arrived. */
export interface Arrival {
  readonly method: string;
  /** The request's URL as sent, from which a document's links derive. */
  readonly url: string;
  /** The path and the query string, decoded, as `page[after]=c2`. */
  readonly target: string;
  /** The request document, `undefined` without a body. */
  readonly body: unknown;
  readonly signal: AbortSignal;
}

/** What the server answers: a status and its document, none for a 204. */
export interface Answer {
  readonly status: number;
  readonly document?: unknown;
}

/** The answer to `arrival`, which the server sends once the promise settles. */
export type Handler = (arrival: Arrival) => Answer | Promise<Answer>;

/** The clients, the requests they sent, and the cache the tests read through. */
export interface QueryServer {
  readonly clients: Clients<FixtureDefinitions>;
  readonly arrivals: ReadonlyArray<Arrival>;
  readonly queryClient: QueryClient;
}

/** The fixture's clients over the handler, and a cache that does not retry. */
export function queryServer(handler: Handler): QueryServer {
  const arrivals: Array<Arrival> = [];
  const transport = createTransport({
    origin: 'https://api.example.test',
    fetch: async (request) => {
      const text = await request.clone().text();
      const url = new URL(request.url);
      const arrival: Arrival = {
        method: request.method,
        url: request.url,
        target: decodeURIComponent(`${url.pathname}${url.search}`),
        body: text === '' ? undefined : JSON.parse(text),
        signal: request.signal,
      };
      arrivals.push(arrival);
      const { status, document } = await handler(arrival);
      return status === NO_CONTENT
        ? new Response(null, { status })
        : new Response(JSON.stringify(document), {
            status,
            headers: { 'Content-Type': MEDIA_TYPE },
          });
    },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    clients: createClients(DEFINITIONS, transport),
    arrivals,
    queryClient,
  };
}
