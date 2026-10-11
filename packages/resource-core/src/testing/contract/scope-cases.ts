/**
 * The cases of obligations 2 and 7 (SPEC 12.8): every statement on a
 * scoped table carries the scope's predicate, so a row of another scope
 * is absent for `get`, `lock`, `update`, and `remove`, and `count` counts the
 * transaction's scope only. The fixture has no row security, so only the
 * adapter's predicate keeps a row in its scope.
 * @packageDocumentation
 */
import type { Contract } from './context';
import type { ContractCase } from './types';

import { assertEqual } from './assert';
import { taskUpdate } from './context';

/** The cases of obligations 2 and 7. */
export function scopeCases<TTransaction>(
  contract: Contract<TTransaction>,
): ReadonlyArray<ContractCase> {
  const { harness, tasks, within } = contract;
  const { adapter } = harness;
  return [
    {
      name: 'obligation 7: a row of another scope is absent for get, lock, update, and remove',
      run: async () => {
        const other = await contract.createTask('2', {
          attributes: { title: 'Elsewhere' },
        });
        await within('1', async (tx) => {
          assertEqual(
            await adapter.get(tx, tasks, other.id),
            undefined,
            'get from workspace 1 of a task of workspace 2',
          );
          for (const write of ['update', 'remove'] as const) {
            assertEqual(
              await adapter.lock(tx, tasks, other.id, write),
              undefined,
              `lock for ${write} from workspace 1 of a task of workspace 2`,
            );
          }
          assertEqual(
            await adapter.update(
              tx,
              tasks,
              other.id,
              taskUpdate({ attributes: { title: 'Taken' } }),
            ),
            undefined,
            'update from workspace 1 of a task of workspace 2',
          );
          assertEqual(
            await adapter.update(tx, tasks, other.id, taskUpdate({})),
            undefined,
            'update without members from workspace 1 of a task of workspace 2',
          );
          assertEqual(
            await adapter.remove(tx, tasks, other.id),
            false,
            'remove from workspace 1 of a task of workspace 2',
          );
        });
        assertEqual(
          await contract.getTask('2', other.id),
          other,
          'the task of workspace 2 afterwards',
        );
      },
    },
    {
      name: "obligation 2: count counts the rows of the transaction's scope only",
      run: async () => {
        for (const [workspace, title] of [
          ['1', 'First'],
          ['1', 'Second'],
          ['2', 'Third'],
        ] as const) {
          await contract.createTask(workspace, { attributes: { title } });
        }
        assertEqual(
          await within('1', async (tx) => adapter.count(tx, tasks, 'tasks')),
          2,
          'count in workspace 1',
        );
        assertEqual(
          await within('9', async (tx) => adapter.count(tx, tasks, 'tasks')),
          1,
          'count in workspace 9, whose one task has a value with no read form',
        );
      },
    },
  ];
}
