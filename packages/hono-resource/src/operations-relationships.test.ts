/**
 * Relationship operations of the operations endpoint (resource SPEC
 * 19.4): an `update` whose target names a relationship runs the
 * resource's `update` with that relationship alone, when updates write
 * it and the resource declares `update`; its errors point at the
 * operation's data, where the request holds the linkage, as a
 * relationship link's errors point at `/data` (SPEC 19.3).
 * @ref https://jsonapi.org/ext/atomic/#updating-to-one-relationships
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 */
import { describe, expect, it } from 'vitest';

import { testApp } from './test-support/app';
import {
  CHILD,
  MISSING,
  OTHER,
  TASK,
  postOperations,
  refusal,
  seeded,
  titles,
} from './test-support/operations';

/** An `update` of task `id`'s parent to `data`. */
function reparent(id: string, data: unknown) {
  return {
    op: 'update',
    ref: { type: 'tasks', id, relationship: 'parent' },
    data,
  };
}

describe('relationship operations (resource SPEC 19.4)', () => {
  it('runs update with the relationship alone, and answers an empty result', async () => {
    const runtime = seeded();
    const response = await postOperations(testApp(runtime), [
      reparent(TASK, { type: 'tasks', id: OTHER }),
      reparent(CHILD, null),
    ]);
    expect(response.status).toBe(204);
    expect(
      runtime.calls.map(({ operation, args }) => [operation, args]),
    ).toEqual([
      [
        'update',
        [TASK, { relationships: { parent: { type: 'tasks', id: OTHER } } }],
      ],
      ['update', [CHILD, { relationships: { parent: null } }]],
    ]);
    const tasks = runtime.rows.get('tasks');
    expect([
      tasks?.get(TASK)?.['parent'],
      tasks?.get(CHILD)?.['parent'],
    ]).toEqual([OTHER, null]);
  });

  it('links the lid an earlier operation defined', async () => {
    const runtime = seeded();
    const response = await postOperations(testApp(runtime), [
      {
        op: 'add',
        data: { type: 'tasks', lid: 'a', attributes: { title: 'Plan' } },
      },
      reparent(TASK, { type: 'tasks', lid: 'a' }),
    ]);
    expect(response.status).toBe(200);
    const [plan, linked] = (await response.json())['atomic:results'];
    expect(linked).toEqual({});
    expect(runtime.rows.get('tasks')?.get(TASK)?.['parent']).toBe(plan.data.id);
  });

  it("points a refusal of the linkage at the operation's data", async () => {
    const response = await postOperations(testApp(seeded()), [
      reparent(TASK, { type: 'tasks', id: MISSING }),
    ]);
    expect(await refusal(response)).toEqual([
      404,
      [['NOT_FOUND', '/atomic:operations/0/data']],
    ]);
  });

  it('points a failure mapped once the transaction ended at the data of the operation whose call threw it', async () => {
    const runtime = seeded();
    const response = await postOperations(testApp(runtime), [
      {
        op: 'update',
        ref: { type: 'tasks', id: CHILD },
        data: { type: 'tasks', id: CHILD, attributes: { title: 'Renamed' } },
      },
      reparent(TASK, { type: 'tasks', id: TASK }),
    ]);
    expect(await refusal(response)).toEqual([
      409,
      [['CONFLICT', '/atomic:operations/1/data']],
    ]);
    expect(titles(runtime)[CHILD]).toBe('Wire');
  });

  it('answers 403 for a relationship updates do not write, or a resource without update', async () => {
    const app = testApp(seeded());
    const readOnly = await postOperations(app, [
      {
        op: 'update',
        ref: { type: 'tasks', id: TASK, relationship: 'workspace' },
        data: { type: 'workspaces', id: '2' },
      },
    ]);
    expect(await refusal(readOnly)).toEqual([
      403,
      [['FORBIDDEN', '/atomic:operations/0']],
    ]);
    const notUpdated = await postOperations(app, [
      {
        op: 'update',
        ref: { type: 'entrées', id: '1', relationship: 'owner' },
        data: { type: 'workspaces', id: '2' },
      },
    ]);
    expect(await refusal(notUpdated)).toEqual([
      403,
      [['FORBIDDEN', '/atomic:operations/0']],
    ]);
  });
});
