/**
 * Atomic Operations over a socket (epic #32; resource SPEC 19.4, jsonapi
 * SPEC 11): an operations request commits every operation once, with its
 * events after the commit, or none, answering the first failure at its
 * operation's pointer in the request's language. Every answer is held to
 * the document the server serves.
 * @ref https://jsonapi.org/ext/atomic/#processing
 */
import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runtimeDatabases } from '../runtime/database.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import { problemsOf } from '../support/slice-answers.ts';

const OPERATIONS = '/api/operations';
const ATOMIC = 'application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"';

/** The results of an operations request that added contacts. */
interface Results {
  readonly 'atomic:results': ReadonlyArray<{
    readonly data: {
      readonly id: string;
      readonly attributes: {
        readonly name: string;
        readonly createdAt: string;
      };
    };
  }>;
}

/** An add of a contact with `attributes`. */
function add(attributes: Record<string, unknown>) {
  return { op: 'add', data: { type: 'contacts', attributes } };
}

describe.each(runtimeDatabases())(
  'on %s, operations requests over a socket',
  (_name, open) => {
    let database: RuntimeDatabase;
    let server: ContactsServer;
    const globex = { actor: 'globex', accept: ATOMIC, contentType: ATOMIC };

    beforeAll(async () => {
      database = await open();
      server = await openContactsServer(database);
    });
    beforeEach(async () => {
      await database.reset();
    });
    afterAll(async () => {
      await server.close();
      await database.close();
    });

    it('commits every operation once, with its events after the commit', async () => {
      const sent = await server.exchange('post', OPERATIONS, OPERATIONS, {
        ...globex,
        body: {
          'atomic:operations': [add({ name: 'Lin' }), add({ name: 'Mia' })],
        },
      });
      expect(sent.status).toBe(200);
      const { 'atomic:results': results } = sent.body as Results;
      expect(results.map(({ data }) => data.attributes.name)).toEqual([
        'Lin',
        'Mia',
      ]);
      // One transaction, so one creation time.
      const times = results.map(({ data }) => data.attributes.createdAt);
      expect(new Set(times).size).toBe(1);
      expect(await database.contacts(2)).toBe(3);
      expect(await database.events()).toEqual(
        results.map(({ data }) => ({
          name: 'contact.created',
          version: 1,
          payload: { id: data.id, name: data.attributes.name },
        })),
      );
    });

    it("rolls every operation back on a failure, answered at its operation's pointer", async () => {
      const sent = await server.exchange('post', OPERATIONS, OPERATIONS, {
        ...globex,
        language: 'de',
        body: {
          'atomic:operations': [
            add({ name: 'Ops' }),
            add({ name: 'Grace Twin', email: 'grace@example.com' }),
          ],
        },
      });
      expect(problemsOf(sent)).toEqual([
        409,
        [
          '409',
          'CONTACT_EMAIL_TAKEN',
          '/atomic:operations/1/data/attributes/email',
          'E-Mail vergeben',
          'E-Mail gehört bereits einem anderen Kontakt.',
        ],
      ]);
      expect(await database.contacts(2)).toBe(1);
      expect(await database.events()).toEqual([]);
    });
  },
);
