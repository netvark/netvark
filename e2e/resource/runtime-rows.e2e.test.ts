/**
 * The runtime on the rows of an organization (resource SPEC 12.3, 18.4):
 * the runtime `createResourceRuntime` boots over the application's role,
 * on PGlite and on the server `RESOURCE_PG_URL` names, reads, updates, and
 * removes contacts through the domain alone, as a worker would. A row of
 * another organization, and a row the actor may not read, are `NOT_FOUND`
 * alike; an update keeps an archived contact's name and records a rename;
 * a remove records its event, and one that a meeting's `ON DELETE SET
 * NULL` cannot follow is a `CONFLICT`. Under the runtime, the row security
 * policy binds the role: without the scope's parameter it reads nothing.
 * @ref https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADMIN-SET (set_config, is_local)
 */
import type { RuntimeDatabase } from './runtime/database.ts';
import type { AppRuntime } from './runtime/fixture.ts';

import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runtimeDatabases } from './runtime/database.ts';
import {
  contact,
  editor,
  openRuntime,
  stranger,
  viewer,
  visibleError,
} from './runtime/fixture.ts';
import { ADA, ARCHIVED, GRACE } from './runtime/seed.ts';

const MISSING = '00000000-0000-4000-8000-0000000000ff';

describe.each(runtimeDatabases())(
  'on %s, the runtime on the rows of an organization',
  (_name, open) => {
    let database: RuntimeDatabase;
    let runtime: AppRuntime;

    beforeAll(async () => {
      database = await open();
      runtime = await openRuntime(database.db);
    });
    beforeEach(async () => {
      await database.reset();
    });
    afterAll(async () => {
      await database.close();
    });

    it("reads a row of the actor's organization, and finds none of another", async () => {
      expect(await runtime.as(viewer).contacts.get(ADA)).toMatchObject({
        id: ADA,
        name: 'Ada',
        organization: '1',
      });
      await expect(
        runtime.as(editor).contacts.get(GRACE),
      ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    it('answers a get the policy denies exactly as a get of a missing row', async () => {
      const denied = await visibleError(runtime.as(stranger).contacts.get(ADA));
      expect(denied).toEqual(
        await visibleError(runtime.as(editor).contacts.get(MISSING)),
      );
      expect(denied).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    it('records a rename, and nothing for an update that keeps the name', async () => {
      expect(
        await runtime
          .as(editor)
          .contacts.update(ADA, contact({ name: 'Ada Lovelace' })),
      ).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
      await runtime.as(editor).contacts.update(ADA, contact({ priority: 2 }));
      expect(await database.events()).toEqual([
        {
          name: 'contact.renamed',
          version: 1,
          payload: { id: ADA, from: 'Ada', to: 'Ada Lovelace' },
        },
      ]);
    });

    it("keeps an archived contact's name with the rule's code", async () => {
      await expect(
        runtime.as(editor).contacts.update(ARCHIVED, contact({ name: 'New' })),
      ).rejects.toMatchObject({
        status: 409,
        code: 'CONTACT_ARCHIVED',
        errors: [{ path: ['data', 'attributes', 'name'] }],
      });
      expect(
        await runtime
          .as(editor)
          .contacts.update(ARCHIVED, contact({ priority: 1 })),
      ).toMatchObject({ name: 'Old Name', priority: 1 });
    });

    it('removes a contact with its event, and finds no row of another organization to change', async () => {
      await runtime.as(editor).contacts.remove(ARCHIVED);
      expect(await database.events()).toEqual([
        { name: 'contact.removed', version: 1, payload: { id: ARCHIVED } },
      ]);
      await expect(
        runtime.as(editor).contacts.get(ARCHIVED),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        runtime.as(editor).contacts.update(GRACE, contact({ name: 'Taken' })),
      ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      await expect(
        runtime.as(editor).contacts.remove(GRACE),
      ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      expect(await database.contacts(2)).toBe(1);
    });

    it("answers CONFLICT for a remove a referencing row's SET NULL cannot follow, and keeps the row", async () => {
      // Ada's meeting has no notes, so meetings_contact_or_notes refuses the
      // meeting without its contact that ON DELETE SET NULL would leave.
      await expect(
        runtime.as(editor).contacts.remove(ADA),
      ).rejects.toMatchObject({
        status: 409,
        code: 'CONFLICT',
        detail: 'The resource is still referenced.',
        cause: { code: '23514', table: 'meetings' },
      });
      expect(await database.contacts(1)).toBe(2);
      expect(await database.events()).toEqual([]);
    });

    it('runs as a role the row security policy binds, which reads nothing without the scope', async () => {
      const unscoped = await sqlState(
        sql`select count(*) from contacts`.execute(database.db),
      );
      // A session that never set the parameter has none (42704); once a
      // transaction-local setting ended, it holds '' (22P02 as bigint).
      expect(['42704', '22P02']).toContain(unscoped);
      expect(
        await database.db.transaction().execute(async (tx) => {
          await sql`select set_config('app.organization_id', '2', true)`.execute(
            tx,
          );
          return (await sql`select name from contacts`.execute(tx)).rows;
        }),
      ).toEqual([{ name: 'Grace' }]);
    });
  },
);

/** The SQLSTATE a database statement rejected with. */
async function sqlState(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return typeof error === 'object' && error !== null
      ? Reflect.get(error, 'code')
      : undefined;
  }
  throw new Error('the statement succeeded');
}
