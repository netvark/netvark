/**
 * A resource's routes (resource SPEC 19.3): `GET` hands `get` the decoded
 * `:id` and adds each include, `PATCH` hands `update` the id and the
 * parsed document, whose id must be the path's, and `DELETE` hands
 * `remove` the id and answers 204; what the runtime refuses, such as a row
 * the actor does not see, is the response.
 * @ref https://jsonapi.org/format/1.1/#crud-updating-responses-409
 * @ref https://jsonapi.org/format/1.1/#crud-deleting-responses-204
 */
import { describe, expect, it } from 'vitest';

import { testApp } from './test-support/app';
import { memoryRuntime } from './test-support/memory-runtime';
import { RESOURCES } from './test-support/resources';

const MEDIA_TYPE = 'application/vnd.api+json';
const TASK = '0b5a2d4e-6f0c-4f3e-9a1b-2c3d4e5f6a7b';
const CHILD = '2d7c4f6a-8b2e-4b5a-9c3d-4e5f6a7b8c9d';
const OTHER = '1c6b3e5f-7a1d-4a4f-8b2c-3d4e5f6a7b8c';

function seeded() {
  return memoryRuntime(RESOURCES, {
    workspaces: [{ id: '1', name: 'One' }],
    tasks: [
      { id: TASK, title: 'Boot', done: false, workspace: '1', parent: null },
      { id: CHILD, title: 'Wire', done: false, workspace: '1', parent: TASK },
      { id: OTHER, title: 'Theirs', done: true, workspace: '2', parent: null },
    ],
  });
}

function as(
  name: string,
  init: Omit<RequestInit, 'headers'> = {},
): RequestInit {
  return {
    ...init,
    headers: { 'X-Member': name, 'Content-Type': MEDIA_TYPE },
  };
}

describe('GET <resource> (resource SPEC 19.3)', () => {
  it('answers the row with each include', async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      `/api/tasks/${CHILD}?include=parent,workspace&fields[tasks]=title,parent`,
      as('ada'),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual({
      type: 'tasks',
      id: CHILD,
      attributes: { title: 'Wire' },
      relationships: {
        parent: {
          data: { type: 'tasks', id: TASK },
          links: {
            self: `/api/tasks/${CHILD}/relationships/parent`,
            related: `/api/tasks/${CHILD}/parent`,
          },
        },
      },
      links: { self: `/api/tasks/${CHILD}` },
    });
    expect(body.included).toEqual([
      expect.objectContaining({ type: 'tasks', id: TASK }),
      expect.objectContaining({ type: 'workspaces', id: '1' }),
    ]);
    expect(runtime.calls.map((call) => call.args[0])).toEqual([
      CHILD,
      'parent',
      'workspace',
    ]);
  });

  it('hands get the id Hono decoded from the path', async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      '/api/tasks/a%2Fb%20c',
      as('ada'),
    );
    expect(response.status).toBe(404);
    expect(runtime.calls[0]?.args).toEqual(['a/b c']);
  });

  it('answers what the runtime refused with: a row the actor does not see is absent', async () => {
    const response = await testApp(seeded()).request(
      `/api/tasks/${OTHER}`,
      as('ada'),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      errors: [{ code: 'NOT_FOUND' }],
    });
  });
});

describe('PATCH <resource> (resource SPEC 19.3)', () => {
  it('updates the row from the parsed document and answers it', async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      `/api/tasks/${TASK}`,
      as('ada', {
        method: 'PATCH',
        body: JSON.stringify({
          data: { type: 'tasks', id: TASK, attributes: { done: true } },
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { id: TASK, attributes: { title: 'Boot', done: true } },
    });
    expect(runtime.calls[0]?.args).toEqual([
      TASK,
      {
        type: 'tasks',
        id: TASK,
        attributes: { done: true },
        relationships: {},
      },
    ]);
  });

  it("refuses a document whose id is not the path's before the runtime runs", async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      `/api/tasks/${TASK}`,
      as('ada', {
        method: 'PATCH',
        body: JSON.stringify({
          data: { type: 'tasks', id: CHILD, attributes: { done: true } },
        }),
      }),
    );
    expect(response.status).toBe(409);
    expect(runtime.calls).toEqual([]);
  });
});

describe('DELETE <resource> (resource SPEC 19.3)', () => {
  it('removes the row and answers 204, then 404 for it', async () => {
    const app = testApp(seeded());
    const removed = await app.request(
      `/api/tasks/${TASK}`,
      as('ada', { method: 'DELETE' }),
    );
    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe('');
    const again = await app.request(
      `/api/tasks/${TASK}`,
      as('ada', { method: 'DELETE' }),
    );
    expect(again.status).toBe(404);
  });
});
