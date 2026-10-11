/**
 * The contacts application's HTTP API (resource SPEC 12.3, 13.1), as
 * `@netvark/hono-resource` will mount it: Hono with `@netvark/hono-jsonapi`
 * for negotiation, the request validators, `respond`, and the error
 * handler, and the runtime behind each declared operation of contacts and
 * calls. The `X-Actor` header names the member a request acts as, in
 * place of the application's authentication, which answers `UNAUTHORIZED`
 * without a member it knows. Every response is built by the published
 * packages, so the OpenAPI tests hold the document against what a host
 * answers.
 * @ref https://jsonapi.org/format/1.1/#crud
 * @ref https://jsonapi.org/format/1.1/#fetching-includes
 */
import type { Context } from 'hono';

import type {
  Included,
  JsonApiVariables,
  ParsedQuery,
} from '@netvark/hono-jsonapi';
import type { DeclaredResource } from '@netvark/resource-core';
import type { PublicRow } from '@netvark/resource-core/server';

import type { AppActor } from './domain.ts';
import type { Behavior } from './input.ts';
import type { Runtime } from './runtime.ts';

import { Hono } from 'hono';

import {
  bodyValidator,
  CURSOR_PAGINATION_PROFILE,
  errorHandler,
  include,
  invalidCursor,
  jsonApi,
  jsonApiError,
  notFoundHandler,
  paginatedDocument,
  queryValidator,
  resourceDocument,
  respond,
} from '@netvark/hono-jsonapi';
import {
  InvalidCursorError,
  InvalidFilterValueError,
} from '@netvark/keyset-core';
import { keysetRequest } from '@netvark/resource-core/server';

import { Calls } from '../resources/calls.ts';
import { Contacts } from '../resources/contacts.ts';
import { Meetings } from '../resources/meetings.ts';
import { Notes } from '../resources/notes.ts';
import { Organizations } from '../resources/organizations.ts';
import { CallsBehavior, ContactsBehavior } from './domain.ts';
import { editor, globex, manager, stranger, viewer } from './fixture.ts';

/** The application's registry: every resource its document lists, each linked under `/api`. */
export const APP_RESOURCES: ReadonlyArray<DeclaredResource> = [
  Organizations,
  Contacts,
  Meetings,
  Notes,
  Calls,
];

/** The application's `Env`: `jsonApi()`'s variables and the request's member. */
export interface AppEnv {
  readonly Variables: JsonApiVariables & { readonly actor: AppActor };
}

const CREATED = 201;
const NO_CONTENT = 204;
const ACTORS: ReadonlyMap<string, AppActor> = new Map([
  ['editor', editor],
  ['viewer', viewer],
  ['stranger', stranger],
  ['manager', manager],
  ['globex', globex],
]);
const BY_TYPE: ReadonlyMap<string, DeclaredResource> = new Map(
  APP_RESOURCES.map((resource) => [resource.names.type, resource]),
);

/** The member an `X-Actor` header names; `UNAUTHORIZED` for any other value. */
function actorOf(header: string | undefined): AppActor {
  const actor = ACTORS.get(header ?? '');
  if (actor === undefined) {
    throw jsonApiError('UNAUTHORIZED', {
      detail: 'The request names no member.',
    });
  }
  return actor;
}

/**
 * A refusal of the keyset plan as the request's error (keyset DESIGN 3.6):
 * a cursor the engine cannot read, and a filter value outside its field's
 * type, which `parseQuery` leaves to the engine (resource SPEC 11.2), are
 * `INVALID_QUERY_PARAMETER` at their parameter. `parseQuery` has refused
 * every other request keyset-core would, so anything else stays thrown.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#errors
 */
function planRefusal(error: unknown): unknown {
  if (error instanceof InvalidCursorError) {
    return invalidCursor(`page[${error.parameter}]`);
  }
  if (error instanceof InvalidFilterValueError) {
    return jsonApiError('INVALID_QUERY_PARAMETER', {
      detail: 'The filter value is not valid for its field.',
      source: { parameter: `filter[${error.field}][${error.operator}]` },
    });
  }
  return error;
}

