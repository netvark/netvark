/**
 * The request's actor (resource SPEC 19.2): `options.actor` runs once per
 * request, as the first middleware of its route, before the query or the
 * document is read, so a request it refuses answers that refusal whatever
 * else is wrong with it, and a client without a session learns nothing
 * about the resource from a 400. What it throws is the response.
 * @ref https://hono.dev/docs/guides/middleware
 * @packageDocumentation
 */
import type { Context, Env, MiddlewareHandler } from 'hono';

/** What resolves the actor of a request: `options.actor`. */
export type ActorOf<TEnv extends Env, TActor> = (
  c: Context<TEnv>,
) => TActor | Promise<TActor>;

/** The actor of each request, resolved once. */
export interface Actors<TEnv extends Env, TActor> {
  /** Resolves the actor; the first middleware of every route that runs an operation. */
  readonly resolve: MiddlewareHandler<TEnv>;
  /**
   * What `resolve` resolved for the request of `c`, which a route's
   * handler holds with its validators' types.
   */
  readonly of: (c: Context) => TActor;
}

/** The actors `actor` resolves, one per request, held by the request's context. */
export function actors<TEnv extends Env, TActor>(
  actor: ActorOf<TEnv, TActor>,
): Actors<TEnv, TActor> {
  const resolved = new WeakMap<Context, { readonly actor: TActor }>();
  return {
    resolve: async (c, next) => {
      resolved.set(c, { actor: await actor(c) });
      await next();
    },
    of: (c) => {
      const entry = resolved.get(c);
      if (entry === undefined) {
        throw new TypeError(
          'jsonApiRoutes: a route ran an operation before it resolved the actor',
        );
      }
      return entry.actor;
    },
  };
}
