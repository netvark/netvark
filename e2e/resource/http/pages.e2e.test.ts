/**
 * Pages of a search over a socket (epic #32; resource SPEC 11, 19.6;
 * keyset SPEC 6.1): contacts that tie on every sort member page by their
 * key, so following the next links of a search visits each match once, in
 * the order one page holds them all, and a previous link returns the page
 * before; a cursor is bound to the organization it was made in, so a
 * member of another cannot seek with it; and a query with several
 * problems answers 400 with each one's code and parameter, in the
 * request's language. Every answer is held to the document the server
 * serves.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 */
import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';
import type { Sent } from '../support/http.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runtimeDatabases } from '../runtime/database.ts';
import { ARCHIVED } from '../runtime/seed.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import { linkOf, pageIds, problemsOf } from '../support/slice-answers.ts';

const CONTACTS = '/api/contacts';
const OPERATIONS = '/api/operations';
const ATOMIC = 'application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"';
const TIES = 6;
const SEARCH = '/api/contacts?filter[q]=tie';

/** One request that adds `count` archived contacts named Tie, so they share `created_at`. */
function ties(count: number) {
  return {
    'atomic:operations': Array.from({ length: count }, () => ({
      op: 'add',
      data: {
        type: 'contacts',
        attributes: { name: 'Tie', nickname: 'tie', status: 'archived' },
      },
    })),
  };
}

/** Each primary resource's `createdAt`. */
function createdAts(sent: Sent): Array<unknown> {
  const { data } = sent.body as {
    data: Array<{ attributes: { createdAt: unknown } }>;
  };
  return data.map((item) => item.attributes.createdAt);
}

describe.each(runtimeDatabases())(
  'on %s, the pages of the contacts over a socket',
  (_name, open) => {
    let database: RuntimeDatabase;
    let server: ContactsServer;
    const globex = { actor: 'globex' };

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

    it('follows the next links of a search through every match once, in order', async () => {
      const added = await server.exchange('post', OPERATIONS, OPERATIONS, {
        ...globex,
        accept: ATOMIC,
        contentType: ATOMIC,
        body: ties(TIES),
      });
      expect(added.status).toBe(200);
      const whole = await server.exchange(
        'get',
        CONTACTS,
        `${SEARCH}&page[size]=10`,
        globex,
      );
      const all = pageIds(whole);
      expect(all).toHaveLength(TIES);
      // They tie on the name and on created_at, so the key orders them.
      expect(new Set(createdAts(whole)).size).toBe(1);
      expect(all).toEqual(all.toSorted());
      const pages: Array<Sent> = [];
      let url: string | undefined = `${SEARCH}&page[size]=2`;
      while (url !== undefined) {
        const page = await server.exchange('get', CONTACTS, url, globex);
        pages.push(page);
        url = linkOf(page, 'next');
      }
      expect(pages.map((page) => pageIds(page).length)).toEqual([2, 2, 2]);
      expect(pages.flatMap((page) => pageIds(page))).toEqual(all);
      const last = pages.at(-1);
      const prev = last === undefined ? undefined : linkOf(last, 'prev');
      expect(prev).toMatch(/[?&]page%5Bbefore%5D=/u);
      const before = await server.exchange('get', CONTACTS, prev ?? '', globex);
      expect(pageIds(before)).toEqual(pageIds(pages[1] as Sent));
      expect(await database.contacts(2)).toBe(1 + TIES);
    });

    it("answers each problem of a query with its code and parameter, in the request's language", async () => {
      const url = '/api/contacts?filter[nickname]=x&page[size]=0&sort=bogus';
      const german = await server.exchange('get', CONTACTS, url, {
        actor: 'editor',
        language: 'de',
      });
      expect(problemsOf(german)).toEqual([
        400,
        [
          '400',
          'INVALID_QUERY_PARAMETER',
          'filter[nickname]',
          'Ungültiger Abfrageparameter',
          'Ein Abfrageparameter hat einen Wert, den der Server nicht verarbeiten kann.',
        ],
        [
          '400',
          'INVALID_QUERY_PARAMETER',
          'page[size]',
          'Ungültiger Abfrageparameter',
          'Ein Abfrageparameter hat einen Wert, den der Server nicht verarbeiten kann.',
        ],
        [
          '400',
          'UNSUPPORTED_SORT',
          'sort',
          'Nicht unterstützte Sortierung',
          'Der Server kann nicht nach den angefragten Feldern sortieren.',
        ],
      ]);
      const english = await server.exchange('get', CONTACTS, url, {
        actor: 'editor',
        language: 'en',
      });
      expect(problemsOf(english)).toEqual([
        400,
        [
          '400',
          'INVALID_QUERY_PARAMETER',
          'filter[nickname]',
          'Invalid Query Parameter',
          'A query parameter has a value the server cannot process.',
        ],
        [
          '400',
          'INVALID_QUERY_PARAMETER',
          'page[size]',
          'Invalid Query Parameter',
          'A query parameter has a value the server cannot process.',
        ],
        [
          '400',
          'UNSUPPORTED_SORT',
          'sort',
          'Unsupported Sort',
          'The server cannot sort by the requested fields.',
        ],
      ]);
    });

    it('refuses a cursor made in another organization', async () => {
      const acme = await server.exchange(
        'get',
        CONTACTS,
        '/api/contacts?page[size]=1',
        { actor: 'editor' },
      );
      const next = linkOf(acme, 'next') ?? '';
      expect(next).toMatch(/[?&]page%5Bafter%5D=/u);
      const elsewhere = await server.exchange('get', CONTACTS, next, globex);
      expect(problemsOf(elsewhere)).toEqual([
        400,
        [
          '400',
          'INVALID_QUERY_PARAMETER',
          'page[after]',
          'Invalid Query Parameter',
          'A query parameter has a value the server cannot process.',
        ],
      ]);
      const own = await server.exchange('get', CONTACTS, next, {
        actor: 'editor',
      });
      expect(pageIds(own)).toEqual([ARCHIVED]);
    });
  },
);
