/**
 * The members each write of the contacts application's API accepts
 * (resource SPEC 9.4): a create or an update carrying a member its
 * operation does not write, a read-only one or an immutable one on update,
 * is a 403 at the member, which the OpenAPI document lists, and beside any
 * other refusal of the document one 400 that holds both. The documented
 * request schema refuses the same documents, while a policy's 403 points
 * at no member and passes it (`support/refusals.ts`).
 * @ref https://jsonapi.org/format/1.1/#crud-creating-responses-403
 * @ref https://jsonapi.org/format/1.1/#crud-updating-responses-403
 */
import type { ApiSession } from './support/api-session.ts';
import type { Refusal } from './support/refusals.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ADA } from './runtime/database.ts';
import { APP_CONTRACT, openApiSession } from './support/api-session.ts';
import {
  CONTACT,
  CONTACTS,
  contact,
  expectRefusal,
  update,
} from './support/refusals.ts';

const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const CREATED_AT = '2026-01-01T00:00:00Z';

interface MemberRefusal {
  readonly name: string;
  readonly method: 'post' | 'patch';
  readonly body: object;
  /** Where the error object points: the member. */
  readonly pointer: string;
}

const REFUSALS: ReadonlyArray<MemberRefusal> = [
  {
    name: 'a create with a read-only field',
    method: 'post',
    body: contact({ name: 'Bea', createdAt: CREATED_AT }),
    pointer: '/data/attributes/createdAt',
  },
  {
    name: 'a create with a read-only relationship',
    method: 'post',
    body: contact(
      { name: 'Bea' },
      {
        relationships: {
          organization: { data: { type: 'organizations', id: '1' } },
        },
      },
    ),
    pointer: '/data/relationships/organization',
  },
  {
    name: 'an update of an immutable field',
    method: 'patch',
    body: update(ADA, { kind: 'company' }),
    pointer: '/data/attributes/kind',
  },
  {
    name: 'an update of a read-only field',
    method: 'patch',
    body: update(ADA, { createdAt: CREATED_AT }),
    pointer: '/data/attributes/createdAt',
  },
];

function refusal({ name, method, body }: MemberRefusal): Refusal {
  const creates = method === 'post';
  return {
    name,
    method,
    path: creates ? CONTACTS : CONTACT,
    url: creates ? CONTACTS : `/api/contacts/${ADA}`,
    request: { actor: 'editor', body },
    status: FORBIDDEN,
    code: 'FORBIDDEN',
  };
}

describe('the members each write accepts', () => {
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

  it.each(REFUSALS)('$name', async (member) => {
    const sent = await expectRefusal(session, refusal(member));
    expect(sent.body).toMatchObject({
      errors: [{ source: { pointer: member.pointer } }],
    });
  });

  it('a member the create does not write beside one the resource does not declare', async () => {
    const body = contact({ name: 'Bea', colour: 'red', createdAt: CREATED_AT });
    const sent = await session.exchange('post', CONTACTS, CONTACTS, {
      actor: 'editor',
      body,
    });
    expect(sent.status).toBe(BAD_REQUEST);
    expect(sent.body).toMatchObject({
      errors: [
        {
          code: 'INVALID_DOCUMENT',
          source: { pointer: '/data/attributes/colour' },
        },
        {
          code: 'FORBIDDEN',
          source: { pointer: '/data/attributes/createdAt' },
        },
      ],
    });
    expect(APP_CONTRACT.request('post', CONTACTS, body)).not.toEqual([]);
  });
});
