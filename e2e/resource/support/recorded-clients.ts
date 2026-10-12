/**
 * The contacts application's clients, as the built
 * `@netvark/jsonapi-client` makes them, over a transport to a contacts
 * server that records each request as it leaves: the method, the path,
 * and the request document. Each request acts as the editor and sends
 * the language `language` returns when it leaves, as an application's
 * transport sends Paraglide's locale.
 */
import type { Clients, ResponseError } from '@netvark/jsonapi-client';

import {
  createClients,
  createTransport,
  isResponseError,
} from '@netvark/jsonapi-client';

import { Contacts } from '../resources/contacts.ts';
import { Organizations } from '../resources/organizations.ts';

const DEFINITIONS = {
  contacts: Contacts.resource,
  organizations: Organizations.resource,
};

export type ContactClients = Clients<typeof DEFINITIONS>;

/** A request as the transport sent it. */
export interface Departure {
  readonly method: string;
  readonly path: string;
  /** The request document, `undefined` without a body. */
  readonly body: unknown;
}

/** Clients to `origin` whose requests are pushed onto `departures`. */
export function recordedClients(
  origin: string,
  departures: Array<Departure>,
  language: () => string,
): ContactClients {
  const transport = createTransport({
    origin,
    headers: { 'X-Actor': 'editor' },
    language,
    fetch: async (request) => {
      const text = await request.clone().text();
      departures.push({
        method: request.method,
        path: new URL(request.url).pathname,
        body: text === '' ? undefined : JSON.parse(text),
      });
      return fetch(request);
    },
  });
  return createClients(DEFINITIONS, transport);
}

/** The `ResponseError` a write the server refuses rejects with. */
export async function refusal(
  write: () => Promise<unknown>,
): Promise<ResponseError> {
  try {
    await write();
  } catch (error) {
    if (isResponseError(error)) {
      return error;
    }
    throw error;
  }
  throw new Error('the server accepted the write');
}
