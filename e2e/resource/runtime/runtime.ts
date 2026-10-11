/**
 * A minimal runtime over `@netvark/resource-core/server` (resource SPEC
 * 12.3), the composition `@netvark/kysely-resource` will ship. An
 * operation validates its input with the declaration, then runs in one
 * transaction scoped to the actor: the policy, the rules, the quota, the
 * write, and the effects, whose events the adapter records with the
 * write, so any failure rolls back everything. An update and a remove
 * read their row with `lock`, so the row the policy and the rules decide
 * on is the row the write changes. A rule's `Rejection` becomes its
 * code's error, a PostgreSQL integrity violation the declared code
 * `constraintError` finds, a partition's through the adapter's
 * `partitionRoot` (`failure.ts`), and a row the actor cannot see
 * `NOT_FOUND`, built as a denied `get` builds it.
 */
import type { ResourceIssue } from '@netvark/resource-core';
import type {
  DomainEvent,
  Effect,
  PublicRow,
  ResourceBehavior,
  StorageAdapter,
  StorageWrite,
} from '@netvark/resource-core/server';

import type { AppActor, AppDomain, Services } from './domain.ts';

import { BanError, BUILTIN_CATALOG, createBan } from '@netvark/ban-core';
import { ERROR_CATALOG } from '@netvark/jsonapi-core';
import {
  quotaExceeded,
  reject,
  scopeValues,
} from '@netvark/resource-core/server';

import { QUOTAS, SCOPES } from './domain.ts';
import { failure } from './failure.ts';

/** Any resource's behavior in the domain. */
type Behavior = ResourceBehavior<AppDomain>;

/** A create or an update as `@netvark/jsonapi-core` parses a resource object: each relationship as its `data`. */
export interface ResourceInput {
  readonly id?: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly relationships: Readonly<Record<string, unknown>>;
}

/** The operations, each run as `actor`. */
export interface Runtime {
  readonly create: (
    actor: AppActor,
    behavior: Behavior,
    input: ResourceInput,
  ) => Promise<PublicRow>;
  readonly get: (
    actor: AppActor,
    behavior: Behavior,
    id: string,
  ) => Promise<PublicRow>;
  readonly update: (
    actor: AppActor,
    behavior: Behavior,
    id: string,
    input: ResourceInput,
  ) => Promise<PublicRow>;
  readonly remove: (
    actor: AppActor,
    behavior: Behavior,
    id: string,
  ) => Promise<void>;
}

type Writing = 'create' | 'update' | 'remove';

const ban = createBan({ errors: ERROR_CATALOG });

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The error of a missing row, which a denied `get`, `update`, or `remove` also is. */
function notFound(): BanError {
  return new BanError({ ...BUILTIN_CATALOG.NOT_FOUND, code: 'NOT_FOUND' });
}

function invalid(issues: ReadonlyArray<ResourceIssue>): BanError {
  return ban.error('VALIDATION_FAILED', {
    errors: issues.map((issue) => ({
      detail: issue.message,
      path: ['data', ...issue.path],
      reason: issue.code,
    })),
  });
}

/** A relationship's parsed `data` as its target's id, or `null`. */
function targetId(linkage: unknown): string | null {
  const id = isRecord(linkage) ? linkage['id'] : null;
  if (typeof id !== 'string' && id !== null) {
    throw new TypeError('a validated relationship has no id');
  }
  return id;
}

/** The members a validated write carried, relationships as target ids (SPEC 12.8). */
function storageWrite(value: unknown, id: string | undefined): StorageWrite {
  const attributes = isRecord(value) ? value['attributes'] : undefined;
  const relationships = isRecord(value) ? value['relationships'] : undefined;
  if (!isRecord(attributes) || !isRecord(relationships)) {
    throw new TypeError('a validated write has no attributes or relationships');
  }
  return {
    ...(id === undefined ? {} : { id }),
    attributes,
    relationships: Object.fromEntries(
      Object.entries(relationships).map(([name, linkage]) => [
        name,
        targetId(linkage),
      ]),
    ),
  };
}

