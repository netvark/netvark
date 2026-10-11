/**
 * A runtime of the contract (resource SPEC 12.10) held in memory, for the
 * routes' tests: each declared operation over rows by type, as public
 * rows, scoped to the actor's workspace for a scoped resource, with every
 * call recorded, so a test reads what a route handed the runtime. `get`,
 * `update`, and `remove` of a row the actor does not see answer
 * NOT_FOUND, as a runtime does, and so does a write that links a row
 * that does not exist, at `/data/relationships/<name>`, as a runtime's
 * target lookup answers (SPEC 12.3); an include of workspaces by an actor
 * without `workspaces:read` answers FORBIDDEN, as a policy would. A page
 * holds every row the actor sees, in insertion order, and has no other
 * page. Not published with the package.
 */
import type { DeclaredResource } from '@netvark/resource-core';
import type {
  Actor,
  PublicRow,
  ResourceInput,
  ResourceOperations,
  ResourceRuntime,
} from '@netvark/resource-core/server';

import { jsonApiError } from '@netvark/hono-jsonapi';

export type Permission = 'tasks:read' | 'tasks:write' | 'workspaces:read';

/** A member of one workspace. */
export interface Member extends Actor<Permission> {
  readonly workspace: string;
}

/** The domain of the tests. */
export interface TestDomain {
  readonly actor: Member;
  readonly permissions: Permission;
  readonly quotas: never;
  readonly services: undefined;
  readonly errors: Readonly<Record<string, never>>;
}

/** One call a route made: the resource's type, the operation, its arguments, and the actor. */
interface Call {
  readonly type: string;
  readonly operation: string;
  readonly args: ReadonlyArray<unknown>;
  readonly actor: Member;
}

/** The runtime, its rows by type and id, and every call made to it. */
export interface MemoryRuntime extends ResourceRuntime<TestDomain> {
  readonly rows: ReadonlyMap<string, Map<string, PublicRow>>;
  readonly calls: Array<Call>;
}

type Operations = {
  -readonly [K in keyof ResourceOperations]: ResourceOperations[K];
};

/** The scope's member on a row of a scoped resource: the workspace it belongs to. */
const SCOPE = 'workspace';
const PAGE_SIZE = 10;

/** A member of `workspace` holding `permissions`. */
export function member(
  id: string,
  workspace: string,
  permissions: ReadonlyArray<Permission>,
): Member {
  const held: ReadonlySet<string> = new Set(permissions);
  return { id, workspace, can: (permission) => held.has(permission) };
}

function notFound(): Error {
  return jsonApiError('NOT_FOUND', { detail: 'The resource does not exist' });
}

/** Throws NOT_FOUND at the first relationship of `input` that links a row `state` does not hold. */
function checkTargets(state: MemoryRuntime, input: ResourceInput): void {
  for (const [name, linkage] of Object.entries(input.relationships ?? {})) {
    const missing =
      typeof linkage === 'object' &&
      linkage !== null &&
      'type' in linkage &&
      'id' in linkage &&
      state.rows.get(String(linkage.type))?.has(String(linkage.id)) !== true;
    if (missing) {
      throw jsonApiError([
        {
          code: 'NOT_FOUND',
          status: 404,
          detail: 'The related resource does not exist',
          path: ['data', 'relationships', name],
        },
      ]);
    }
  }
}

/** The members `input` writes, each relationship as its target's id. */
function membersOf(input: ResourceInput): Record<string, unknown> {
  const relationships = Object.entries(input.relationships ?? {}).map(
    ([name, linkage]) =>
      [
        name,
        typeof linkage === 'object' && linkage !== null && 'id' in linkage
          ? linkage.id
          : null,
      ] as const,
  );
  return { ...input.attributes, ...Object.fromEntries(relationships) };
}

/** A new row of `declared`: every member `null` but those `input` writes. */
function newRow(
  declared: DeclaredResource,
  id: string,
  input: ResourceInput,
): Record<string, unknown> {
  const { attributes, relationships } = declared.resource;
  const members = [...attributes, ...Object.keys(relationships)];
  return {
    ...Object.fromEntries(members.map((name) => [name, null])),
    ...membersOf(input),
    id,
  };
}

/**
 * `work`'s result once a turn of the microtask queue has passed, as a
 * storage round trip settles: a route that did not await an operation
 * would hold a pending promise.
 */
async function roundTrip<TResult>(work: () => TResult): Promise<TResult> {
  await Promise.resolve();
  return work();
}

