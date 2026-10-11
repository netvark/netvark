/**
 * A minimal runtime over `@netvark/resource-core/server` (resource SPEC
 * 12.3), the composition `@netvark/kysely-resource` will ship. A write
 * validates its input with the declaration (`input.ts`), then runs in one
 * transaction scoped to the actor: the policy, the rules, the quota, the
 * write, and the effects, whose events the adapter records with the
 * write, so any failure rolls back everything. An update and a remove
 * read their row with `lock`, so the row the policy and the rules decide
 * on is the row the write changes. A rule's `Rejection` becomes its
 * code's error, a PostgreSQL integrity violation the declared code
 * `constraintError` finds, a partition's through the adapter's
 * `partitionRoot` (`failure.ts`), and a row the actor cannot see
 * `NOT_FOUND`, built as a denied `get` builds it, as is an id outside the
 * key's form, refused before any query. A list asks the policy,
 * then pages with the keyset request `keysetRequest` maps; an include asks
 * the policy for the relationship, then reads each linked row in the
 * actor's scope, in a transaction of its own, where a host's would share
 * the list's or the get's.
 */
import type { DeclaredResource } from '@netvark/resource-core';
import type {
  DomainEvent,
  Effect,
  PublicRow,
  StorageAdapter,
  StorageListRequest,
  StoragePage,
} from '@netvark/resource-core/server';

import type { AppActor, Services } from './domain.ts';
import type { FailedOperation } from './failure.ts';
import type { Behavior, ResourceInput } from './input.ts';

import { BanError, BUILTIN_CATALOG } from '@netvark/ban-core';
import {
  quotaExceeded,
  reject,
  scopeValues,
} from '@netvark/resource-core/server';

import { QUOTAS, SCOPES } from './domain.ts';
import { failure } from './failure.ts';
import { parsed } from './input.ts';

/** The operations, each run as `actor`. */
export interface Runtime {
  readonly list: (
    actor: AppActor,
    behavior: Behavior,
    request: StorageListRequest,
  ) => Promise<StoragePage>;
  /** The rows of `target` that `rows` link to over `relationship`, once the policy allows including it. */
  readonly include: (
    actor: AppActor,
    behavior: Behavior,
    relationship: string,
    target: DeclaredResource,
    rows: ReadonlyArray<PublicRow>,
  ) => Promise<ReadonlyArray<PublicRow>>;
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

/** The error of a missing row, which a denied `get`, `update`, or `remove` also is. */
function notFound(): BanError {
  return new BanError({ ...BUILTIN_CATALOG.NOT_FOUND, code: 'NOT_FOUND' });
}

/**
 * Refuses an id outside the key's form as a missing row, without a query:
 * no row has it, and PostgreSQL would refuse the text or read another
 * spelling of a key as that key (resource SPEC 3.4, 12.3).
 */
function assertKnownId(behavior: Behavior, id: string): void {
  if (!behavior.resource.schema.id.safeParse(id).success) {
    throw notFound();
  }
}

/** The runtime over `adapter`, handing `services` to policies, rules, effects, and quotas. */
export function createRuntime<TTransaction>(
  adapter: StorageAdapter<TTransaction>,
  services: Services,
): Runtime {
  const scoped = async <TResult>(
    actor: AppActor,
    behavior: Behavior,
    operation: FailedOperation,
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
    list: async (actor, behavior, request) =>
      scoped(actor, behavior, 'list', async (tx) => {
        await behavior.policy.authorize('list', { actor, services });
        return adapter.list(tx, behavior.resource, request);
      }),
    include: async (actor, behavior, relationship, target, rows) => {
      await behavior.policy.authorizeInclude(relationship, { actor, services });
      const ids = new Set(
        rows
          .map((row) => row[relationship])
          .filter((id): id is string => typeof id === 'string'),
      );
      return scoped(actor, behavior, 'get', async (tx) => {
        const found: Array<PublicRow> = [];
        for (const id of ids) {
          const row = await adapter.get(tx, target, id);
          if (row !== undefined) {
            found.push(row);
          }
        }
        return found;
      });
    },
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
    get: async (actor, behavior, id) => {
      assertKnownId(behavior, id);
      return scoped(actor, behavior, 'get', async (tx) => {
        const row = await adapter.get(tx, behavior.resource, id);
        if (row === undefined) {
          throw notFound();
        }
        await behavior.policy.authorize('get', { actor, services, row });
        return row;
      });
    },
    update: async (actor, behavior, id, request) => {
      assertKnownId(behavior, id);
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
      assertKnownId(behavior, id);
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
