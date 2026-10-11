/**
 * The cases of obligation 4 (SPEC 12.8): a write carries exactly the
 * members present in the input, plus the scope column and the server
 * values on create (ADR 0004). A member left out keeps its value, or its
 * default on create; `null` clears a member; a relationship is written by
 * its target's id; an update without members changes nothing.
 * @packageDocumentation
 */
import type { Contract } from './context';
import type { ContractCase } from './types';

import { assertEqual } from './assert';
import { assertUuid, defaultTask, taskUpdate } from './context';

const PLANNED = {
  title: 'Planned',
  estimate: '2.25',
  tags: ['x'],
  location: { x: 0, y: 0.5 },
  secret: 'kept',
};

/** The cases of obligation 4. */
export function writeCases<TTransaction>(
  contract: Contract<TTransaction>,
): ReadonlyArray<ContractCase> {
  const { harness, workspaces, tasks, within } = contract;
  const { adapter } = harness;
  return [
    {
      name: 'obligation 4: create writes only the members present, so the defaults apply',
      run: async () => {
        const row = await contract.createTask('1', {
          attributes: { title: 'Defaults' },
        });
        assertUuid(row.id, 'the id of a task created without one');
        assertEqual(
          row,
          defaultTask(row.id, 'Defaults', '1'),
          'a task created with its title only',
        );
      },
    },
    {
      name: "obligation 4: create writes the scope column from the transaction's scope",
      run: async () => {
        const row = await contract.createTask('2', {
          attributes: { title: 'Mine' },
        });
        assertEqual(
          row['workspace'],
          '2',
          'the workspace of a task created in workspace 2',
        );
        assertEqual(
          await contract.getTask('1', row.id),
          undefined,
          'the task read from workspace 1',
        );
      },
    },
    {
      name: 'obligation 4: update writes only the members present, and null clears a member',
      run: async () => {
        const created = await contract.createTask('1', {
          attributes: PLANNED,
        });
        const renamed = await within('1', async (tx) =>
          adapter.update(
            tx,
            tasks,
            created.id,
            taskUpdate({ attributes: { title: 'Renamed' } }),
          ),
        );
        assertEqual(
          renamed,
          { ...created, title: 'Renamed' },
          'the task after an update of its title',
        );
        const cleared = await within('1', async (tx) =>
          adapter.update(
            tx,
            tasks,
            created.id,
            taskUpdate({
              attributes: { estimate: null, location: null, secret: null },
            }),
          ),
        );
        assertEqual(
          cleared,
          { ...defaultTask(created.id, 'Renamed', '1'), tags: ['x'] },
          'the task after clearing its estimate, location, and secret',
        );
        assertEqual(
          await contract.getTask('1', created.id),
          cleared,
          'the task read after the updates',
        );
      },
    },
    {
      name: "obligation 4: writes a relationship by its target's id, and null clears it",
      run: async () => {
        const first = await contract.createTask('1', {
          attributes: { title: 'First' },
        });
        const second = await contract.createTask('1', {
          attributes: { title: 'Second' },
        });
        const child = await contract.createTask('1', {
          attributes: { title: 'Child' },
          relationships: { parent: first.id },
        });
        assertEqual(child['parent'], first.id, 'parent on create');
        const moved = await within('1', async (tx) =>
          adapter.update(
            tx,
            tasks,
            child.id,
            taskUpdate({ relationships: { parent: second.id } }),
          ),
        );
        assertEqual(moved, { ...child, parent: second.id }, 'after a move');
        const orphaned = await within('1', async (tx) =>
          adapter.update(
            tx,
            tasks,
            child.id,
            taskUpdate({ relationships: { parent: null } }),
          ),
        );
        assertEqual(orphaned, { ...child, parent: null }, 'after clearing');
      },
    },
    {
      name: 'obligation 4: an update without members changes nothing and returns the row',
      run: async () => {
        const created = await contract.createTask('1', {
          attributes: PLANNED,
        });
        assertEqual(
          await within('1', async (tx) =>
            adapter.update(tx, tasks, created.id, taskUpdate({})),
          ),
          created,
          'the row an update without members returns',
        );
      },
    },
    {
      name: 'obligation 4: creates, updates, and reads an unscoped resource with an identity key',
      run: async () => {
        const created = await within('1', async (tx) =>
          adapter.create(tx, workspaces, {
            attributes: { name: 'Three' },
            relationships: {},
          }),
        );
        const expected = { id: '10', name: 'Three', createdIn: '1' };
        assertEqual(created, expected, 'the workspace create returns');
        const renamed = await within('2', async (tx) =>
          adapter.update(tx, workspaces, '10', {
            attributes: { name: 'Renamed' },
            relationships: {},
          }),
        );
        assertEqual(
          renamed,
          { ...expected, name: 'Renamed' },
          'the workspace update returns, read in another workspace',
        );
        assertEqual(
          await adapter.transaction([], async (tx) =>
            adapter.get(tx, workspaces, '10'),
          ),
          renamed,
          'the workspace get returns without scopes',
        );
      },
    },
  ];
}
