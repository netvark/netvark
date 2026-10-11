/**
 * A remove's lifecycle (resource SPEC 12.3, 18.4, 18.5): the id's form
 * before any statement, then the row read with the lock a delete takes,
 * the policy and the rules over it, the delete, and the effects with the
 * removed row.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { LOCKED, member, testDomain } from '../test-support/domain';
import {
  domainDatabase,
  domainStorage,
  outboxEvents,
  storedTask,
  taskTitles,
} from '../test-support/domain-database';
import { refusal } from '../test-support/refusal';

const statements: Array<string> = [];
const database = domainDatabase((event) => {
  statements.push(event.query.sql);
});
const storage = domainStorage(database.db);
const domain = testDomain(storage);
const MISSING = '00000000-0000-4000-8000-0000000000ff';

beforeEach(async () => {
  await database.reset();
});
afterAll(async () => {
  await database.close();
});

describe('remove (resource SPEC 18.4)', () => {
  it('removes the row and records its event', async () => {
    const id = await storedTask(storage, 'a');
    await expect(domain(member('1')).tasks.remove(id)).resolves.toBeUndefined();
    expect(await taskTitles(database.db, '1')).toEqual([]);
    expect(await outboxEvents(database.db)).toEqual([
      { name: 'task.removed', version: 1, payload: { id } },
    ]);
  });

  it('reads the row it decides on with the lock a delete takes', async () => {
    const id = await storedTask(storage, 'a');
    statements.length = 0;
    await domain(member('1')).tasks.remove(id);
    const reads = statements.filter((sql) => sql.startsWith('select "id"'));
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatch(/ for update$/u);
    expect(statements.indexOf(reads[0] ?? '')).toBeLessThan(
      statements.findIndex((sql) => sql.startsWith('delete ')),
    );
  });

  it("answers NOT_FOUND alike for a denied row, a missing one, another workspace's, and an id outside the key's form", async () => {
    const id = await storedTask(storage, 'a');
    const other = await storedTask(storage, 'o', { workspace: '2' });
    const writer = domain(member('1')).tasks;
    const refusals = await Promise.all([
      refusal(domain(member('1', ['tasks:read'])).tasks.remove(id)),
      refusal(writer.remove(MISSING)),
      refusal(writer.remove(other)),
      refusal(writer.remove('nope')),
    ]);
    expect(refusals.map(({ objects }) => objects[0]?.code)).toEqual([
      'NOT_FOUND',
      'NOT_FOUND',
      'NOT_FOUND',
      'NOT_FOUND',
    ]);
    expect(await taskTitles(database.db, '1')).toEqual(['a']);
    expect(await taskTitles(database.db, '2')).toEqual(['o']);
  });

  it("refuses with a rule's code over the stored row, removing and recording nothing", async () => {
    const id = await storedTask(storage, LOCKED);
    const { status, objects } = await refusal(
      domain(member('1')).tasks.remove(id),
    );
    expect(status).toBe(409);
    expect(objects).toMatchObject([{ code: 'TASK_LOCKED' }]);
    expect(await taskTitles(database.db, '1')).toEqual([LOCKED]);
    expect(await outboxEvents(database.db)).toEqual([]);
  });

  it('answers CONFLICT for a row another row still references', async () => {
    const parent = await storedTask(storage, 'parent');
    await storedTask(storage, 'child', { parent });
    const { status, objects } = await refusal(
      domain(member('1')).tasks.remove(parent),
    );
    expect(status).toBe(409);
    expect(objects).toMatchObject([
      { code: 'CONFLICT', detail: 'The resource is still referenced.' },
    ]);
    expect(await taskTitles(database.db, '1')).toEqual(['child', 'parent']);
  });
});
