import { describe, expect, it } from 'vitest';

import { isResponseError, ResponseError } from '../errors/response-error';
import { empty, fetchDouble, jsonApi } from '../test-support/fetch-double';
import { send } from './send';
import { createTransport, Transport } from './transport';

const LIST = {
  type: 'articles',
  call: 'list',
  method: 'GET',
  url: 'https://api.example.com/articles',
} as const;
const SECRET = 'secret-token-in-the-body';

async function answer(response: Response) {
  const state = Transport.stateOf(
    createTransport({
      origin: 'https://api.example.com',
      fetch: fetchDouble(response).fetch,
    }),
  );
  return send(state, LIST);
}

async function failure(response: Response): Promise<unknown> {
  return answer(response).then(
    () => expect.unreachable(),
    (error: unknown) => error,
  );
}

describe('send: a 2xx response (SPEC 15.3)', () => {
  it.each([
    ['the bare media type', 'application/vnd.api+json'],
    [
      'parameters other than ext and profile, which clients MUST ignore',
      'application/vnd.api+json; charset=utf-8',
    ],
    [
      'ext and profile',
      'application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"; profile="https://example.com/p"',
    ],
    ['another case', 'Application/VND.API+JSON'],
  ])('reads a document whose Content-Type has %s', async (_, contentType) => {
    const incoming = await answer(
      jsonApi({ data: [] }, 200, { 'content-type': contentType }),
    );

    expect(incoming).toStrictEqual({ status: 200, document: { data: [] } });
  });

  it.each([
    ['data', { data: null }],
    ['errors', { errors: [] }],
    ['meta alone', { meta: { total: 0 } }],
  ])('reads a document holding %s', async (_, document) => {
    expect((await answer(jsonApi(document))).document).toStrictEqual(document);
  });

  it('reads a 204 as no document', async () => {
    expect(await answer(empty(204))).toStrictEqual({
      status: 204,
      document: undefined,
    });
  });

  it('reads a 202 without a document as none, and with one as it', async () => {
    expect(await answer(empty(202))).toStrictEqual({
      status: 202,
      document: undefined,
    });
    const plain = new Response('Accepted', {
      status: 202,
      headers: { 'content-type': 'text/plain' },
    });
    expect(await answer(plain)).toStrictEqual({
      status: 202,
      document: undefined,
    });
    expect(await answer(jsonApi({ meta: { job: 'j1' } }, 202))).toStrictEqual({
      status: 202,
      document: { meta: { job: 'j1' } },
    });
  });

  it.each([
    [
      'another media type',
      new Response(JSON.stringify({ data: [], note: SECRET }), {
        headers: { 'content-type': 'application/json' },
      }),
    ],
    [
      'no Content-Type',
      new Response(new Blob([JSON.stringify({ data: [], note: SECRET })])),
    ],
    [
      'a body that is not JSON',
      new Response(`<p>${SECRET}</p>`, {
        headers: { 'content-type': 'application/vnd.api+json' },
      }),
    ],
    [
      'a JSON object without data, errors, or meta',
      jsonApi({ jsonapi: { version: '1.1' }, note: SECRET }),
    ],
    ['a JSON array', jsonApi([SECRET])],
    ['a 201 without a body', empty(201)],
  ])(
    'throws TypeError for a 2xx with %s, quoting nothing of it',
    async (_, response) => {
      const error = await failure(response);

      expect(error).toBeInstanceOf(TypeError);
      expect(error).toHaveProperty(
        'message',
        `articles list answered ${String(response.status)} without a JSON:API document`,
      );
      expect(String(error)).not.toContain(SECRET);
    },
  );
});

describe('send: any other status (SPEC 15.3, 15.7)', () => {
  it('rejects a 4xx with a ResponseError holding the error objects', async () => {
    const document = {
      errors: [{ status: '404', code: 'NOT_FOUND', title: 'Not found' }],
    };

    const error = await failure(jsonApi(document, 404));

    expect(error).toBeInstanceOf(ResponseError);
    expect(isResponseError(error, 'NOT_FOUND')).toBe(true);
    expect(error).toMatchObject({
      status: 404,
      message: 'articles list answered 404',
    });
  });

  it('reads an error body as JSON whatever its media type, and a body that is not JSON as no error objects', async () => {
    const json = new Response(JSON.stringify({ errors: [{ code: 'X' }] }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
    const html = new Response(`<h1>${SECRET}</h1>`, {
      status: 502,
      headers: { 'content-type': 'text/html' },
    });

    expect(await failure(json)).toMatchObject({
      status: 400,
      errors: [{ code: 'X' }],
    });
    const proxy = await failure(html);
    expect(proxy).toMatchObject({
      status: 502,
      errors: [],
      document: undefined,
    });
    expect(String(proxy)).not.toContain(SECRET);
  });

  it('keeps Allow and Retry-After', async () => {
    const response = new Response(null, {
      status: 503,
      headers: { 'retry-after': '120', allow: 'GET' },
    });

    expect(await failure(response)).toMatchObject({
      headers: { allow: 'GET', retryAfter: '120' },
    });
  });

  it('rejects a 3xx fetch did not follow', async () => {
    expect(await failure(new Response(null, { status: 304 }))).toMatchObject({
      status: 304,
    });
  });
});
