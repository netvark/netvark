/**
 * Relationship targets in the actor's scope (resource SPEC 9.5 and 12.3):
 * PostgreSQL checks the foreign key of `calls` without row security, so a
 * write alone would let an Acme call name Globex's Grace, while a contact
 * no row is fails it. The runtime looks the contact up as the actor,
 * under the scope predicate and the policy of `contacts`, and answers
 * Grace exactly as a missing contact, before anything is written, so the
 * answer tells Acme nothing of Globex's ids.
 */
import type { RuntimeDatabase } from './runtime/database.ts';
import type { ResourceInput } from './runtime/input.ts';
import type { Runtime } from './runtime/runtime.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ADA, GRACE } from './runtime/database.ts';
import { CallsBehavior } from './runtime/domain.ts';
import {
  editor,
  globex,
  openRuntime,
  visibleError,
} from './runtime/fixture.ts';

const NO_CONTACT = '00000000-0000-4000-8000-00000000dead';
const CALL = '00000000-0000-4000-8000-0000000000c1';
const OTHER_CALL = '00000000-0000-4000-8000-0000000000c2';

/** A call as `@netvark/jsonapi-core` parses its resource object. */
function call(contact: string, id = CALL): ResourceInput {
  return {
    id,
    attributes: { minutes: 5, note: 'Called back' },
    relationships: { contact: { type: 'contacts', id: contact } },
  };
}

describe("the runtime looks relationship targets up in the actor's scope", () => {
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

  it("answers another organization's contact exactly as a missing one, and writes nothing", async () => {
    const foreign = await visibleError(
      runtime.create(editor, CallsBehavior, call(GRACE)),
    );
    expect(foreign).toEqual(
      await visibleError(
        runtime.create(editor, CallsBehavior, call(NO_CONTACT)),
      ),
    );
    expect(foreign).toMatchObject({
      status: 404,
      code: 'CALLS_CONTACT_ID_FKEY',
      errors: [{ path: ['data', 'relationships', 'contact'] }],
    });
    await expect(
      runtime.get(editor, CallsBehavior, CALL),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it("writes a call naming a contact of the actor's organization", async () => {
    await expect(
      runtime.create(globex, CallsBehavior, call(GRACE)),
    ).resolves.toMatchObject({ id: CALL, contact: GRACE });
    await expect(
      runtime.create(editor, CallsBehavior, call(ADA, OTHER_CALL)),
    ).resolves.toMatchObject({ id: OTHER_CALL, contact: ADA });
  });
});
