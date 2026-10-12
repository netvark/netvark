/**
 * `createResourceRuntime` (resource SPEC 18.3, 18.4) on PGlite, which has
 * roles and row security as a server has: the static checks, then the
 * connected ones as the role the session runs as. A role row security
 * applies to starts the runtime, which lists the declared resource of
 * each behavior and whose domain runs each operation as the actor, alone
 * or in a transaction with others; a superuser, a role with BYPASSRLS, and a role that owns a
 * scoped table without FORCE are refused, each with every other problem.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { BootError } from '../boot/report';
import {
  bootCatalog,
  tasksLike,
  TASKS_ROW_SECURITY,
  withTable,
} from '../test-support/boot-catalog';
import { bootOptions } from '../test-support/boot-options';
import { contractDatabase } from '../test-support/database';
import { BEHAVIORS, member } from '../test-support/domain';
import { domainStorage, OUTBOX_TABLE } from '../test-support/domain-database';
import { createResourceRuntime } from './create-runtime';

const ROLES = `create role boot_app;
create role boot_bypass bypassrls;
create role boot_owner;
grant usage on schema contract_archive to boot_app, boot_bypass, boot_owner;
grant select, insert, update, delete on all tables in schema public, contract_archive to boot_app, boot_bypass, boot_owner;
grant usage on all sequences in schema public to boot_app, boot_bypass, boot_owner;
alter table tasks owner to boot_owner;`;

const database = contractDatabase([OUTBOX_TABLE, TASKS_ROW_SECURITY, ROLES]);
const storage = domainStorage(database.db);

/** The domain's options over the live database's storage. */
async function liveOptions() {
  return { ...(await bootOptions()), storage };
}

/** What `run` resolves or rejects to while the session runs as `role`. */
async function as<TResult>(
  role: string,
  run: () => Promise<TResult>,
): Promise<TResult> {
  await database.exec(`set role ${role}`);
  try {
    return await run();
  } finally {
    await database.exec('reset role');
  }
}

/** What boot refused with. */
async function refused(boot: Promise<unknown>): Promise<BootError> {
  const error = await boot.then(
    () => new Error('the runtime started'),
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof BootError)) {
    throw error;
  }
  return error;
}

beforeEach(async () => {
  await database.reset();
});
afterAll(async () => {
  await database.close();
});

describe('createResourceRuntime (resource SPEC 18.3, 18.4)', () => {
  it('starts as a role row security applies to, and runs each operation as the actor', async () => {
    const runtime = await as('boot_app', async () =>
      createResourceRuntime(await liveOptions()),
    );
    expect(runtime.warnings).toEqual([]);
    const [created, mine, theirs] = await as('boot_app', async () => {
      const tasks = runtime.as(member('1')).tasks;
      const row = await tasks.create?.({ attributes: { title: 'Boot' } });
      return [
        row,
        await tasks.list?.(),
        await runtime.as(member('2')).tasks.list?.(),
      ];
    });
    expect(created).toMatchObject({ title: 'Boot', workspace: '1' });
    expect(mine?.rows).toEqual([created]);
    expect(theirs?.rows).toEqual([]);
  });

  it("runs a transaction's operations as the actor under row security, committing them together", async () => {
    const runtime = await as('boot_app', async () =>
      createResourceRuntime(await liveOptions()),
    );
    const [inside, mine, theirs] = await as('boot_app', async () => {
      const seen = await runtime.transaction(member('1'), async (domain) => {
        await domain.tasks.create?.({ attributes: { title: 'One' } });
        await domain.tasks.create?.({ attributes: { title: 'Two' } });
        return domain.tasks.list?.();
      });
      return [
        seen,
        await runtime.as(member('1')).tasks.list?.(),
        await runtime.as(member('2')).tasks.list?.(),
      ];
    });
    expect(inside?.rows.map((row) => row['title'])).toEqual(['One', 'Two']);
    expect(mine?.rows).toEqual(inside?.rows);
    expect(theirs?.rows).toEqual([]);
  });

  it('lists the declared resource of each behavior, in the order of resources', async () => {
    const options = await liveOptions();
    const { tasks, workspaces, logs } = BEHAVIORS;
    const runtime = await as('boot_app', async () =>
      createResourceRuntime({
        ...options,
        resources: { workspaces, logs, tasks },
      }),
    );
    expect(runtime.resources).toHaveLength(3);
    expect(runtime.resources[0]).toBe(workspaces.resource);
    expect(runtime.resources[1]).toBe(logs.resource);
    expect(runtime.resources[2]).toBe(tasks.resource);
    expect(Object.isFrozen(runtime.resources)).toBe(true);
    expect(Object.isFrozen(runtime)).toBe(true);
  });

  it('carries the warnings of the static checks, and starts despite them', async () => {
    const options = await liveOptions();
    const catalog = tasksLike(await bootCatalog(), 'idx_none', 'indexes');
    const runtime = await as('boot_app', async () =>
      createResourceRuntime({ ...options, catalog }),
    );
    expect(runtime.warnings).toEqual([
      'tasks: no btree index on tasks begins with (workspace_id, title), so a page sorted by title sorts every row of the scope',
    ]);
  });

  it('refuses a superuser, and a role with BYPASSRLS, once each', async () => {
    const options = await liveOptions();
    expect((await refused(createResourceRuntime(options))).problems).toEqual([
      'role postgres: a superuser bypasses row security on every table; connect as a role that is not one',
    ]);
    expect(
      (
        await refused(
          as('boot_bypass', async () => createResourceRuntime(options)),
        )
      ).problems,
    ).toEqual([
      'role boot_bypass: BYPASSRLS bypasses row security on every table; connect as a role without it',
    ]);
  });

  it('refuses a role that owns a scoped table that does not force row security', async () => {
    const options = await liveOptions();
    const owner = async () =>
      as('boot_owner', async () => createResourceRuntime(options));
    expect((await refused(owner())).problems).toEqual([
      'tasks: row security does not apply to role boot_owner on tasks, most often because the role owns it and it does not force row security; force row security on the table, or connect as a role that does not own it',
    ]);
    await database.exec('alter table tasks force row level security');
    try {
      await expect(owner()).resolves.toMatchObject({ warnings: [] });
    } finally {
      await database.exec('alter table tasks no force row level security');
    }
  });

  it('refuses a scoped table the database lacks', async () => {
    const options = await liveOptions();
    const catalog = withTable(options.catalog, 'tasks', (table) => ({
      ...table,
      name: 'tasks_elsewhere',
    }));
    expect(
      (
        await refused(
          as('boot_app', async () =>
            createResourceRuntime({ ...options, catalog }),
          ),
        )
      ).problems,
    ).toEqual(['tasks: the database has no table tasks']);
  });

  it('rejects with every problem, static and connected, its message one per line', async () => {
    const error = await refused(
      createResourceRuntime({ ...(await liveOptions()), scopes: {} }),
    );
    expect(error.problems).toEqual([
      'tasks: scope workspace has no binding in scopes',
      'role postgres: a superuser bypasses row security on every table; connect as a role that is not one',
    ]);
    expect(error.message).toBe(error.problems.join('\n'));
    expect(error.name).toBe('BootError');
    expect(error).toBeInstanceOf(Error);
  });
});
