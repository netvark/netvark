/**
 * The operations endpoint (resource SPEC 19.4): a request's operations
 * run in one transaction of the runtime as the request's actor, each the
 * operation of the domain its `op` names, and answer their results. The
 * first failure rolls every operation back, and its error points at the
 * operation that failed: inside its data where the runtime pointed into
 * the input, and by the index of the call that threw it when the
 * transaction mapped it once it ended.
 * @ref https://jsonapi.org/ext/atomic/#processing
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 */
import { describe, expect, it } from 'vitest';

import { testApp } from './test-support/app';
import { TAKEN_TITLE } from './test-support/memory-rows';
import {
  ATOMIC,
  CHILD,
  MISSING,
  OTHER,
  TASK,
  postOperations,
  refusal,
  rename,
  seeded,
  titles,
} from './test-support/operations';

const SEEDED_TITLES = { [TASK]: 'Boot', [CHILD]: 'Wire', [OTHER]: 'Theirs' };

describe('POST /api/operations (resource SPEC 19.4)', () => {
  it('runs every operation in one transaction as the actor, and answers their results', async () => {
    const runtime = seeded();
    const response = await postOperations(testApp(runtime), [
      {
        op: 'add',
        data: { type: 'tasks', lid: 'a', attributes: { title: 'Plan' } },
      },
      {
        op: 'add',
        data: {
          type: 'tasks',
          attributes: { title: 'Step' },
          relationships: { parent: { data: { type: 'tasks', lid: 'a' } } },
        },
      },
      rename(TASK, 'Booted'),
      { op: 'remove', ref: { type: 'tasks', id: CHILD } },
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(ATOMIC);
    const [plan, step, renamed, removed] = (await response.json())[
      'atomic:results'
    ];
    expect(plan.data).toMatchObject({
      type: 'tasks',
      attributes: { title: 'Plan' },
      links: { self: `/api/tasks/${String(plan.data.id)}` },
    });
    expect(step.data.relationships.parent.data).toEqual({
      type: 'tasks',
      id: plan.data.id,
    });
    expect(renamed.data).toMatchObject({
      id: TASK,
      attributes: { title: 'Booted' },
    });
    expect(removed).toEqual({});
    expect(
      runtime.calls.map(({ operation, actor }) => [operation, actor.id]),
    ).toEqual([
      ['create', 'ada'],
      ['create', 'ada'],
      ['update', 'ada'],
      ['remove', 'ada'],
    ]);
    expect(titles(runtime)).toEqual({
      [TASK]: 'Booted',
      [OTHER]: 'Theirs',
      [plan.data.id]: 'Plan',
      [step.data.id]: 'Step',
    });
  });

  it('answers 204 without a document when no result holds data', async () => {
    const runtime = seeded();
    const response = await postOperations(testApp(runtime), [
      { op: 'remove', ref: { type: 'tasks', id: CHILD } },
    ]);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(runtime.rows.get('tasks')?.has(CHILD)).toBe(false);
  });

  it('rolls every operation back at the first refusal, which points at its operation', async () => {
    const runtime = seeded();
    const response = await postOperations(testApp(runtime), [
      { op: 'add', data: { type: 'tasks', attributes: { title: 'Plan' } } },
      rename(MISSING, 'Lost'),
      rename(TASK, 'Never'),
    ]);
    expect(await refusal(response)).toEqual([
      404,
      [['NOT_FOUND', '/atomic:operations/1']],
    ]);
    expect(titles(runtime)).toEqual(SEEDED_TITLES);
    expect(runtime.calls.map(({ operation }) => operation)).toEqual([
      'create',
      'update',
    ]);
  });

  it("moves a refusal the runtime pointed into the input into the operation's data", async () => {
    const response = await postOperations(testApp(seeded()), [
      rename(TASK, 'Booted'),
      {
        op: 'update',
        ref: { type: 'tasks', id: CHILD },
        data: {
          type: 'tasks',
          id: CHILD,
          relationships: { parent: { data: { type: 'tasks', id: MISSING } } },
        },
      },
    ]);
    expect(await refusal(response)).toEqual([
      404,
      [['NOT_FOUND', '/atomic:operations/1/data/relationships/parent']],
    ]);
  });

  it('moves a failure mapped once the transaction ended to the operation whose call threw it', async () => {
    const runtime = seeded();
    const response = await postOperations(testApp(runtime), [
      rename(TASK, 'Booted'),
      rename(CHILD, TAKEN_TITLE),
    ]);
    expect(await refusal(response)).toEqual([
      409,
      [['CONFLICT', '/atomic:operations/1/data/attributes/title']],
    ]);
    expect(titles(runtime)).toEqual(SEEDED_TITLES);
  });

  it("runs the operations as the request's actor, who sees only its workspace", async () => {
    const runtime = seeded();
    const response = await postOperations(
      testApp(runtime),
      [rename(TASK, 'Mine')],
      'alan',
    );
    expect(await refusal(response)).toEqual([
      404,
      [['NOT_FOUND', '/atomic:operations/0']],
    ]);
    expect(runtime.calls.map(({ actor }) => actor.id)).toEqual(['alan']);
  });

  it('answers 403 for an operation the declaration lacks, and 404 for a type the runtime does not run', async () => {
    const app = testApp(seeded());
    const forbidden = await postOperations(app, [
      { op: 'add', data: { type: 'workspaces', attributes: { name: 'New' } } },
    ]);
    expect(await refusal(forbidden)).toEqual([
      403,
      [['FORBIDDEN', '/atomic:operations/0']],
    ]);
    const removal = await postOperations(app, [
      { op: 'remove', ref: { type: 'entrées', id: '1' } },
    ]);
    expect(await refusal(removal)).toEqual([
      403,
      [['FORBIDDEN', '/atomic:operations/0']],
    ]);
    const unknown = await postOperations(app, [
      { op: 'add', data: { type: 'projects', attributes: {} } },
    ]);
    expect(await refusal(unknown)).toEqual([
      404,
      [['NOT_FOUND', '/atomic:operations/0/data/type']],
    ]);
  });
});
