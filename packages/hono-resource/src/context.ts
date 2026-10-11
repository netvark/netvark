/**
 * What every route reads (resource SPEC 19.3): the runtime, the actor of
 * the request, the methods each path answers, and each resource's
 * includable relationships with the runtime's resource of their target;
 * and, for a request, a resource's operations as its actor runs them and
 * the rows each include adds.
 * @ref https://jsonapi.org/format/1.1/#fetching-includes
 * @packageDocumentation
 */
import type { Context, Env, Hono } from 'hono';

import type { Included, ParsedQuery } from '@netvark/hono-jsonapi';
import type { DeclaredResource } from '@netvark/resource-core';
import type {
  DomainShape,
  PublicRow,
  ResourceOperations,
  ResourceRuntime,
} from '@netvark/resource-core/server';

import type { Actors } from './actor';
import type { MethodTable } from './methods';

import { include } from '@netvark/hono-jsonapi';

/** What the routes of one `jsonApiRoutes` share. */
export interface RouteContext<TEnv extends Env, TDomain extends DomainShape> {
  readonly app: Hono<TEnv>;
  readonly runtime: ResourceRuntime<TDomain>;
  readonly actors: Actors<TEnv, TDomain['actor']>;
  readonly methods: MethodTable;
  /** By type, each includable relationship's target: the runtime's resource of its type. */
  readonly targets: ReadonlyMap<string, ReadonlyMap<string, DeclaredResource>>;
}

/** The error of a runtime that lacks an operation `declared` declares, which breaks the contract. */
export function notRun(declared: DeclaredResource, name: string): TypeError {
  return new TypeError(
    `jsonApiRoutes: the runtime runs no ${name} of ${declared.names.type}, which its declaration declares`,
  );
}

/** `declared`'s operations as the actor of the request of `c` runs them. */
export function operationsOf<TEnv extends Env, TDomain extends DomainShape>(
  context: RouteContext<TEnv, TDomain>,
  c: Context,
  declared: DeclaredResource,
): ResourceOperations {
  const operations = context.runtime.as(context.actors.of(c))[
    declared.names.type
  ];
  if (operations === undefined) {
    throw new TypeError(
      `jsonApiRoutes: the runtime's domain has no ${declared.names.type}, which it lists in resources`,
    );
  }
  return operations;
}

/**
 * The included resources of `rows`, one entry per include path, each the
 * rows `declared`'s `include` links them to over its relationship. Every
 * path `parseQuery` accepted names one includable relationship.
 */
export async function includedOf<TEnv extends Env, TDomain extends DomainShape>(
  context: RouteContext<TEnv, TDomain>,
  operations: ResourceOperations,
  declared: DeclaredResource,
  rows: ReadonlyArray<PublicRow>,
  query: ParsedQuery,
): Promise<Array<Included>> {
  const included: Array<Included> = [];
  for (const [name] of query.include ?? []) {
    const target =
      name === undefined
        ? undefined
        : context.targets.get(declared.names.type)?.get(name);
    if (name === undefined || target === undefined) {
      throw new TypeError(
        `jsonApiRoutes: ${declared.names.type} accepted an include it has no target for`,
      );
    }
    if (operations.include === undefined) {
      throw notRun(declared, 'include');
    }
    included.push(
      include(target.resource, await operations.include(name, rows)),
    );
  }
  return included;
}

/**
 * By type, each includable relationship's target among `resources`.
 * Throws `TypeError` for a target the runtime does not run.
 */
export function includeTargets(
  resources: ReadonlyArray<DeclaredResource>,
): ReadonlyMap<string, ReadonlyMap<string, DeclaredResource>> {
  const byType = new Map(
    resources.map((declared) => [declared.names.type, declared] as const),
  );
  return new Map(
    resources.map((declared) => {
      const { relationships, query } = declared.resource;
      const targets = query.include.map((name) => {
        const type = Object.hasOwn(relationships, name)
          ? relationships[name]?.type
          : undefined;
        const target = type === undefined ? undefined : byType.get(type);
        if (target === undefined) {
          throw new TypeError(
            `jsonApiRoutes: ${declared.names.type}: relationship ${name} is includable, but the runtime runs no resource of its target ${String(type)}`,
          );
        }
        return [name, target] as const;
      });
      return [declared.names.type, new Map(targets)] as const;
    }),
  );
}
