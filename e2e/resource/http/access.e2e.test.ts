/**
 * Who reaches which contacts over a socket (epic #32; resource SPEC 13,
 * 19.6): row security keeps each organization's contacts its own, so a
 * member reads, updates, and removes none of another organization's,
 * which answer 404 as if they did not exist, and lists none; and the
 * policies refuse what a member's permissions do not grant, a create, a
 * list, or an include with 403 and an update or a remove with 404, while
 * a request that names no actor answers 401 in its language. Every
 * answer is held to the document the server serves, and no refusal
 * changes a row.
 * @ref https://www.postgresql.org/docs/18/ddl-rowsecurity.html
 * @ref https://jsonapi.org/format/1.1/#fetching-includes ("If a server is unable to identify a relationship path or does not support inclusion of resources from a path, it MUST respond with 400 Bad Request.")
 */
import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runtimeDatabases } from '../runtime/database.ts';
import { ADA, ARCHIVED, GRACE } from '../runtime/seed.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import { attributesOf, pageIds, problemsOf } from '../support/slice-answers.ts';

const CONTACT = '/api/contacts/{id}';
const CONTACTS = '/api/contacts';

const NOT_FOUND = [
  404,
  ['404', 'NOT_FOUND', undefined, 'Not Found', 'The resource does not exist.'],
];
const FORBIDDEN = [
  403,
  ['403', 'FORBIDDEN', undefined, 'Forbidden', 'The request is not allowed.'],
];
const UNAUTHORIZED = [
  401,
  [
    '401',
    'UNAUTHORIZED',
    undefined,
    'Unauthorized',
    'The request names no actor the server knows.',
  ],
];

/** An update's request document of `id`'s `attributes`. */
function update(id: string, attributes: Record<string, unknown>) {
  return { data: { type: 'contacts', id, attributes } };
}

describe.each(runtimeDatabases())(
  'on %s, who reaches the contacts over a socket',
  (_name, open) => {
    let database: RuntimeDatabase;
    let server: ContactsServer;

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

    it("keeps each organization's contacts its own", async () => {
      const url = `/api/contacts/${GRACE}`;
      const editor = { actor: 'editor' };
      const read = await server.exchange('get', CONTACT, url, editor);
      expect(problemsOf(read)).toEqual(NOT_FOUND);
      const renamed = await server.exchange('patch', CONTACT, url, {
        ...editor,
        body: update(GRACE, { name: 'Mine now' }),
      });
      expect(problemsOf(renamed)).toEqual(NOT_FOUND);
      const removed = await server.exchange('delete', CONTACT, url, editor);
      expect(problemsOf(removed)).toEqual(NOT_FOUND);
      const acme = await server.exchange('get', CONTACTS, CONTACTS, editor);
      expect(pageIds(acme)).toEqual([ADA, ARCHIVED]);
      const globex = await server.exchange('get', CONTACTS, CONTACTS, {
        actor: 'globex',
      });
      expect(pageIds(globex)).toEqual([GRACE]);
      const grace = await server.exchange('get', CONTACT, url, {
        actor: 'globex',
      });
      expect(attributesOf(grace)).toMatchObject({ name: 'Grace' });
      expect(await database.contacts(2)).toBe(1);
    });

    it("refuses what a member's permissions do not grant", async () => {
      const viewer = { actor: 'viewer' };
      const url = `/api/contacts/${ADA}`;
      const created = await server.exchange('post', CONTACTS, CONTACTS, {
        ...viewer,
        body: { data: { type: 'contacts', attributes: { name: 'Lin' } } },
      });
      expect(problemsOf(created)).toEqual(FORBIDDEN);
      const renamed = await server.exchange('patch', CONTACT, url, {
        ...viewer,
        body: update(ADA, { name: 'Not yours' }),
      });
      expect(problemsOf(renamed)).toEqual(NOT_FOUND);
      const removed = await server.exchange('delete', CONTACT, url, viewer);
      expect(problemsOf(removed)).toEqual(NOT_FOUND);
      const read = await server.exchange('get', CONTACT, url, viewer);
      expect(attributesOf(read)).toMatchObject({ name: 'Ada' });
      const stranger = { actor: 'stranger' };
      const listed = await server.exchange('get', CONTACTS, CONTACTS, stranger);
      expect(problemsOf(listed)).toEqual(FORBIDDEN);
      const hidden = await server.exchange('get', CONTACT, url, stranger);
      expect(problemsOf(hidden)).toEqual(NOT_FOUND);
      expect(await database.contacts(1)).toBe(2);
      const after = await server.exchange('get', CONTACT, url, viewer);
      expect(attributesOf(after)).toEqual(attributesOf(read));
    });

    it('includes the organization only for a member who may read it', async () => {
      const url = `/api/contacts/${ADA}?include=organization`;
      const editor = await server.exchange('get', CONTACT, url, {
        actor: 'editor',
      });
      expect(problemsOf(editor)).toEqual([
        403,
        [
          '403',
          'FORBIDDEN',
          'include',
          'Forbidden',
          'The request is not allowed.',
        ],
      ]);
      const manager = await server.exchange('get', CONTACT, url, {
        actor: 'manager',
      });
      expect(manager.status).toBe(200);
      expect(manager.body).toMatchObject({
        data: {
          relationships: {
            organization: { data: { type: 'organizations', id: '1' } },
          },
        },
        included: [
          { type: 'organizations', id: '1', attributes: { name: 'Acme' } },
        ],
      });
    });

    it('answers a request that names no actor, or one it does not know, 401 in its language', async () => {
      const anonymous = await server.exchange('get', CONTACTS, CONTACTS);
      expect(problemsOf(anonymous)).toEqual(UNAUTHORIZED);
      const unknown = await server.exchange('get', CONTACTS, CONTACTS, {
        actor: 'mallory',
      });
      expect(problemsOf(unknown)).toEqual(UNAUTHORIZED);
      const german = await server.exchange('get', CONTACTS, CONTACTS, {
        language: 'de',
      });
      expect(problemsOf(german)).toEqual([
        401,
        [
          '401',
          'UNAUTHORIZED',
          undefined,
          'Nicht angemeldet',
          'Die Anfrage nennt keinen Akteur, den der Server kennt.',
        ],
      ]);
    });
  },
);
