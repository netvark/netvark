import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
/**
 * An update's lifecycle (resource SPEC 12.3, 18.4): input validation and
 * the id's form before any statement, then the row read with its lock,
 * the policy and the rules over it, the write of the members carried, and
 * the effects with the row before and after.
 */

import { LOCKED, member, testDomain } from '../test-support/domain';
import {
  domainDatabase,
  domainStorage,
  outboxEvents,
  storedTask,
} from '../test-support/domain-database';
import { refusal } from '../test-support/refusal';

const statements: Array<string> = [];
const database = domainDatabase((event) => {
  statements.push(event.query.sql);
});
const storage = domainStorage(database.db);
const domain = testDomain(storage);
const MISSING = '00000000-0000-4000-8000-0000000000ff';
const stored = async (title: string, workspace = '1') =>
  storedTask(storage, title, { workspace });

beforeEach(async () => {
  await database.reset();
});
afterAll(async () => {
  await database.close();
});

describe('update (resource SPEC 18.4)', () => {
  it('changes the members the input carries only, and records the rename with the row before it', async () => {
    const id = await stored('a');
    const row = await domain(member('1')).tasks.update(id, {
      attributes: { title: 'b' },
    });
    expect(row).toMatchObject({ id, title: 'b', points: '3', done: false });
    expect(await outboxEvents(database.db)).toEqual([
      { name: 'task.renamed', version: 1, payload: { id, from: 'a', to: 'b' } },
    ]);
  });

  it('records nothing, and calls no afterCommit, when its effects return no event', async () => {
    const id = await stored('a');
    const afterCommit = vi.fn();
    const row = await testDomain(storage, { afterCommit })(
      member('1'),
    ).tasks.update(id, { attributes: { points: '4' } });
    expect(row).toMatchObject({ title: 'a', points: '4' });
    expect(await outboxEvents(database.db)).toEqual([]);
    expect(afterCommit).not.toHaveBeenCalled();
  });

  it('resolves to the row unchanged for an input without members', async () => {
    const id = await stored('a');
    const row = await domain(member('1')).tasks.update(id, {});
    expect(row).toMatchObject({ id, title: 'a', points: '3' });
  });

  it('reads the row it decides on with the lock its write takes', async () => {
    const id = await stored('a');
    statements.length = 0;
    await domain(member('1')).tasks.update(id, { attributes: { title: 'b' } });
    const reads = statements.filter((sql) => sql.startsWith('select "id"'));
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatch(/ for no key update$/u);
    expect(statements.indexOf(reads[0] ?? '')).toBeLessThan(
      statements.findIndex((sql) => sql.startsWith('update ')),
    );
  });

  it('answers NOT_FOUND alike for a row the policy denies, a missing row, and a row of another workspace', async () => {
    const id = await stored('a');
    const other = await stored('o', '2');
    const reader = domain(member('1', ['tasks:read'])).tasks;
    const writer = domain(member('1')).tasks;
    const refusals = await Promise.all([
      refusal(reader.update(id, { attributes: { title: 'b' } })),
      refusal(writer.update(MISSING, { attributes: { title: 'b' } })),
      refusal(writer.update(other, { attributes: { title: 'b' } })),
    ]);
    for (const { status, objects } of refusals) {
      expect(status).toBe(404);
      expect(objects).toEqual([
        {
          id: expect.any(String),
          status: '404',
          code: 'NOT_FOUND',
          title: 'Not Found',
        },
      ]);
    }
    expect(await domain(member('2')).tasks.get(other)).toMatchObject({
      title: 'o',
    });
  });

  it("answers NOT_FOUND without a statement for an id outside the key's form, and validates the input first", async () => {
    statements.length = 0;
    const outside = await refusal(
      domain(member('1')).tasks.update('nope', { attributes: { title: 'b' } }),
    );
    expect(outside.status).toBe(404);
    const invalid = await refusal(
      domain(member('1')).tasks.update('nope', { attributes: { title: 5 } }),
    );
    expect(invalid.status).toBe(422);
    expect(invalid.objects).toMatchObject([
      {
        source: { pointer: '/data/attributes/title' },
        meta: { code: 'type', expected: 'string' },
      },
    ]);
    expect(statements).toEqual([]);
  });

  it('lets a rule decide on the stored row, refusing with its code and changing nothing', async () => {
    const id = await stored(LOCKED);
    const { status, objects } = await refusal(
      domain(member('1')).tasks.update(id, { attributes: { title: 'b' } }),
    );
    expect(status).toBe(409);
    expect(objects).toMatchObject([
      { code: 'TASK_LOCKED', source: { pointer: '/data/attributes/title' } },
    ]);
    const kept = await domain(member('1')).tasks.update(id, {
      attributes: { points: '1' },
    });
    expect(kept).toMatchObject({ title: LOCKED, points: '1' });
  });

  it('answers a unique violation with its declared code', async () => {
    await stored('a');
    const id = await stored('b');
    const { objects } = await refusal(
      domain(member('1')).tasks.update(id, { attributes: { title: 'a' } }),
    );
    expect(objects).toMatchObject([
      {
        code: 'TASKS_WORKSPACE_ID_TITLE_KEY',
        source: { pointer: '/data/attributes/title' },
      },
    ]);
  });
});
