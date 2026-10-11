/**
 * The case of obligation 8 (SPEC 12.8): `count` and the insert after it
 * are atomic per quota and scope value. A transaction counts, a second
 * transaction of the same workspace starts and counts, and the first
 * inserts and commits only after the second had time to reach its count:
 * the second must count the first's row. On a server, the second count
 * must wait for the lock the first holds, such as a transaction-scoped
 * advisory lock.
 * @ref https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS
 * @packageDocumentation
 */
import type { Contract } from './context';
import type { ContractCase } from './types';

import { assertEqual } from './assert';
import { overlap, settled } from './concurrency';
import { taskCreate } from './context';

/** The case of obligation 8. */
export function quotaCases<TTransaction>(
  contract: Contract<TTransaction>,
): ReadonlyArray<ContractCase> {
  const { harness, tasks, within } = contract;
  const { adapter } = harness;
  const workspace1 = async <TResult>(
    run: (tx: TTransaction) => Promise<TResult>,
  ): Promise<TResult> => within('1', run);
  return [
    {
      name: 'obligation 8: count and the following insert are atomic per quota and scope value',
      run: async () => {
        await contract.createTask('1', { attributes: { title: 'Existing' } });
        const { first, second } = await overlap(workspace1, {
          hold: async (tx) => adapter.count(tx, tasks, 'tasks'),
          second: async (tx) => adapter.count(tx, tasks, 'tasks'),
          release: async (tx) => {
            await adapter.create(
              tx,
              tasks,
              taskCreate({ attributes: { title: 'Last slot' } }),
            );
          },
        });
        assertEqual(settled(first), 1, 'the first count');
        assertEqual(
          settled(second),
          2,
          'the count of a transaction that started while the first held the quota',
        );
      },
    },
  ];
}
