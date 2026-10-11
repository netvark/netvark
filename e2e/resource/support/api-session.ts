/**
 * A session with the contacts application's API for the OpenAPI tests
 * (resource SPEC 13.1, 15.4): the runtime on a fresh database, the API
 * over it, and `exchange`, which sends a request and fails the test when
 * the answer breaks the application's document.
 */
import type { RuntimeDatabase } from '../runtime/database.ts';
import type { Request, Sent } from './http.ts';
import type { Method } from './openapi-contract.ts';

import { expect } from 'vitest';

import { createApi } from '../runtime/api.ts';
import { openRuntime } from '../runtime/fixture.ts';
import { APP_DOCUMENT } from './app-document.ts';
import { send } from './http.ts';
import { contractOf } from './openapi-contract.ts';

export interface ApiSession {
  readonly database: RuntimeDatabase;
  /** Sends `request` to `url`, an instance of the document's `path`, and checks the answer against the document. */
  readonly exchange: (
    method: Method,
    path: string,
    url: string,
    request?: Request,
  ) => Promise<Sent>;
}

/** The application's document as a contract. */
export const APP_CONTRACT = contractOf(APP_DOCUMENT);

export async function openApiSession(): Promise<ApiSession> {
  const { database, runtime } = await openRuntime();
  const api = createApi(runtime);
  return {
    database,
    exchange: async (method, path, url, request = {}) => {
      const sent = await send(api, method, url, request);
      expect(
        APP_CONTRACT.response(method, path, sent),
        `${method} ${url} answered ${String(sent.status)}: ${JSON.stringify(sent.body)}`,
      ).toEqual([]);
      return sent;
    },
  };
}
