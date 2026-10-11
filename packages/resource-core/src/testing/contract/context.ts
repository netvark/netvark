/**
 * What the contract's cases share (SPEC 12.9): the harness, the fixture's
 * resources, a transaction in a workspace, and writes of a task as a
 * runtime would hand them to the adapter: parsed members by public name,
 * and on create the server value `created_by`.
 * @packageDocumentation
 */
import type { DeclaredResource } from '../../declare/declared-resource';
import type { PublicRow, StorageWrite } from '../../server/storage';
import type { ContractHarness } from './types';

import { scopeValues } from '../../server/scope';
import { assertThat } from './assert';
import { contractFixture } from './fixture';

/** The `created_by` server value of every task a case creates. */
export const CREATOR = '00000000-0000-4000-8000-0000000000aa';
/** The seeded task in workspace 9 whose `starts_at` is `infinity`. */
export const UNREADABLE = '00000000-0000-4000-8000-000000000009';
/** A task id no row has. */
export const MISSING = '00000000-0000-4000-8000-00000000dead';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** A task write: `attributes`, no relationships unless given, and on create the server value. */
export interface TaskWrite {
  readonly id?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly relationships?: Readonly<Record<string, string | null>>;
}

/** The cases' view of one harness. */
export interface Contract<TTransaction> {
  readonly harness: ContractHarness<TTransaction>;
  readonly workspaces: DeclaredResource;
  readonly tasks: DeclaredResource;
  /** Runs `run` in one transaction of an actor working in `workspace`. */
  readonly within: <TResult>(
    workspace: string,
    run: (tx: TTransaction) => Promise<TResult>,
  ) => Promise<TResult>;
  /** Creates a task in `workspace` in a transaction of its own. */
  readonly createTask: (
    workspace: string,
    write: TaskWrite,
  ) => Promise<PublicRow>;
  /** Reads a task from `workspace` in a transaction of its own. */
  readonly getTask: (
    workspace: string,
    id: string,
  ) => Promise<PublicRow | undefined>;
}

/** The create a runtime hands the adapter for `write`: its members and the server value. */
export function taskCreate(write: TaskWrite): StorageWrite {
  return {
    ...(write.id === undefined ? {} : { id: write.id }),
    attributes: write.attributes ?? {},
    relationships: write.relationships ?? {},
    values: { created_by: CREATOR },
  };
}

/** The update a runtime hands the adapter for `write`: its members only. */
export function taskUpdate(write: TaskWrite): StorageWrite {
  return {
    attributes: write.attributes ?? {},
    relationships: write.relationships ?? {},
  };
}

/** A task as read right after a create of only its title in `workspace`: every default, no relationship. */
export function defaultTask(
  id: string,
  title: string,
  workspace: string,
): PublicRow {
  return {
    id,
    title,
    estimate: null,
    points: null,
    dueOn: null,
    startsAt: null,
    tags: [],
    details: null,
    done: false,
    location: null,
    locationText: null,
    hasSecret: false,
    createdBy: CREATOR,
    createdIn: workspace,
    workspace,
    parent: null,
  };
}

/** Throws unless `id` is a UUID in its read form, lower case. */
export function assertUuid(id: unknown, what: string): void {
  assertThat(
    typeof id === 'string' && UUID.test(id),
    `${what}: expected a lower-case UUID`,
  );
}

/** The cases' view of `harness`. */
export function contractOf<TTransaction>(
  harness: ContractHarness<TTransaction>,
): Contract<TTransaction> {
  const { adapter } = harness;
  const { workspaces, tasks } = contractFixture.resources;
  const within = async <TResult>(
    workspace: string,
    run: (tx: TTransaction) => Promise<TResult>,
  ): Promise<TResult> =>
    adapter.transaction(
      scopeValues(contractFixture.scopes, { workspace }),
      run,
    );
  return {
    harness,
    workspaces,
    tasks,
    within,
    createTask: async (workspace, write) =>
      within(workspace, async (tx) =>
        adapter.create(tx, tasks, taskCreate(write)),
      ),
    getTask: async (workspace, id) =>
      within(workspace, async (tx) => adapter.get(tx, tasks, id)),
  };
}
