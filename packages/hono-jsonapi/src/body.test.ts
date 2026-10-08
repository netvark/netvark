import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { readDocument } from './body';
import { errorHandler } from './handlers';

const app = new Hono();
app.onError(errorHandler());
app.post('/', async (c) => {
  const first = await readDocument(c);
  const second = await readDocument(c);
  return c.json({ first, second });
});

async function post(
  body: string,
  contentType?: string,
): Promise<{ status: number; body: unknown }> {
  const response = await app.request('/', {
    method: 'POST',
    body,
    headers: contentType === undefined ? {} : { 'content-type': contentType },
  });
  return { status: response.status, body: await response.json() };
}

describe('readDocument', () => {
  it('parses a JSON:API body, including with ext and profile parameters, and can be read twice', async () => {
    expect(await post('{"data":null}', 'application/vnd.api+json')).toEqual({
      status: 200,
      body: { first: { data: null }, second: { data: null } },
    });
    expect(
      (await post('{"meta":{}}', 'application/vnd.api+json; ext="https://x"'))
        .status,
    ).toBe(200);
  });

  it('responds 415 when the body is not declared as JSON:API', async () => {
    for (const contentType of [undefined, 'application/json', 'text/plain']) {
      const { status, body } = await post('{"data":null}', contentType);
      expect(status, String(contentType)).toBe(415);
      expect(body).toMatchObject({
        errors: [{ code: 'UNSUPPORTED_MEDIA_TYPE' }],
      });
    }
  });

  it('responds 400 to a body that is not JSON, including an empty one', async () => {
    for (const body of ['{', '', 'null,']) {
      const result = await post(body, 'application/vnd.api+json');
      expect(result.status, JSON.stringify(body)).toBe(400);
      expect(result.body).toMatchObject({
        errors: [{ code: 'MALFORMED_JSON' }],
      });
    }
  });
});
