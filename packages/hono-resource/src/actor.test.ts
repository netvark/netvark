/**
 * The request's actor (resource SPEC 19.2): `options.actor` runs once per
 * request, first, awaited, and the runtime runs every operation of the
 * request as what it returned; what it throws is the response.
 */
import type { Context } from 'hono';

import type { TestEnv } from './test-support/app';
import type { Member } from './test-support/memory-runtime';

import { describe, expect, it } from 'vitest';

import { actors } from './actor';
import { memberOf, testApp } from './test-support/app';
import { memoryRuntime } from './test-support/memory-runtime';
import { RESOURCES } from './test-support/resources';

const TASK = '0b5a2d4e-6f0c-4f3e-9a1b-2c3d4e5f6a7b';

function seeded() {
  return memoryRuntime(RESOURCES, {
    workspaces: [{ id: '1', name: 'One' }],
    tasks: [
      { id: TASK, title: 'Boot', done: false, workspace: '1', parent: null },
    ],
  });
}

describe('the actor (resource SPEC 19.2)', () => {
  it('resolves once per request, awaited, and runs every operation of the request', async () => {
    const runtime = seeded();
    const seen: Array<string> = [];
    const actor = async (c: Context<TestEnv>): Promise<Member> => {
      seen.push(c.req.path);
      await Promise.resolve();
      return memberOf(c);
    };
    const response = await testApp(runtime, { actor }).request(
      `/api/tasks/${TASK}?include=workspace,parent`,
      { headers: { 'X-Member': 'ada' } },
    );
    expect(response.status).toBe(200);
    expect(seen).toEqual([`/api/tasks/${TASK}`]);
    expect(runtime.calls.map((call) => call.actor.id)).toEqual([
      'ada',
      'ada',
      'ada',
    ]);
  });

  it('answers what the actor threw, before the query is parsed', async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      '/api/tasks?filter[secret][eq]=x',
      { headers: { 'X-Member': 'nobody' } },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      errors: [{ code: 'UNAUTHORIZED', detail: 'The request names no member' }],
    });
    expect(runtime.calls).toEqual([]);
  });

  it('has no actor for a request whose route did not resolve one', () => {
    const { of } = actors(memberOf);
    expect(() => of({} as Context)).toThrow(
      new TypeError(
        'jsonApiRoutes: a route ran an operation before it resolved the actor',
      ),
    );
  });
});
