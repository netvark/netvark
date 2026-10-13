/**
 * Pages of the actor's scope (resource SPEC 12.9 obligation 12, 18.4): the
 * runtime `createResourceRuntime` boots over the application's role, on
 * PGlite and on the server `RESOURCE_PG_URL` names, pages through the
 * actor's contacts in the declared default order, counts the scope's rows
 * on request, and refuses a cursor issued in another organization as one
 * it cannot read, at the parameter that carried it, so a cursor tells
 * nothing of the rows it was issued for.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id-error-cases
 */
import type { RuntimeDatabase } from './runtime/database.ts';
import type { AppRuntime } from './runtime/fixture.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runtimeDatabases } from './runtime/database.ts';
import {
  editor,
  globex,
  openRuntime,
  visibleError,
} from './runtime/fixture.ts';
import { ADA, ARCHIVED } from './runtime/seed.ts';

describe.each(runtimeDatabases())(
  "on %s, the runtime pages through the actor's scope",
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

    it('a page at a time, in the default order, counting the scope on request', async () => {
      const contacts = runtime.as(editor).contacts;
      const first = await contacts.list({ page: { size: 1 } }, { total: true });
      expect(first).toMatchObject({
        rows: [{ id: ADA, name: 'Ada' }],
        hasNext: true,
        hasPrev: false,
        size: 1,
        total: 2,
      });
      const second = await contacts.list({
        page: { size: 1, after: first.next ?? '' },
      });
      expect(second).toMatchObject({
        rows: [{ id: ARCHIVED, name: 'Old Name' }],
        hasNext: false,
        hasPrev: true,
      });
      expect(second.total).toBeUndefined();
    });

    it('refuses a cursor issued in another organization as one it cannot read', async () => {
      const acme = await runtime
        .as(editor)
        .contacts.list({ page: { size: 1 } });
      const foreign = await visibleError(
        runtime
          .as(globex)
          .contacts.list({ page: { size: 1, after: acme.next ?? '' } }),
      );
      expect(foreign).toEqual(
        await visibleError(
          runtime
            .as(globex)
            .contacts.list({ page: { size: 1, after: 'not-a-cursor' } }),
        ),
      );
      expect(foreign).toMatchObject({
        status: 400,
        code: 'INVALID_QUERY_PARAMETER',
        errors: [{ location: 'query', path: ['page[after]'] }],
      });
    });
  },
);