/** The input as the declaration parses it; `VALIDATION_FAILED` with an item per issue otherwise. */
function parsed(
  behavior: Behavior,
  write: 'create' | 'update',
  input: ResourceInput,
): StorageWrite {
  const result = behavior.resource.write[write]['~standard'].validate({
    attributes: input.attributes,
    relationships: input.relationships,
  });
  if (result.issues !== undefined) {
    throw invalid(result.issues);
  }
  return storageWrite(result.value, write === 'create' ? input.id : undefined);
}

/** The runtime over `adapter`, handing `services` to policies, rules, effects, and quotas. */
export function createRuntime<TTransaction>(
  adapter: StorageAdapter<TTransaction>,
  services: Services,
): Runtime {
  const scoped = async <TResult>(
    actor: AppActor,
    behavior: Behavior,
    operation: Writing | 'get',
    run: (tx: TTransaction) => Promise<TResult>,
  ): Promise<TResult> => {
    try {
      return await adapter.transaction(scopeValues(SCOPES, actor), run);
    } catch (error) {
      throw await failure(adapter, error, behavior.resource, operation);
    }
  };
  /** Runs the effects in order and records their events with the write. */
  const record = async <TContext>(
    tx: TTransaction,
    effects: ReadonlyArray<Effect<TContext>> | undefined,
    context: TContext,
  ): Promise<void> => {
    const events: Array<DomainEvent> = [];
    for (const effect of effects ?? []) {
      events.push(...(await effect(context)));
    }
    await adapter.record(tx, events);
  };
  const checkQuota = async (
    tx: TTransaction,
    actor: AppActor,
    behavior: Behavior,
    quota: keyof typeof QUOTAS,
  ): Promise<void> => {
    const limit = await QUOTAS[quota].limit({ actor, services });
    const count = await adapter.count(tx, behavior.resource, quota);
    const exceeded = quotaExceeded(count, limit);
    if (exceeded !== undefined) {
      throw exceeded;
    }
  };
  const locked = async (
    tx: TTransaction,
    behavior: Behavior,
    id: string,
    write: 'update' | 'remove',
  ): Promise<PublicRow> => {
    const row = await adapter.lock(tx, behavior.resource, id, write);
    if (row === undefined) {
      throw notFound();
    }
    return row;
  };

  return {
    create: async (actor, behavior, request) => {
      const input = parsed(behavior, 'create', request);
      const create = behavior.operations.create;
      return scoped(actor, behavior, 'create', async (tx) => {
        await behavior.policy.authorize('create', { actor, services, input });
        for (const rule of create?.rules ?? []) {
          await rule({ actor, services, reject, input });
        }
        if (create?.quota !== undefined) {
          await checkQuota(tx, actor, behavior, create.quota);
        }
        const values = create?.values?.({ actor, services, input });
        const row = await adapter.create(tx, behavior.resource, {
          ...input,
          ...(values === undefined ? {} : { values }),
        });
        const context = { actor, services, input, row };
        await record(tx, create?.effects, context);
        return row;
      });
    },
    get: async (actor, behavior, id) =>
      scoped(actor, behavior, 'get', async (tx) => {
        const row = await adapter.get(tx, behavior.resource, id);
        if (row === undefined) {
          throw notFound();
        }
        await behavior.policy.authorize('get', { actor, services, row });
        return row;
      }),
    update: async (actor, behavior, id, request) => {
      const input = parsed(behavior, 'update', request);
      const update = behavior.operations.update;
      return scoped(actor, behavior, 'update', async (tx) => {
        const previous = await locked(tx, behavior, id, 'update');
        const context = { actor, services, input, row: previous };
        await behavior.policy.authorize('update', context);
        for (const rule of update?.rules ?? []) {
          await rule({ ...context, reject });
        }
        const row = await adapter.update(tx, behavior.resource, id, input);
        if (row === undefined) {
          throw notFound();
        }
        const changed = { actor, services, input, row, previous };
        await record(tx, update?.effects, changed);
        return row;
      });
    },
    remove: async (actor, behavior, id) => {
      const remove = behavior.operations.remove;
      await scoped(actor, behavior, 'remove', async (tx) => {
        const row = await locked(tx, behavior, id, 'remove');
        const context = { actor, services, row };
        await behavior.policy.authorize('remove', context);
        for (const rule of remove?.rules ?? []) {
          await rule({ ...context, reject });
        }
        if (!(await adapter.remove(tx, behavior.resource, id))) {
          throw notFound();
        }
        await record(tx, remove?.effects, context);
      });
    },
  };
}
