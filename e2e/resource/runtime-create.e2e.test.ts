import type { RuntimeDatabase } from './runtime/database.ts';
/**
 * The server subpath composes into a runtime (resource SPEC 12.3): the
 * minimal runtime of `runtime/` creates contacts over the reference
 * adapter on PGlite, as the application's role. A create passes the input
 * check, the policy, the plan's rule, the quota, and the database's unique
 * key, and records its event with the row; a failure anywhere, an
 * effect's included, writes nothing.
 */
import type { AppDomain } from './runtime/domain.ts';
import type { Runtime } from './runtime/runtime.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDomainDefiners } from '@netvark/resource-core/server';

import { Contacts } from './resources/contacts.ts';
import { ContactsBehavior, contactsPolicy } from './runtime/domain.ts';
import {
  contact,
  editor,
  globex,
  openRuntime,
  viewer,
} from './runtime/fixture.ts';

describe('a runtime over the server subpath creates a contact', () => {
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

  it("in the actor's organization, and records its event with it", async () => {
    const row = await runtime.create(
      editor,
      ContactsBehavior,
      contact({ name: 'Bea', email: 'bea@example.com', tags: ['vip', 'NULL'] }),
    );
    expect(row).toMatchObject({
      name: 'Bea',
      email: 'bea@example.com',
      kind: 'person',
      status: 'active',
      discount: '0.00',
      tags: ['vip', 'NULL'],
      priority: null,
      organization: '1',
    });
    expect(await database.events()).toEqual([
      {
        name: 'contact.created',
        version: 1,
        payload: { id: row.id, name: 'Bea' },
      },
    ]);
    expect(await database.contacts(1)).toBe(3);
  });

  it('after checking the input, with an item per issue', async () => {
    await expect(
      runtime.create(editor, ContactsBehavior, contact({ name: '' })),
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [{ path: ['data', 'attributes', 'name'] }],
    });
  });

  it('only when the policy allows it: FORBIDDEN, and nothing written', async () => {
    await expect(
      runtime.create(viewer, ContactsBehavior, contact({ name: 'Bea' })),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(await database.contacts(1)).toBe(2);
    expect(await database.events()).toEqual([]);
  });

  it("of a company only on a plan with companies: the rule's code at its member", async () => {
    const company = contact({ name: 'Initech', kind: 'company' });
    await expect(
      runtime.create(editor, ContactsBehavior, company),
    ).rejects.toMatchObject({
      status: 402,
      code: 'PLAN_UPGRADE_REQUIRED',
      detail: 'Company contacts need a plan that includes them.',
      errors: [{ path: ['data', 'attributes', 'kind'] }],
    });
    expect(
      await runtime.create(globex, ContactsBehavior, company),
    ).toMatchObject({ kind: 'company', organization: '2' });
  });

  it('only within the quota: QUOTA_EXCEEDED past it', async () => {
    await runtime.create(editor, ContactsBehavior, contact({ name: 'Bea' }));
    await expect(
      runtime.create(editor, ContactsBehavior, contact({ name: 'Cy' })),
    ).rejects.toMatchObject({ status: 403, code: 'QUOTA_EXCEEDED' });
    expect(await database.contacts(1)).toBe(3);
    expect(await database.events()).toHaveLength(1);
  });

  it("with an email no other contact of the organization has: the database's refusal as its declared code", async () => {
    const taken = contact({ name: 'Bea', email: 'ADA@example.com' });
    await expect(
      runtime.create(editor, ContactsBehavior, taken),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONTACT_EMAIL_TAKEN',
      errors: [{ path: ['data', 'attributes', 'email'] }],
    });
    expect(await database.events()).toEqual([]);
    await runtime.create(globex, ContactsBehavior, taken);
  });

  it('and rolls it back when an effect fails, passing the failure on unchanged', async () => {
    const outage = new Error('the event schema registry is down');
    const { defineResource } = createDomainDefiners<AppDomain>();
    const failing = defineResource(Contacts, {
      policy: contactsPolicy,
      operations: {
        create: {
          effects: [
            () => {
              throw outage;
            },
          ],
        },
      },
    });
    await expect(
      runtime.create(editor, failing, contact({ name: 'Bea' })),
    ).rejects.toBe(outage);
    expect(await database.contacts(1)).toBe(2);
    expect(await database.events()).toEqual([]);
  });
});
