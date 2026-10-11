/**
 * `jsonApiRoutes(options)` (resource SPEC 19.2): the routes of a runtime
 * of the contract (SPEC 12.10) on Hono, at the full paths each resource's
 * links name, for the host to mount at `/` behind `jsonApi()`, its error
 * handler, and `notFound`. A route maps a request to an operation's input
 * and its result to a document: `@netvark/hono-jsonapi` negotiates,
 * validates, and builds documents, the runtime authorizes and runs, and
 * the host's ban renders every error.
 * @ref https://jsonapi.org/format/1.1/
 * @ref https://hono.dev/docs/api/routing#grouping
 * @packageDocumentation
 */
import type { Env } from 'hono';

import type {
  DomainShape,
  ResourceRuntime,
} from '@netvark/resource-core/server';

import type { ActorOf } from './actor';
import type { RouteContext } from './context';

import { Hono } from 'hono';

import { actors } from './actor';
import { collectionRoutes } from './collection';
import { includeTargets } from './context';
import { memberRoutes } from './member';
import { refuseOtherMethods } from './methods';
import { planPaths } from './paths';

/** What `jsonApiRoutes` takes. */
export interface JsonApiRoutesOptions<
  TEnv extends Env,
  TDomain extends DomainShape,
> {
  /** A runtime of the contract, such as `createResourceRuntime` resolves to; its `resources` are what the routes serve. */
  readonly runtime: ResourceRuntime<TDomain>;
  /**
   * The actor a request runs as. It runs once per request, before the
   * query or the document is read; what it throws, such as
   * `UNAUTHORIZED`, is the response.
   */
  readonly actor: ActorOf<TEnv, TDomain['actor']>;
}

const OPTIONS: ReadonlySet<string> = new Set(['runtime', 'actor']);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/** Throws `TypeError` for options a JavaScript caller got wrong. */
function checkOptions(options: unknown): void {
  if (!isRecord(options)) {
    throw new TypeError('jsonApiRoutes: options must be an object');
  }
  for (const key of Object.keys(options)) {
    if (!OPTIONS.has(key)) {
      throw new TypeError(`jsonApiRoutes: options.${key} is not an option`);
    }
  }
  const { runtime, actor } = options;
  if (
    !isRecord(runtime) ||
    !Array.isArray(runtime['resources']) ||
    typeof runtime['as'] !== 'function'
  ) {
    throw new TypeError(
      'jsonApiRoutes: options.runtime must be a runtime of the contract, such as createResourceRuntime resolves to',
    );
  }
  if (typeof actor !== 'function') {
    throw new TypeError(
      'jsonApiRoutes: options.actor must be a function from the request to its actor',
    );
  }
}

/**
 * The routes of `options.runtime`'s resources. Throws `TypeError` before
 * it serves anything when the runtime runs no resource, when a resource's
 * links give no paths, when the links have different origins or bases,
 * when two resources name one path, or when an includable relationship's
 * target is not among the runtime's resources.
 */
export function jsonApiRoutes<TEnv extends Env, TDomain extends DomainShape>(
  options: JsonApiRoutesOptions<TEnv, TDomain>,
): Hono<TEnv> {
  checkOptions(options);
  const { runtime } = options;
  const plan = planPaths(runtime.resources);
  const app = new Hono<TEnv>();
  const context: RouteContext<TEnv, TDomain> = {
    app,
    runtime,
    actors: actors(options.actor),
    methods: new Map(),
    targets: includeTargets(runtime.resources),
  };
  for (const mounted of plan.resources) {
    collectionRoutes(context, mounted);
    memberRoutes(context, mounted);
  }
  refuseOtherMethods(app, context.methods);
  return app;
}
