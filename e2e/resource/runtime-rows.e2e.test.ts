/**
 * The server subpath composes into a runtime (resource SPEC 12.3): the
 * minimal runtime of `runtime/` reads, updates, and removes contacts over
 * the reference adapter on PGlite, as a role the row security policy
 * binds. A row of another organization, and a row the actor may not read,
 * are `NOT_FOUND` alike; an update keeps an archived contact's name and
 * records a rename; a remove records its event, and one that a meeting's
 * `ON DELETE SET NULL` cannot follow is a `CONFLICT`.
 */
import type { RuntimeDatabase } from './runtime/database.ts';
import type { Runtime } from './runtime/runtime.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ADA, ARCHIVED, GRACE } from './runtime/database.ts';
import { ContactsBehavior } from './runtime/domain.ts';
import {
  contact,
  editor,
  openRuntime,
  stranger,
  viewer,
  visibleError,
} from './runtime/fixture.ts';

const MISSING = '00000000-0000-4000-8000-0000000000ff';

describe('a runtime over the server subpath, on the rows of an organization', () => {
  let database: RuntimeDatabase;
  let runtime: Runtime;

  beforeAll(async () => {
    ({ database, runtime } = await openRuntime());
  });
  beforeEach(async () => {
    await database.reset();
  });
  afterAll(async () => {
    await database.close();
  });

  it("reads a row of the actor's organization, and finds none of another", async () => {
    expect(await runtime.get(viewer, ContactsBehavior, ADA)).toMatchObject({
      id: ADA,
      name: 'Ada',
      organization: '1',
    });
    await expect(
      runtime.get(editor, ContactsBehavior, GRACE),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('answers a get the policy denies exactly as a get of a missing row', async () => {
    const denied = await visibleError(
      runtime.get(stranger, ContactsBehavior, ADA),
    );
    expect(denied).toEqual(
      await visibleError(runtime.get(editor, ContactsBehavior, MISSING)),
    );
    expect(denied).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('records a rename, and nothing for an update that keeps the name', async () => {
    expect(
      await runtime.update(
        editor,
        ContactsBehavior,
        ADA,
        contact({ name: 'Ada Lovelace' }),
      ),
    ).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
    await runtime.update(
      editor,
      ContactsBehavior,
      ADA,
      contact({ priority: 2 }),
    );
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
      runtime.update(
        editor,
        ContactsBehavior,
        ARCHIVED,
        contact({ name: 'New' }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONTACT_ARCHIVED',
      errors: [{ path: ['data', 'attributes', 'name'] }],
    });
    expect(
      await runtime.update(
        editor,
        ContactsBehavior,
        ARCHIVED,
        contact({ priority: 1 }),
      ),
    ).toMatchObject({ name: 'Old Name', priority: 1 });
  });

  it('removes a contact with its event, and finds no row of another organization to change', async () => {
    await runtime.remove(editor, ContactsBehavior, ARCHIVED);
    expect(await database.events()).toEqual([
      { name: 'contact.removed', version: 1, payload: { id: ARCHIVED } },
    ]);
    await expect(
      runtime.get(editor, ContactsBehavior, ARCHIVED),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      runtime.update(
        editor,
        ContactsBehavior,
        GRACE,
        contact({ name: 'Taken' }),
      ),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await expect(
      runtime.remove(editor, ContactsBehavior, GRACE),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(await database.contacts(2)).toBe(1);
  });

  it("answers CONFLICT for a remove a referencing row's SET NULL cannot follow, and keeps the row", async () => {
    // Ada's meeting has no notes, so meetings_contact_or_notes refuses the
    // meeting without its contact that ON DELETE SET NULL would leave.
    await expect(
      runtime.remove(editor, ContactsBehavior, ADA),
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
    const unscoped = await visibleDatabaseError(
      database.transact(async (client) =>
        client.query('select count(*) from contacts', []),
      ),
    );
    // A session that never set the parameter has none (42704); once a
    // transaction-local setting ended, it holds '' (22P02 as bigint).
    expect(['42704', '22P02']).toContain(unscoped);
    expect(
      await database.transact(async (client) => {
        await client.query(
          "select set_config('app.organization_id', '2', true)",
          [],
        );
        return client.query('select name from contacts', []);
      }),
    ).toEqual([{ name: 'Grace' }]);
  });
});

/** The SQLSTATE a database statement rejected with. */
async function visibleDatabaseError(
  promise: Promise<unknown>,
): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return typeof error === 'object' && error !== null
      ? Reflect.get(error, 'code')
      : undefined;
  }
  throw new Error('the statement succeeded');
}
