/**
 * The domain (SPEC 18.4): for an actor, one set of operations per
 * resource, keyed by its type, holding the operations its declaration
 * declares (SPEC 3.3), and `include` when it declares an includable
 * relationship. Each operation runs the lifecycle of SPEC 12.3 in one
 * transaction of the storage, scoped to every scope the actor has, so a
 * worker's call and a request take the same path.
 * @packageDocumentation
 */
import type { Operation } from '@netvark/resource-core';
import type {
  DomainShape,
  ResourceBehavior,
} from '@netvark/resource-core/server';

import type { Run } from './operation';
import type { ResourceOperations } from './operations-types';
import type { DomainOptions } from './types';

import { storageConfigOf } from '../storage/registry';
import { getRow, includeRows, listRows } from './reads';
import { createRow, removeRow, updateRow } from './writes';

type Operations = {
  -readonly [K in keyof ResourceOperations]: ResourceOperations[K];
};

/** Each declared operation of `behavior`, run as the actor of `run`. */
function operationsOf<TDomain extends DomainShape>(
  run: Run<TDomain>,
  behavior: ResourceBehavior<TDomain>,
): ResourceOperations {
  const { declaration } = behavior.resource;
  const declared: ReadonlySet<Operation> = new Set(declaration.operations);
  const operations: Operations = {};
  if (declared.has('list')) {
    operations.list = async (request, options) =>
      listRows(run, behavior, request, options);
  }
  if (declared.has('get')) {
    operations.get = async (id) => getRow(run, behavior, id);
  }
  if (declared.has('create')) {
    operations.create = async (input) => createRow(run, behavior, input);
  }
  if (declared.has('update')) {
    operations.update = async (id, input) =>
      updateRow(run, behavior, id, input);
  }
  if (declared.has('remove')) {
    operations.remove = async (id) => removeRow(run, behavior, id);
  }
  const includable = Object.values(declaration.relationships ?? {}).some(
    (relationship) => relationship.include === true,
  );
  if (includable) {
    operations.include = async (relationship, rows) =>
      includeRows(run, behavior, relationship, rows);
  }
  return Object.freeze(operations);
}

/**
 * The domain of `options`: `as(actor)` gives each resource's operations as
 * `actor` runs them. Throws `TypeError` for a storage `createKyselyStorage`
 * did not make.
 */
export function createDomain<TDomain extends DomainShape>(
  options: DomainOptions<TDomain>,
): (actor: TDomain['actor']) => Readonly<Record<string, ResourceOperations>> {
  const config = storageConfigOf(options.storage);
  if (config === undefined) {
    throw new TypeError(
      'createResourceRuntime: options.storage must come from createKyselyStorage',
    );
  }
  return (actor) => {
    const run: Run<TDomain> = { options, config, actor };
    return Object.freeze(
      Object.fromEntries(
        Object.entries(options.resources).map(([type, behavior]) => [
          type,
          operationsOf(run, behavior),
        ]),
      ),
    );
  };
}