/** A page of every row in `rows`. */
function pageOf(rows: Array<PublicRow>) {
  return {
    rows,
    cursors: rows.map((row) => row.id),
    next: null,
    prev: null,
    hasNext: false,
    hasPrev: false,
    size: PAGE_SIZE,
    cursor: (row: PublicRow) => row.id,
  };
}

/** The rows `rows` link to over `relationship` in `targets`, each once. */
function linkedRows(
  rows: ReadonlyArray<PublicRow>,
  relationship: string,
  targets: ReadonlyMap<string, PublicRow> | undefined,
): Array<PublicRow> {
  const ids = new Set(
    rows.flatMap((row) => {
      const id = row[relationship];
      return typeof id === 'string' ? [id] : [];
    }),
  );
  return [...ids].flatMap((id) => {
    const target = targets?.get(id);
    return target === undefined ? [] : [target];
  });
}

/** Each declared operation of `declared` over `state`, as `actor` runs it. */
function operationsOf(
  state: MemoryRuntime,
  declared: DeclaredResource,
  actor: Member,
): ResourceOperations {
  const type = declared.names.type;
  const rows = state.rows.get(type) ?? new Map<string, PublicRow>();
  const scoped = declared.declaration.scope !== undefined;
  const visible = (row: PublicRow): boolean =>
    !scoped || row[SCOPE] === actor.workspace;
  const record = (operation: string, args: ReadonlyArray<unknown>): void => {
    state.calls.push({ type, operation, args, actor });
  };
  const find = (id: string): PublicRow => {
    const row = rows.get(id);
    if (row === undefined || !visible(row)) {
      throw notFound();
    }
    return row;
  };
  const declaredOperations: ReadonlySet<string> = new Set(
    declared.declaration.operations,
  );
  const operations: Operations = {};
  if (declaredOperations.has('list')) {
    operations.list = async (request, options) =>
      roundTrip(() => {
        record('list', [request, options]);
        return pageOf([...rows.values()].filter((row) => visible(row)));
      });
  }
  if (declaredOperations.has('get')) {
    operations.get = async (id) =>
      roundTrip(() => {
        record('get', [id]);
        return find(id);
      });
  }
  if (declaredOperations.has('create')) {
    operations.create = async (input) =>
      roundTrip(() => {
        record('create', [input]);
        checkTargets(state, input);
        const id = input.id ?? crypto.randomUUID();
        const row = {
          ...newRow(declared, id, input),
          ...(scoped ? { [SCOPE]: actor.workspace } : {}),
          id,
        };
        rows.set(id, row);
        return row;
      });
  }
  if (declaredOperations.has('update')) {
    operations.update = async (id, input) =>
      roundTrip(() => {
        record('update', [id, input]);
        checkTargets(state, input);
        const row = { ...find(id), ...membersOf(input), id };
        rows.set(id, row);
        return row;
      });
  }
  if (declaredOperations.has('remove')) {
    operations.remove = async (id) =>
      roundTrip(() => {
        record('remove', [id]);
        find(id);
        rows.delete(id);
      });
  }
  if (declared.resource.query.include.length > 0) {
    operations.include = async (relationship, linked) =>
      roundTrip(() => {
        record('include', [relationship, linked]);
        const target = declared.resource.relationships[relationship]?.type;
        if (target === 'workspaces' && !actor.can('workspaces:read')) {
          throw jsonApiError('FORBIDDEN', {
            detail: 'The actor may not read the workspace',
          });
        }
        return linkedRows(
          linked,
          relationship,
          target === undefined ? undefined : state.rows.get(target),
        );
      });
  }
  return Object.freeze(operations);
}

/** A runtime of `resources` over `seed`, the rows of each type, by type. */
export function memoryRuntime(
  resources: ReadonlyArray<DeclaredResource>,
  seed: Readonly<Record<string, ReadonlyArray<PublicRow>>> = {},
): MemoryRuntime {
  const rows = new Map(
    resources.map((declared) => {
      const type = declared.names.type;
      const seeded = Object.hasOwn(seed, type) ? seed[type] : undefined;
      return [
        type,
        new Map((seeded ?? []).map((row) => [row.id, row] as const)),
      ] as const;
    }),
  );
  const state: MemoryRuntime = {
    warnings: [],
    resources,
    rows,
    calls: [],
    as: (actor) =>
      Object.freeze(
        Object.fromEntries(
          resources.map((declared) => [
            declared.names.type,
            operationsOf(state, declared, actor),
          ]),
        ),
      ),
  };
  return state;
}
