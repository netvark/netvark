/**
 * `resourceTypeOf(c)` (resource SPEC 19.6): the type of the resource the
 * request's route serves, which `localizeErrors` takes to label the
 * members an error points at. A collection, resource, or relationship
 * route serves its resource's type, a related route its target's, and
 * the operations endpoint the type of the operation that failed. A
 * request no route of `jsonApiRoutes` served has none.
 * @ref https://hono.dev/docs/guides/middleware
 * @packageDocumentation
 */
import type { Context, MiddlewareHandler } from 'hono';

const served = new WeakMap<Context, string>();

/**
 * The type of the resource the request of `c` addresses, or `undefined`,
 * for `localizeErrors(messages, { resource: resourceTypeOf })`.
 */
export function resourceTypeOf(c: Context): string | undefined {
  return served.get(c);
}

/** Records that the request of `c` addresses `type`. */
export function noteType(c: Context, type: string): void {
  served.set(c, type);
}

/** The first middleware of a route that serves `type`, so every error the route throws has it. */
export function servesType(type: string): MiddlewareHandler {
  return async (c, next) => {
    served.set(c, type);
    await next();
  };
}
