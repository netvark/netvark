/**
 * What every operation runs in (SPEC 12.3, 18.4, 18.5): one transaction
 * of the storage, with every scope the actor has, for an unscoped
 * resource too, since a policy on its table may read them. What the
 * transaction rejects with becomes the client's error once it has ended
 * (`operationFailure`), and the events it recorded go to `afterCommit`
 * once it has committed.
 * @packageDocumentation
 */
import type { Operation } from '@netvark/resource-core';
import type {
  DomainEvent,
  DomainShape,
  ResourceBehavior,
} from '@netvark/resource-core/server';

import type { StorageConfig } from '../storage/options';
import type { KyselyTransaction } from '../storage/transaction';
import type { DomainOptions } from './types';

import { scopeValues } from '@netvark/resource-core/server';

import { afterCommit } from './events';
import { operationFailure } from './failure';

/** What the operations of `as(actor)` run with. */
export interface Run<TDomain extends DomainShape> {
  readonly options: DomainOptions<TDomain>;
  /** The options the storage was made with, for the adapter's statements beyond the contract. */
  readonly config: StorageConfig;
  readonly actor: TDomain['actor'];
}

/** The work of one operation: it pushes the events it records onto `recorded`. */
export type Work<TResult> = (
  tx: KyselyTransaction,
  recorded: Array<DomainEvent>,
) => Promise<TResult>;

/** Runs `work` in one transaction scoped to the actor; rejects with the client's error of what it threw. */
async function scoped<TDomain extends DomainShape, TResult>(
  run: Run<TDomain>,
  behavior: ResourceBehavior<TDomain>,
  operation: Operation,
  work: (tx: KyselyTransaction) => Promise<TResult>,
): Promise<TResult> {
  const { storage, scopes, errors } = run.options;
  const values = scopeValues(scopes, run.actor);
  try {
    return await storage.transaction(values, work);
  } catch (thrown) {
    throw await operationFailure(thrown, {
      storage,
      resource: behavior.resource,
      operation,
      errors,
    });
  }
}

/** Runs `work` as `operation` on `behavior`'s resource; once committed, hands what it recorded to `afterCommit`. */
export async function transact<TDomain extends DomainShape, TResult>(
  run: Run<TDomain>,
  behavior: ResourceBehavior<TDomain>,
  operation: Operation,
  work: Work<TResult>,
): Promise<TResult> {
  const recorded: Array<DomainEvent> = [];
  const result = await scoped(run, behavior, operation, async (tx) =>
    work(tx, recorded),
  );
  await afterCommit(run.options, recorded);
  return result;
}
