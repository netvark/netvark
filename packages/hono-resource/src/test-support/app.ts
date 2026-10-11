/**
 * A host of the routes, composed as an application composes one
 * (resource SPEC 19.2): `jsonApi()` with the Cursor Pagination profile,
 * the error and not-found handlers of `@netvark/hono-jsonapi`, and the
 * routes at `/`, each request acting as the member its `X-Member` header
 * names; a request that names none answers UNAUTHORIZED. Not published
 * with the package.
 */
import type { Context, ErrorHandler } from 'hono';

import type { JsonApiVariables } from '@netvark/hono-jsonapi';
import type { ResourceRuntime } from '@netvark/resource-core/server';

import type { Member, TestDomain } from './memory-runtime';

import { Hono } from 'hono';

import {
  CURSOR_PAGINATION_PROFILE,
  errorHandler,
  jsonApi,
  jsonApiError,
  notFoundHandler,
} from '@netvark/hono-jsonapi';

import { jsonApiRoutes } from '../routes';
import { member } from './memory-runtime';

/** The host's `Env`: `jsonApi()`'s variables. */
export interface TestEnv {
  readonly Variables: JsonApiVariables;
}

/** The members a request may name: ada and grace in workspace 1, alan in 2. */
const MEMBERS: ReadonlyMap<string, Member> = new Map([
  ['ada', member('ada', '1', ['tasks:read', 'tasks:write', 'workspaces:read'])],
  ['grace', member('grace', '1', ['tasks:read'])],
  [
    'alan',
    member('alan', '2', ['tasks:read', 'tasks:write', 'workspaces:read']),
  ],
]);

/** The member the request's `X-Member` header names. */
export function memberOf(c: Context<TestEnv>): Member {
  const found = MEMBERS.get(c.req.header('X-Member') ?? '');
  if (found === undefined) {
    throw jsonApiError('UNAUTHORIZED', {
      detail: 'The request names no member',
    });
  }
  return found;
}

/** What a test overrides: the actor, and a hook that sees each error before the handler renders it. */
export interface TestAppOptions {
  readonly actor?:
    | ((c: Context<TestEnv>) => Member | Promise<Member>)
    | undefined;
  readonly onError?: ((error: Error) => void) | undefined;
}

/** The host over `runtime`. */
export function testApp(
  runtime: ResourceRuntime<TestDomain>,
  options: TestAppOptions = {},
): Hono<TestEnv> {
  const app = new Hono<TestEnv>();
  const handle: ErrorHandler<TestEnv> = errorHandler();
  app.use(jsonApi({ profiles: [CURSOR_PAGINATION_PROFILE] }));
  app.onError(async (error, c) => {
    options.onError?.(error);
    return handle(error, c);
  });
  app.notFound(notFoundHandler());
  app.route('/', jsonApiRoutes({ runtime, actor: options.actor ?? memberOf }));
  return app;
}
