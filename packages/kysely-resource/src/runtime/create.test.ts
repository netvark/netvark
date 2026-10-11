/**
 * A create's lifecycle (resource SPEC 12.3, 18.4, 18.5): input validation
 * before any statement, then the policy, the rules, the quota, the server
 * values, the write, and the effects in one transaction, and the events
 * handed to `afterCommit` once it committed. A test per step and per
 * failure path, on PGlite.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createKyselyStorage } from '../storage/create-storage';
import { storageOptions } from '../test-support/database';
import { LOCKED, MEMBER_ID, member, testDomain } from '../test-support/domain';
import {
  domainDatabase,
  domainStorage,
  outboxEvents,
  taskTitles,
} from '../test-support/domain-database';
import { refusal } from '../test-support/refusal';

const statements: Array<string> = [];
const database = domainDatabase((event) => {
  statements.push(event.query.sql);
});
const storage = domainStorage(database.db);
const domain = testDomain(storage);
const UPPER_ID = '0000000A-0000-4000-8000-00000000000B';
const CREATED = { name: 'task.created', version: 1 };

beforeEach(async () => {
  await database.reset();
  statements.length = 0;
});
afterAll(async () => {
  await database.close();
});

describe('create (resource SPEC 18.4)', () => {
  it('writes the members, the defaults, the server value, and the scope, then records its event', async () => {
    const row = await domain(member('1')).tasks.create({
      attributes: { title: 'Write' },
    });
    expect(row).toMatchObject({
      title: 'Write',
      done: false,
      points: null,
      createdBy: MEMBER_ID,
      workspace: '1',
      parent: null,
    });
    expect(await outboxEvents(database.db)).toEqual([
      { ...CREATED, payload: { id: row.id, title: 'Write' } },
    ]);
  });

  it('hands the events to afterCommit once the transaction committed', async () => {
    const seen: Array<unknown> = [];
    const afterCommit = vi.fn(async () => {
      seen.push(await outboxEvents(database.db));
    });
    const row = await testDomain(storage, { afterCommit })(
      member('1'),
    ).tasks.create({ attributes: { title: 'Write' } });
    const event = { ...CREATED, payload: { id: row.id, title: 'Write' } };
    expect(afterCommit).toHaveBeenCalledExactlyOnceWith([event]);
    expect(seen).toEqual([[event]]);
  });

  it('validates the input before any statement, with an item per issue at its place', async () => {
    const { status, objects } = await refusal(
      domain(member('1')).tasks.create({
        attributes: { title: '', nope: 1 },
        relationships: { parent: { type: 'tasks', id: 'no' } },
      }),
    );
    expect(status).toBe(422);
    expect(objects.map((object) => [object.source, object.meta])).toEqual([
      [
        { pointer: '/data/attributes/title' },
        { code: 'minLength', expected: '1' },
      ],
      [{ pointer: '/data/attributes/nope' }, { code: 'additionalProperties' }],
      [
        { pointer: '/data/relationships/parent/data/id' },
        { code: 'format', expected: 'uuid' },
      ],
    ]);
    expect(statements).toEqual([]);
  });

  it("takes a client id in the key's form and stores it as the form outputs it", async () => {
    const row = await domain(member('1')).tasks.create({
      id: UPPER_ID,
      attributes: { title: 'Named' },
    });
    expect(row.id).toBe(UPPER_ID.toLowerCase());
  });

  it("refuses a client id outside the key's form, and one where the resource takes none", async () => {
    const outside = await refusal(
      domain(member('1')).tasks.create({
        id: '1',
        attributes: { title: 'Named' },
      }),
    );
    expect(outside.status).toBe(422);
    expect(outside.objects).toMatchObject([
      {
        code: 'VALIDATION_FAILED',
        source: { pointer: '/data/id' },
        meta: { code: 'format', expected: 'uuid' },
      },
    ]);
    const unaccepted = await refusal(
      domain(member('1')).workspaces.create({
        id: '5',
        attributes: { name: 'Five' },
      }),
    );
    expect(unaccepted.status).toBe(403);
    expect(unaccepted.objects).toMatchObject([
      {
        code: 'CLIENT_GENERATED_ID_NOT_SUPPORTED',
        detail: '"workspaces" does not accept client-generated ids',
        source: { pointer: '/data/id' },
      },
    ]);
    expect(statements).toEqual([]);
  });

  it('answers FORBIDDEN without a detail when the policy denies, before the rules', async () => {
    const { status, objects } = await refusal(
      domain(member('1', ['tasks:read'])).tasks.create({
        attributes: { title: LOCKED },
      }),
    );
    expect(status).toBe(403);
    expect(objects).toEqual([
      expect.not.objectContaining({ detail: expect.anything() }),
    ]);
    expect(objects[0]?.code).toBe('FORBIDDEN');
    expect(await taskTitles(database.db, '1')).toEqual([]);
  });

  it("refuses with a rule's code, writing and recording nothing", async () => {
    const { status, objects } = await refusal(
      domain(member('1')).tasks.create({ attributes: { title: LOCKED } }),
    );
    expect(status).toBe(409);
    expect(objects).toMatchObject([
      {
        code: 'TASK_LOCKED',
        detail: 'The title is locked.',
        source: { pointer: '/data/attributes/title' },
      },
    ]);
    expect(await taskTitles(database.db, '1')).toEqual([]);
    expect(await outboxEvents(database.db)).toEqual([]);
  });

  it("holds each workspace to the quota's limit, counting its own tasks only", async () => {
    const limited = testDomain(storage, { services: { taskLimit: 1 } });
    await limited(member('1')).tasks.create({ attributes: { title: 'a' } });
    await limited(member('2')).tasks.create({ attributes: { title: 'b' } });
    const { status, objects } = await refusal(
      limited(member('1')).tasks.create({ attributes: { title: 'c' } }),
    );
    expect(status).toBe(403);
    expect(objects).toMatchObject([
      {
        code: 'QUOTA_EXCEEDED',
        detail: 'The quota for this resource is used up.',
      },
    ]);
    expect(await taskTitles(database.db, '1')).toEqual(['a']);
  });

  it.each([-1, 1.5, Number.NaN])(
    'fails closed on a limit of %s',
    async (taskLimit) => {
      const broken = testDomain(storage, { services: { taskLimit } });
      const { objects } = await refusal(
        broken(member('1')).tasks.create({ attributes: { title: 'a' } }),
      );
      expect(objects[0]?.code).toBe('QUOTA_EXCEEDED');
    },
  );

  it('answers a unique violation with its declared code', async () => {
    await domain(member('1')).tasks.create({
      attributes: { title: 'Same' },
    });
    const { status, objects } = await refusal(
      domain(member('1')).tasks.create({ attributes: { title: 'Same' } }),
    );
    expect(status).toBe(409);
    expect(objects).toMatchObject([
      {
        code: 'TASKS_WORKSPACE_ID_TITLE_KEY',
        source: { pointer: '/data/attributes/title' },
      },
    ]);
  });

  it("answers a partition's violation with the partitioned table's code", async () => {
    const log = {
      id: '1007',
      attributes: { note: 'once' },
      relationships: { owner: { type: 'workspaces', id: '1' } },
    };
    await domain(member('1')).logs.create(log);
    const { status, objects } = await refusal(
      domain(member('1')).logs.create(log),
    );
    expect(status).toBe(409);
    expect(objects).toMatchObject([
      { code: 'LOGS_PKEY', source: { pointer: '/data/id' } },
    ]);
  });

  it('rolls the write back when its events cannot be recorded', async () => {
    const options = { ...storageOptions(database.db), outbox: undefined };
    const unrecorded = testDomain(createKyselyStorage(options));
    await expect(
      unrecorded(member('1')).tasks.create({ attributes: { title: 'a' } }),
    ).rejects.toThrow('record: the storage has no outbox table');
    expect(await taskTitles(database.db, '1')).toEqual([]);
  });

  it('sends what afterCommit throws to report, never to the caller, whose write committed', async () => {
    const failure = new Error('the relay is down');
    const report = vi.fn(() => {
      throw new Error('so is the logger');
    });
    const afterCommit = vi.fn(() => {
      throw failure;
    });
    const hooked = testDomain(storage, { afterCommit, report });
    const row = await hooked(member('1')).tasks.create({
      attributes: { title: 'Kept' },
    });
    expect(row['title']).toBe('Kept');
    expect(report).toHaveBeenCalledExactlyOnceWith(failure);
    expect(await taskTitles(database.db, '1')).toEqual(['Kept']);
  });

  it('calls afterCommit only when the operation recorded events, and sets every scope for an unscoped resource', async () => {
    const afterCommit = vi.fn();
    const hooked = testDomain(storage, { afterCommit });
    const row = await hooked(member('1')).workspaces.create({
      attributes: { name: 'Three' },
    });
    expect(row).toMatchObject({ name: 'Three', createdIn: '1' });
    expect(afterCommit).not.toHaveBeenCalled();
  });
});
