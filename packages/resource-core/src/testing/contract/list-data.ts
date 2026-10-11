/**
 * The tasks the list cases page through (SPEC 12.8, obligation 5): five in
 * workspace 1 and two in workspace 2, with the values a driver or a cast
 * to text orders or compares wrongly: numerics and integers whose text
 * sorts otherwise, an `int8` past 2^53 beside its neighbor, `timestamptz`
 * values a microsecond apart and the same instant written in another
 * zone, an enum whose labels sort otherwise as text, array elements that
 * need quoting, and nulls. The ids run against the titles, so a tie broken
 * by anything but the key shows.
 * @packageDocumentation
 */
import type { Contract } from './context';

/** The ids of workspace 1's tasks, in the reverse order of their titles. */
export const LIST_IDS = {
  alpha: '00000000-0000-4000-8000-000000000005',
  bravo: '00000000-0000-4000-8000-000000000004',
  charlie: '00000000-0000-4000-8000-000000000003',
  delta: '00000000-0000-4000-8000-000000000002',
  echo: '00000000-0000-4000-8000-000000000001',
} as const;

interface ListTask {
  readonly workspace: string;
  readonly id: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly parent?: string;
}

/** Created in this order, so a parent exists before its children. */
const LIST_TASKS: ReadonlyArray<ListTask> = [
  {
    workspace: '1',
    id: LIST_IDS.alpha,
    attributes: {
      title: 'alpha',
      estimate: '1.25',
      points: '9007199254740993',
      dueOn: '2026-03-01',
      startsAt: '2026-10-10T10:30:00.123457Z',
      tags: ['x', 'y'],
      done: true,
      priority: 'high',
      rank: 2,
    },
  },
  {
    workspace: '1',
    id: LIST_IDS.bravo,
    attributes: {
      title: 'bravo',
      estimate: '10.00',
      points: '9007199254740992',
      startsAt: '2026-10-10T10:30:00.123456Z',
      tags: ['y'],
      priority: 'low',
    },
    parent: LIST_IDS.alpha,
  },
  {
    workspace: '1',
    id: LIST_IDS.charlie,
    attributes: {
      title: 'charlie',
      estimate: '9.50',
      points: '-5',
      dueOn: '2026-01-15',
      tags: [],
      priority: 'normal',
      rank: 10,
    },
    parent: LIST_IDS.alpha,
  },
  {
    workspace: '1',
    id: LIST_IDS.delta,
    attributes: {
      title: 'delta',
      estimate: '1.25',
      points: '42',
      startsAt: '2026-10-10T12:30:00.123456+02:00',
      tags: ['x', 'NULL'],
      priority: 'high',
      rank: 2,
    },
  },
  {
    workspace: '1',
    id: LIST_IDS.echo,
    attributes: {
      title: 'echo alpha',
      estimate: '0.75',
      points: '100',
      dueOn: '2025-12-31',
      startsAt: '2026-10-09T23:59:59Z',
      tags: ['z, w'],
      priority: 'normal',
      rank: 1,
    },
  },
  {
    workspace: '2',
    id: '00000000-0000-4000-8000-000000000006',
    attributes: {
      title: 'apex',
      estimate: '5.00',
      points: '50',
      dueOn: '2026-02-01',
      startsAt: '2026-10-10T00:00:00Z',
      tags: ['x'],
      priority: 'high',
      rank: 3,
    },
  },
  {
    workspace: '2',
    id: '00000000-0000-4000-8000-000000000007',
    attributes: {
      title: 'cobra alpha',
      estimate: '1.30',
      points: '9007199254740994',
      tags: ['y'],
      priority: 'normal',
      rank: 2,
    },
  },
];

/** Logs in both partitions, created out of the key's order, owned by workspaces 1 and 2 in turn along it. */
const LIST_LOGS = [
  { id: '9007199254740993', owner: '1' },
  { id: '7', owner: '1' },
  { id: '9007199254740992', owner: '2' },
  { id: '1007', owner: '1' },
  { id: '999', owner: '2' },
] as const;
/** The keys of the logs, in their order. */
export const LOG_KEYS: ReadonlyArray<string> = [
  '7',
  '999',
  '1007',
  '9007199254740992',
  '9007199254740993',
];
/** Workspace 1's titles in the declared default sort, `-priority` then `dueOn`, then the key. */
export const DEFAULT_ORDER: ReadonlyArray<string> = [
  'alpha',
  'delta',
  'echo alpha',
  'charlie',
  'bravo',
];

/** Creates the tasks the list cases page through, each in a transaction of its own. */
export async function createListTasks<TTransaction>(
  contract: Contract<TTransaction>,
): Promise<void> {
  for (const task of LIST_TASKS) {
    await contract.createTask(task.workspace, {
      id: task.id,
      attributes: task.attributes,
      ...(task.parent === undefined
        ? {}
        : { relationships: { parent: task.parent } }),
    });
  }
}

/** Creates the logs the list cases page through, each in a transaction of its own. */
export async function createListLogs<TTransaction>(
  contract: Contract<TTransaction>,
): Promise<void> {
  const { harness, logs, within } = contract;
  for (const { id, owner } of LIST_LOGS) {
    await within('1', async (tx) =>
      harness.adapter.create(tx, logs, {
        id,
        attributes: { note: `log ${id}` },
        relationships: { owner },
      }),
    );
  }
}
