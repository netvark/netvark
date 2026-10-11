/**
 * The runtime over a partitioned table (resource SPEC 9.5 and 12.3): what
 * PostgreSQL raises for a call names the partition that stores it, one of
 * them in another schema and two levels down, and the runtime still
 * answers with the declared code of `calls`, because its failure path has
 * the adapter resolve the partitioned table's names first. A contact no
 * row is never reaches the foreign key: the runtime's lookup answers it
 * with the same code (`runtime-targets.e2e.test.ts`), and
 * `errors-partitions.e2e.test.ts` raises the foreign key through each
 * partition.
 */
import type { RuntimeDatabase } from './runtime/database.ts';
import type { ResourceInput } from './runtime/input.ts';
import type { Runtime } from './runtime/runtime.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ADA } from './runtime/database.ts';
import { CallsBehavior } from './runtime/domain.ts';
import { editor, openRuntime } from './runtime/fixture.ts';

/** An id each partition of `calls` stores (`errors-partitions.e2e.test.ts`). */
const PARTITIONS = [
  ['calls_even', '00000000-0000-4000-8000-0000000000c1'],
  ['archive.calls_odd_1', '00000000-0000-4000-8000-0000000000c8'],
  ['archive.calls_odd_3', '00000000-0000-4000-8000-0000000000c2'],
] as const;

/** A call as `@netvark/jsonapi-core` parses its resource object. */
function call(id: string, contact: string): ResourceInput {
  return {
    id,
    attributes: { minutes: 5, note: 'Called back' },
    relationships: { contact: { type: 'contacts', id: contact } },
  };
}

describe('the runtime over the partitions of calls', () => {
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

  it.each(PARTITIONS)(
    'answers a client id %s already stores with the code of the primary key of calls',
    async (_partition, id) => {
      await runtime.create(editor, CallsBehavior, call(id, ADA));
      await expect(
        runtime.create(editor, CallsBehavior, call(id, ADA)),
      ).rejects.toMatchObject({
        status: 409,
        code: 'CALLS_PKEY',
        errors: [{ path: ['data', 'id'] }],
      });
    },
  );

  it('creates and reads a call through the partitioned table', async () => {
    const [, id] = PARTITIONS[1];
    const created = await runtime.create(editor, CallsBehavior, call(id, ADA));
    expect(created).toEqual({
      id,
      minutes: 5,
      note: 'Called back',
      contact: ADA,
    });
    expect(await runtime.get(editor, CallsBehavior, id)).toEqual(created);
  });
});
