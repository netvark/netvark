/**
 * Ids outside the key's form (resource SPEC 3.4, 12.3): no row has a URL id
 * the key's form refuses, so a get, an update, and a remove answer 404
 * without a query, another spelling PostgreSQL would read as the same key
 * included; a create's client id outside the form is a 422 at `/data/id`,
 * which the documented request schema refuses too, where PostgreSQL would
 * refuse the text or store the key under its own spelling. Each answer is
 * one the OpenAPI document lists.
 * @ref https://jsonapi.org/format/1.1/#fetching-resources-responses-404
 * @ref https://jsonapi.org/format/1.1/#crud-updating-responses-404
 * @ref https://jsonapi.org/format/1.1/#crud-deleting-responses-404
 * @ref https://jsonapi.org/format/1.1/#crud-creating-client-ids
 * @ref https://www.postgresql.org/docs/18/datatype-uuid.html
 */
import type { ApiSession } from './support/api-session.ts';
import type { Method } from './support/openapi-contract.ts';
import type { Refusal } from './support/refusals.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ADA } from './runtime/database.ts';
import { openApiSession } from './support/api-session.ts';
import {
  CALLS,
  CONTACT,
  call,
  expectRefusal,
  update,
} from './support/refusals.ts';

const OK = 200;
const NOT_FOUND = 404;
const UNPROCESSABLE = 422;
const MALFORMED = 'not-a-uuid';
/** ADA's key without hyphens, which PostgreSQL reads as the same uuid. */
const UNHYPHENATED = ADA.replaceAll('-', '');
const NOTE = { minutes: 3, note: 'Hello.' };

function member(name: string, method: Method, id: string): Refusal {
  return {
    name,
    method,
    path: CONTACT,
    url: `/api/contacts/${id}`,
    request: { actor: 'editor' },
    status: NOT_FOUND,
    code: 'NOT_FOUND',
  };
}

function created(name: string, id: string): Refusal {
  return {
    name,
    method: 'post',
    path: CALLS,
    url: CALLS,
    request: { actor: 'editor', body: call(id, NOTE, ADA) },
    status: UNPROCESSABLE,
    code: 'VALIDATION_FAILED',
  };
}

const REFUSALS: ReadonlyArray<Refusal> = [
  member('a get of an id outside the form', 'get', MALFORMED),
  member('a get of a key spelled without hyphens', 'get', UNHYPHENATED),
  member('a remove of an id outside the form', 'delete', MALFORMED),
  member('a remove of a key spelled without hyphens', 'delete', UNHYPHENATED),
  created('a call under a client id outside the form', MALFORMED),
  created(
    'a call under a client id spelled without hyphens',
    '00000000000040008000000000000c01',
  ),
];

describe("ids outside the key's form", () => {
  let session: ApiSession;

  beforeAll(async () => {
    session = await openApiSession();
  });
  beforeEach(async () => {
    await session.database.reset();
  });
  afterAll(async () => {
    await session.database.close();
  });

  it.each(REFUSALS)('$name', async (refusal) => {
    const sent = await expectRefusal(session, refusal);
    if (refusal.method === 'post') {
      expect(sent.body).toMatchObject({
        errors: [{ source: { pointer: '/data/id' } }],
      });
    }
  });

  it('an update of an id outside the form, which its document repeats', async () => {
    const sent = await session.exchange(
      'patch',
      CONTACT,
      `/api/contacts/${MALFORMED}`,
      {
        actor: 'editor',
        body: update(MALFORMED, { nickname: 'Countess' }),
      },
    );
    expect(sent.status).toBe(NOT_FOUND);
    expect(sent.body).toMatchObject({ errors: [{ code: 'NOT_FOUND' }] });
  });

  it('leaves the row a remove of another spelling would have named', async () => {
    await expectRefusal(session, member('the remove', 'delete', UNHYPHENATED));
    const kept = await session.exchange(
      'get',
      CONTACT,
      `/api/contacts/${ADA}`,
      {
        actor: 'editor',
      },
    );
    expect(kept.status).toBe(OK);
  });
});
