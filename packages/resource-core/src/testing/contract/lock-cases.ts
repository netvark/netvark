/**
 * The cases of obligation 10 (SPEC 12.8): the row `lock` returns stays as
 * the transaction read it until the transaction ends. A transaction locks
 * a task, a second transaction of the same workspace starts and writes,
 * and the first writes only after the second had time to reach the
 * database. Locked for an update, the task takes the second's update
 * after the first's. Locked for a remove, it takes no new reference: a
 * foreign key check takes `FOR KEY SHARE` on the row it references, which
 * `FOR UPDATE` blocks and `FOR NO KEY UPDATE` does not, so the second's
 * create finds the task removed.
 * @ref https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/ri_triggers.c (RI_FKey_check: "FOR KEY SHARE OF x")
 * @packageDocumentation
 */
import type { Contract } from './context';
import type { ContractCase } from './types';

import { constraintError } from '../../server/constraint-error';
import { assertEqual, assertThat } from './assert';
import { committed, overlap, settled } from './concurrency';
import { taskCreate, taskUpdate } from './context';

/** The cases of obligation 10. */
export function lockCases<TTransaction>(
  contract: Contract<TTransaction>,
): ReadonlyArray<ContractCase> {
  const { harness, tasks, within } = contract;
  const { adapter } = harness;
  const workspace1 = async <TResult>(
    run: (tx: TTransaction) => Promise<TResult>,
  ): Promise<TResult> => within('1', run);
  return [
    {
      name: 'obligation 10: a row locked for an update takes no other write until the transaction ends',
      run: async () => {
        const task = await contract.createTask('1', {
          attributes: { title: 'Locked' },
        });
        const { first, second } = await overlap(workspace1, {
          hold: async (tx) => adapter.lock(tx, tasks, task.id, 'update'),
          second: async (tx) =>
            adapter.update(
              tx,
              tasks,
              task.id,
              taskUpdate({ attributes: { title: 'Second' } }),
            ),
          release: async (tx) => {
            await adapter.update(
              tx,
              tasks,
              task.id,
              taskUpdate({ attributes: { title: 'First' } }),
            );
          },
        });
        assertEqual(settled(first), task, 'the row lock returned');
        settled(second);
        assertEqual(
          (await contract.getTask('1', task.id))?.['title'],
          'Second',
          'the title after an update that started while the row was locked',
        );
      },
    },
    {
      name: 'obligation 10: a row locked for a remove takes no new reference until the transaction ends',
      run: async () => {
        const task = await contract.createTask('1', {
          attributes: { title: 'Doomed' },
        });
        const { first, second } = await overlap(workspace1, {
          hold: async (tx) => adapter.lock(tx, tasks, task.id, 'remove'),
          second: async (tx) =>
            adapter.create(
              tx,
              tasks,
              taskCreate({
                attributes: { title: 'Child' },
                relationships: { parent: task.id },
              }),
            ),
          release: async (tx) => {
            assertEqual(
              await adapter.remove(tx, tasks, task.id),
              true,
              'the remove of the locked row',
            );
          },
        });
        assertEqual(
          committed(first, 'the transaction that locked the row for a remove'),
          task,
          'the row lock returned',
        );
        assertThat(
          !second.ok,
          'a create that references a row locked for a remove: expected a rejection, but it committed',
        );
        const error = second.ok ? undefined : second.error;
        assertEqual(
          constraintError(error, { resource: tasks, operation: 'create' })
            ?.code,
          'TASKS_PARENT_ID_FKEY',
          'the code of the create that referenced the removed row',
        );
      },
    },
  ];
}
