/**
 * The cases of obligation 1 (SPEC 12.8): an operation runs in one
 * transaction that first sets every scope's parameter, for that
 * transaction only, and that rolls back and rejects with what its run
 * threw, so a runtime still sees its own `Rejection`, or with the
 * database's error when a statement failed and the run went on, since
 * PostgreSQL turns the COMMIT of such a transaction into a rollback that
 * reports no error. The parameter is
 * read back through a column default, `current_setting(..., true)`, which
 * is `NULL` in a session that never set it and `''` once a setting made
 * for a transaction has ended; a setting made for the session would leak
 * into the next transaction on the connection.
 * @ref https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADMIN-SET
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/access/transam/xact.c (EndTransactionBlock: "Since COMMIT may actually do a ROLLBACK")
 * @packageDocumentation
 */
import type { Contract } from './context';
import type { ContractCase } from './types';

import { constraintError } from '../../server/constraint-error';
import { assertEqual, assertThat, rejection } from './assert';
import { MISSING, taskCreate } from './context';

/** The cases of obligation 1. */
export function transactionCases<TTransaction>(
  contract: Contract<TTransaction>,
): ReadonlyArray<ContractCase> {
  const { harness, workspaces, tasks, within } = contract;
  const { adapter } = harness;
  return [
    {
      name: "obligation 1: sets each scope's parameter before the transaction's first statement",
      run: async () => {
        const workspace = await within('2', async (tx) =>
          adapter.create(tx, workspaces, {
            attributes: { name: 'Three' },
            relationships: {},
          }),
        );
        assertEqual(
          workspace['createdIn'],
          '2',
          'createdIn of a workspace created in a transaction of workspace 2',
        );
        const task = await contract.createTask('1', {
          attributes: { title: 'Scoped' },
        });
        assertEqual(
          task['createdIn'],
          '1',
          'createdIn of a task created in workspace 1',
        );
      },
    },
    {
      name: 'obligation 1: sets the parameters for their transaction only',
      run: async () => {
        await within('1', async (tx) => adapter.get(tx, tasks, MISSING));
        await rejection(
          within('2', async (tx) => {
            await adapter.get(tx, tasks, MISSING);
            throw new Error('rolled back');
          }),
          'a transaction whose run throws',
        );
        const row = await adapter.transaction([], async (tx) =>
          adapter.create(tx, workspaces, {
            attributes: { name: 'Unscoped' },
            relationships: {},
          }),
        );
        const createdIn = row['createdIn'];
        assertThat(
          createdIn === null || createdIn === '',
          `createdIn of a workspace created without scopes after transactions of workspaces 1 and 2: expected null or '', got ${JSON.stringify(createdIn)}`,
        );
      },
    },
    {
      name: 'obligation 1: rolls back and rejects with what the run threw, unchanged',
      run: async () => {
        const stop = new Error('stop');
        const created: Array<string> = [];
        const thrown = await rejection(
          within('1', async (tx) => {
            const row = await adapter.create(
              tx,
              tasks,
              taskCreate({ attributes: { title: 'Rolled back' } }),
            );
            created.push(row.id);
            throw stop;
          }),
          'a transaction whose run throws',
        );
        assertThat(
          thrown === stop,
          'the transaction rejects with the error its run threw',
        );
        for (const id of created) {
          assertEqual(
            await contract.getTask('1', id),
            undefined,
            'the task created before the run threw',
          );
        }
        assertEqual(created.length, 1, 'tasks created before the run threw');
      },
    },
    {
      name: 'obligation 1: rejects with the error of a statement that failed, though the run went on',
      run: async () => {
        const created: Array<string> = [];
        const thrown = await rejection(
          within('1', async (tx) => {
            const row = await adapter.create(
              tx,
              tasks,
              taskCreate({ attributes: { title: 'Kept?' } }),
            );
            created.push(row.id);
            try {
              await adapter.create(
                tx,
                tasks,
                taskCreate({ attributes: { title: '' } }),
              );
            } catch {
              // The run goes on, as a rule that catches an error might.
            }
            return row;
          }),
          'a transaction whose run went on after a refused statement',
        );
        assertEqual(
          constraintError(thrown, { resource: tasks, operation: 'create' })
            ?.code,
          'TASKS_TITLE_CHECK',
          'the code of what the transaction rejected with',
        );
        for (const id of created) {
          assertEqual(
            await contract.getTask('1', id),
            undefined,
            'the task created before the refused statement',
          );
        }
        assertEqual(created.length, 1, 'tasks created before it');
      },
    },
  ];
}
