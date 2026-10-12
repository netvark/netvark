/**
 * Runtime-neutral checks of `@netvark/hono-resource` (resource SPEC 19.8)
 * over the built package: the routes of a runtime of the contract held in
 * memory answer a declared resource at the path its links name, another
 * method with 405 and `Allow`, a request without an actor with what the
 * actor threw, a relationship link with its linkage, an update the
 * relationship does not support with 403, and a related link with the
 * target's document, through Hono's `fetch` as every runtime calls it. No
 * Node.js API, so the module runs on Bun, Deno, and workerd.
 */
import type { PublicRow, ResourceRuntime } from '@netvark/resource-core/server';

import type { Checks } from './report.ts';

import { Hono } from 'hono';

import {
  CURSOR_PAGINATION_PROFILE,
  errorHandler,
  jsonApi,
  jsonApiError,
  notFoundHandler,
} from '@netvark/hono-jsonapi';
import { jsonApiRoutes } from '@netvark/hono-resource';

import { Contacts } from '../resources/contacts.ts';
import { Organizations } from '../resources/organizations.ts';
import { check } from './report.ts';

const ACME: PublicRow = {
  id: '1',
  name: 'Acme',
  slug: 'acme',
  handle: null,
  seats: 5,
  country: 'DE',
  createdAt: '2026-10-11T08:00:00.000Z',
};

/** A contact of Acme's, its relationship held by public name. */
const ADA: PublicRow = { id: '7', name: 'Ada', organization: ACME.id };

/** The row of `rows` that `id` names, once a turn of the microtask queue has passed. */
async function rowOf(
  rows: ReadonlyArray<PublicRow>,
  id: string,
): Promise<PublicRow> {
  await Promise.resolve();
  const row = rows.find((candidate) => candidate.id === id);
  if (row === undefined) {
    throw jsonApiError('NOT_FOUND', { detail: 'The resource does not exist' });
  }
  return row;
}

/** The domain of the smoke runtime, which only reads, so a transaction is its domain as it is. */
const domain = {
  organizations: { get: async (id: string) => rowOf([ACME], id) },
  contacts: { get: async (id: string) => rowOf([ADA], id) },
};

const runtime: ResourceRuntime = {
  warnings: [],
  resources: [Organizations, Contacts],
  as: () => domain,
  transaction: async (_actor, work) => work(domain),
};

/** The host: negotiation, the error handlers, and the routes at `/`. */
function host(): Hono {
  const app = new Hono();
  app.use(jsonApi({ profiles: [CURSOR_PAGINATION_PROFILE] }));
  app.onError(errorHandler());
  app.notFound(notFoundHandler());
  app.route(
    '/',
    jsonApiRoutes({
      runtime,
      actor: (c) => {
        if (c.req.header('X-Actor') !== 'smoke') {
          throw jsonApiError('UNAUTHORIZED', {
            detail: 'The request names no actor',
          });
        }
        return { id: 'smoke', can: () => false };
      },
    }),
  );
  return app;
}

export const routeChecks: Checks = {
  'hono-resource answers a declared resource at the path its links name':
    async () => {
      const response = await host().request('/api/organizations/1', {
        headers: { 'X-Actor': 'smoke' },
      });
      check(response.status === 200, `status ${String(response.status)}`);
      const text = await response.text();
      check(
        text.includes('"self":"/api/organizations/1"') &&
          text.includes('"name":"Acme"'),
        text,
      );
    },
  'hono-resource answers another method with 405 and Allow': async () => {
    const response = await host().request('/api/organizations/1', {
      method: 'DELETE',
      headers: { 'X-Actor': 'smoke' },
    });
    check(response.status === 405, `status ${String(response.status)}`);
    const allow = response.headers.get('Allow');
    check(allow === 'GET, HEAD, PATCH', `Allow ${String(allow)}`);
  },
  'hono-resource answers what the actor threw': async () => {
    const response = await host().request('/api/organizations/1');
    check(response.status === 401, `status ${String(response.status)}`);
  },
  'hono-resource answers a relationship link with its linkage': async () => {
    const response = await host().request(
      '/api/contacts/7/relationships/organization',
      { headers: { 'X-Actor': 'smoke' } },
    );
    check(response.status === 200, `status ${String(response.status)}`);
    const text = await response.text();
    check(
      text.includes('"related":"/api/contacts/7/organization"') &&
        text.includes('"data":{"type":"organizations","id":"1"}'),
      text,
    );
  },
  'hono-resource answers an update the relationship does not support with 403':
    async () => {
      const response = await host().request(
        '/api/contacts/7/relationships/organization',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/vnd.api+json' },
          body: JSON.stringify({ data: null }),
        },
      );
      check(response.status === 403, `status ${String(response.status)}`);
    },
  "hono-resource answers a related link with the target's document":
    async () => {
      const response = await host().request('/api/contacts/7/organization', {
        headers: { 'X-Actor': 'smoke' },
      });
      check(response.status === 200, `status ${String(response.status)}`);
      const text = await response.text();
      check(
        text.includes('"self":"/api/organizations/1"') &&
          text.includes('"name":"Acme"'),
        text,
      );
    },
};
