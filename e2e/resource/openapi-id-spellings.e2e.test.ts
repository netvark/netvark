/**
 * Ids in another spelling of a key (resource SPEC 3.4, 12.3): a uuid key
 * takes its hex digits in either case (RFC 9562 section 4) and names one
 * row in each, so a get, an update, and a remove of a contact whose key is
 * spelled in upper case answer as the key's own spelling would, each
 * document giving the id as the server sends it, in lower case. An
 * update's document may repeat the key in either spelling, and one that
 * names another contact is a conflict. A call created under an upper-case
 * client id answers 201 with the lower-case id and its Location, and a
 * create under the lower-case spelling is the same key's conflict. Each
 * answer is one the OpenAPI document lists.
 * @ref https://www.rfc-editor.org/rfc/rfc9562#section-4
 * @ref https://jsonapi.org/format/1.1/#crud-updating-responses-409
 * @ref https://www.postgresql.org/docs/18/datatype-uuid.html
 */
import type { ApiSession } from './support/api-session.ts';
import type { Sent } from './support/http.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ADA, ARCHIVED } from './runtime/seed.ts';
import { APP_CONTRACT, openApiSession } from './support/api-session.ts';
import {
  CALLS,
  CONTACT,
  call,
  expectRefusal,
  update,
} from './support/refusals.ts';

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;
const NOT_FOUND = 404;
const CONFLICT = 409;
const CALL_PATH = '/api/calls/{id}';
const SPELLED = ARCHIVED.toUpperCase();
const CALL = '00000000-0000-4000-8000-00000000c0de';
const NOTE = { minutes: 3, note: 'Hello.' };

/** The primary data's id and self link. */
const RESOURCE = z.object({
  data: z.object({ id: z.string(), links: z.object({ self: z.string() }) }),
});

function idOf(sent: Sent): string {
  return RESOURCE.parse(sent.body).data.id;
}

function selfOf(sent: Sent): string {
  return RESOURCE.parse(sent.body).data.links.self;
}

describe('ids in another spelling of the key', () => {
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

  it('gets a contact by its key in upper case, answering with the key in lower case', async () => {
    expect(SPELLED).not.toBe(ARCHIVED);
    const sent = await session.exchange(
      'get',
      CONTACT,
      `/api/contacts/${SPELLED}`,
      { actor: 'viewer' },
    );
    expect(sent.status).toBe(OK);
    expect(idOf(sent)).toBe(ARCHIVED);
    expect(selfOf(sent).endsWith(`/api/contacts/${ARCHIVED}`)).toBe(true);
  });

  it.each([
    ['the URL', SPELLED],
    ['the server', ARCHIVED],
  ])(
    'updates it by its key in upper case, the document spelling the key as %s does',
    async (_name, id) => {
      const sent = await session.exchange(
        'patch',
        CONTACT,
        `/api/contacts/${SPELLED}`,
        { actor: 'editor', body: update(id, { nickname: 'Old' }) },
      );
      expect(sent.status).toBe(OK);
      expect(idOf(sent)).toBe(ARCHIVED);
    },
  );

  it('refuses an update whose document names another contact', async () => {
    await expectRefusal(session, {
      name: 'the update',
      method: 'patch',
      path: CONTACT,
      url: `/api/contacts/${SPELLED}`,
      request: { actor: 'editor', body: update(ADA, { nickname: 'Old' }) },
      status: CONFLICT,
      code: 'CONFLICT',
    });
  });

  it('removes it by its key in upper case', async () => {
    const removed = await session.exchange(
      'delete',
      CONTACT,
      `/api/contacts/${SPELLED}`,
      { actor: 'editor' },
    );
    expect(removed.status).toBe(NO_CONTENT);
    const gone = await session.exchange(
      'get',
      CONTACT,
      `/api/contacts/${ARCHIVED}`,
      { actor: 'viewer' },
    );
    expect(gone.status).toBe(NOT_FOUND);
  });

  it('creates a call under an upper-case client id, answering with the key in lower case', async () => {
    const body = call(CALL.toUpperCase(), NOTE, ADA);
    expect(APP_CONTRACT.request('post', CALLS, body)).toEqual([]);
    const created = await session.exchange('post', CALLS, CALLS, {
      actor: 'editor',
      body,
    });
    expect(created.status).toBe(CREATED);
    expect(idOf(created)).toBe(CALL);
    expect(created.headers.get('Location')).toBe(selfOf(created));
    expect(selfOf(created).endsWith(`/api/calls/${CALL}`)).toBe(true);
    const got = await session.exchange(
      'get',
      CALL_PATH,
      `/api/calls/${CALL.toUpperCase()}`,
      { actor: 'viewer' },
    );
    expect(got.status).toBe(OK);
    expect(idOf(got)).toBe(CALL);
  });

  it('refuses a second call under the lower-case spelling of its key', async () => {
    const first = await session.exchange('post', CALLS, CALLS, {
      actor: 'editor',
      body: call(CALL.toUpperCase(), NOTE, ADA),
    });
    expect(first.status).toBe(CREATED);
    await expectRefusal(session, {
      name: 'the second',
      method: 'post',
      path: CALLS,
      url: CALLS,
      request: { actor: 'editor', body: call(CALL, NOTE, ADA) },
      status: CONFLICT,
      code: 'CALLS_PKEY',
    });
  });
});