/** The `:id` Hono matched on a member route. */
function memberId(c: Context<AppEnv>): string {
  const id = c.req.param('id');
  if (id === undefined) {
    throw new TypeError('a member route has an id');
  }
  return id;
}

/**
 * The rows each requested relationship links `rows` to. Only a declared
 * resource's own relationships are includable, so every path `parseQuery`
 * accepted here has one segment.
 */
async function included(
  runtime: Runtime,
  c: Context<AppEnv>,
  behavior: Behavior,
  rows: ReadonlyArray<PublicRow>,
  query: ParsedQuery,
): Promise<Array<Included>> {
  const out: Array<Included> = [];
  for (const [relationship] of query.include ?? []) {
    const definition =
      relationship === undefined
        ? undefined
        : behavior.resource.resource.relationships[relationship];
    const target =
      definition === undefined ? undefined : BY_TYPE.get(definition.type);
    if (relationship === undefined || target === undefined) {
      throw new TypeError('an accepted include names no listed resource');
    }
    const linked = await runtime.include(
      c.get('actor'),
      behavior,
      relationship,
      target,
      rows,
    );
    out.push(include(target.resource, linked));
  }
  return out;
}

/** The routes of `behavior`'s declared operations, at `/api/<type>`. */
function mount(app: Hono<AppEnv>, runtime: Runtime, behavior: Behavior): void {
  const declared = behavior.resource;
  const { resource } = declared;
  const operations: ReadonlySet<string> = new Set(
    declared.declaration.operations,
  );
  const collection = `/api/${resource.type}`;
  const member = `${collection}/:id`;
  if (operations.has('list')) {
    app.get(collection, queryValidator(resource), async (c) => {
      const query = c.req.valid('query');
      const request = keysetRequest(declared, query);
      const page = await runtime
        .list(c.get('actor'), behavior, request)
        .catch((error: unknown) => {
          throw planRefusal(error);
        });
      const linked = await included(runtime, c, behavior, page.rows, query);
      return respond(
        c,
        paginatedDocument(resource, page, {
          url: c.req.url,
          query,
          included: linked,
        }),
      );
    });
  }
  if (operations.has('create')) {
    const body = bodyValidator(resource, { operation: 'create' });
    app.post(collection, body, async (c) => {
      const row = await runtime.create(
        c.get('actor'),
        behavior,
        c.req.valid('json'),
      );
      return respond(c, resourceDocument(resource, row), CREATED);
    });
  }
  if (operations.has('get')) {
    app.get(member, queryValidator(resource), async (c) => {
      const query = c.req.valid('query');
      const row = await runtime.get(c.get('actor'), behavior, memberId(c));
      const linked = await included(runtime, c, behavior, [row], query);
      return respond(
        c,
        resourceDocument(resource, row, { query, included: linked }),
      );
    });
  }
  if (operations.has('update')) {
    const body = bodyValidator(resource, { operation: 'update' });
    app.patch(member, body, async (c) => {
      const row = await runtime.update(
        c.get('actor'),
        behavior,
        memberId(c),
        c.req.valid('json'),
      );
      return respond(c, resourceDocument(resource, row));
    });
  }
  if (operations.has('remove')) {
    app.delete(member, async (c) => {
      await runtime.remove(c.get('actor'), behavior, memberId(c));
      return c.body(null, NO_CONTENT);
    });
  }
}

/** The API over `runtime`: negotiation first, then the member, then the routes. */
export function createApi(runtime: Runtime): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use(jsonApi({ profiles: [CURSOR_PAGINATION_PROFILE] }));
  app.use('/api/*', async (c, next) => {
    c.set('actor', actorOf(c.req.header('X-Actor')));
    await next();
  });
  app.onError(errorHandler());
  app.notFound(notFoundHandler());
  for (const behavior of [ContactsBehavior, CallsBehavior]) {
    mount(app, runtime, behavior);
  }
  return app;
}
