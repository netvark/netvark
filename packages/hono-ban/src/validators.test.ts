import { sValidator } from '@hono/standard-validator';
import { vValidator } from '@hono/valibot-validator';
import { OpenAPIHono, createRoute, z as zo } from '@hono/zod-openapi';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createBan } from './create-ban';
import { hook as standardHook } from './standard-schema';
import { hook as valibotHook } from './valibot';
import { defaultHook, hook as zodHook } from './zod';

const ban = createBan();
const Order = z.object({ email: z.email(), quantity: z.number().int() });
const OrderValibot = v.object({
  email: v.pipe(v.string(), v.email()),
  quantity: v.pipe(v.number(), v.integer()),
});

async function post(app: Hono, body: unknown): Promise<Response> {
  return app.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function expectValidationFailure(response: Response): Promise<void> {
  expect(response.status).toBe(422);
  const body = (await response.json()) as Record<string, unknown>;
  expect(body).toMatchObject({
    code: 'VALIDATION_FAILED',
    location: 'body',
    detail: 'Request validation failed',
  });
  expect(response.headers.get('x-error-id')).toBe(body['id']);
  const entries = body['errors'] as Array<Record<string, unknown>>;
  expect(entries.map((entry) => String(entry['pointer'])).toSorted()).toEqual([
    '/email',
    '/quantity',
  ]);
  for (const entry of entries) {
    expect(entry).toMatchObject({ location: 'body' });
    expect(typeof entry['detail']).toBe('string');
  }
}

describe('validator hooks through app.onError', () => {
  it('zValidator', async () => {
    const app = new Hono();
    app.onError(ban.onError());
    app.post('/', zValidator('json', Order, zodHook(ban)), (c) => c.text('ok'));
    await expectValidationFailure(
      await post(app, { email: 'x', quantity: 1.5 }),
    );
    expect((await post(app, { email: 'a@b.co', quantity: 1 })).status).toBe(
      200,
    );
  });

  it('zValidator maps query targets to the query location', async () => {
    const app = new Hono();
    app.onError(ban.onError());
    app.get(
      '/',
      zValidator('query', z.object({ page: z.coerce.number() }), zodHook(ban)),
      (c) => c.text('ok'),
    );
    const response = await app.request('/?page=x');
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      location: 'query',
      errors: [{ location: 'query', name: 'page' }],
    });
  });

  it('vValidator', async () => {
    const app = new Hono();
    app.onError(ban.onError());
    app.post('/', vValidator('json', OrderValibot, valibotHook(ban)), (c) =>
      c.text('ok'),
    );
    await expectValidationFailure(
      await post(app, { email: 'x', quantity: 1.5 }),
    );
  });

  it('sValidator with any Standard Schema library', async () => {
    const app = new Hono();
    app.onError(ban.onError());
    app.post('/', sValidator('json', Order, standardHook(ban)), (c) =>
      c.text('ok'),
    );
    await expectValidationFailure(
      await post(app, { email: 'x', quantity: 1.5 }),
    );
    const valibotApp = new Hono();
    valibotApp.onError(ban.onError());
    valibotApp.post(
      '/',
      sValidator('json', OrderValibot, standardHook(ban)),
      (c) => c.text('ok'),
    );
    await expectValidationFailure(
      await post(valibotApp, { email: 'x', quantity: 1.5 }),
    );
  });

  it('defaultHook handles every validated target of an OpenAPIHono route', async () => {
    const app = new OpenAPIHono({ defaultHook: defaultHook(ban) });
    app.onError(ban.onError());
    app.openapi(
      createRoute({
        method: 'post',
        path: '/users/{id}',
        request: {
          params: zo.object({ id: zo.uuid() }),
          body: {
            content: {
              'application/json': { schema: zo.object({ n: zo.number() }) },
            },
          },
        },
        responses: { 200: { description: 'ok' } },
      }),
      (c) => c.json({ ok: true }),
    );
    const badParam = await app.request('/users/not-a-uuid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ n: 1 }),
    });
    expect(badParam.status).toBe(422);
    await expect(badParam.json()).resolves.toMatchObject({
      location: 'param',
      errors: [{ location: 'param', name: 'id' }],
    });
    const badBody = await app.request(
      '/users/0b4f3e2a-6a1e-4d1b-9c0d-0f9e8d7c6b5a',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: 'x' }),
      },
    );
    expect(badBody.status).toBe(422);
    await expect(badBody.json()).resolves.toMatchObject({
      location: 'body',
      errors: [{ location: 'body', pointer: '/n' }],
    });
  });
});
