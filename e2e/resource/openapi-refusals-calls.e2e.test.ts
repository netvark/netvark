/**
 * Every refusal of a call's create is one the contacts application's
 * OpenAPI document lists (resource SPEC 13.1): calls are stored in
 * partitions under the client's id, so a duplicate id reaches a
 * partition's primary key and a missing contact the partition's foreign
 * key, each mapped to the partitioned table's code (SPEC 9.5); a value
 * outside a CHECK and a missing required relationship are the schemas'
 * refusals, which the documented request schema shares
 * (`support/refusals.ts`).
 * @ref https://www.postgresql.org/docs/18/ddl-partitioning.html
 */
import type { ApiSession } from './support/api-session.ts';
import type { Refusal } from './support/refusals.ts';

import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { ADA } from './runtime/database.ts';
import { openApiSession } from './support/api-session.ts';
import { CALLS, call, expectRefusal, MISSING } from './support/refusals.ts';

const NOT_FOUND = 404;
const CONFLICT = 409;
const UNPROCESSABLE = 422;
const NOTE = { minutes: 3, note: 'Hello.' };

function create(
  name: string,
  body: object,
  status: number,
  code: string,
): Refusal {
  const request = { actor: 'editor', body };
  return {
    name,
    method: 'post',
    path: CALLS,
    url: CALLS,
    request,
    status,
    code,
  };
}

const REFUSALS: ReadonlyArray<Refusal> = [
  create(
    'a call to a missing contact (a foreign key)',
    call('00000000-0000-4000-8000-00000000c002', NOTE, MISSING),
    NOT_FOUND,
    'CALLS_CONTACT_ID_FKEY',
  ),
  create(
    'a call of no minutes',
    call('00000000-0000-4000-8000-00000000c003', { ...NOTE, minutes: 0 }, ADA),
    UNPROCESSABLE,
    'VALIDATION_FAILED',
  ),
  create(
    'a call without its required contact',
    call('00000000-0000-4000-8000-00000000c004', NOTE),
    UNPROCESSABLE,
    'VALIDATION_FAILED',
  ),
];

describe("every refusal of a call's create is one the OpenAPI document lists", () => {
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
    await expectRefusal(session, refusal);
  });

  it("a call under an id another call has (a partition's primary key)", async () => {
    const body = call('00000000-0000-4000-8000-00000000c009', NOTE, ADA);
    await session.exchange('post', CALLS, CALLS, { actor: 'editor', body });
    await expectRefusal(
      session,
      create('the second', body, CONFLICT, 'CALLS_PKEY'),
    );
  });
});
