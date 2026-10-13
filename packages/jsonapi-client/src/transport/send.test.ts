import type { TransportOptions } from './transport';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchDouble, jsonApi } from '../test-support/fetch-double';
import { send } from './send';
import { createTransport, Transport } from './transport';

const MEDIA_TYPE = 'application/vnd.api+json';
const ATOMIC = 'https://jsonapi.org/ext/atomic';
const ATOMIC_MEDIA_TYPE = `${MEDIA_TYPE}; ext="${ATOMIC}"`;
const URL_OF_LIST = 'https://api.example.com/articles';
const LIST = {
  type: 'articles',
  call: 'list',
  method: 'GET',
  url: URL_OF_LIST,
} as const;
const CREATE = {
  type: 'articles',
  call: 'create',
  method: 'POST',
  url: URL_OF_LIST,
  document: {
    data: { type: 'articles', attributes: { title: 'T', body: undefined } },
  },
} as const;

function stateWith(options: Omit<TransportOptions, 'origin'>) {
  return Transport.stateOf(
    createTransport({ origin: 'https://api.example.com', ...options }),
    'test',
  );
}

describe('send: the request (SPEC 15.3)', () => {
  it('"Clients and servers MUST send all JSON:API payloads using the JSON:API media type in the Content-Type header"', async () => {
    const double = fetchDouble(
      jsonApi({ data: { type: 'articles', id: '1' } }, 201),
    );

    await send(stateWith({ fetch: double.fetch }), CREATE);

    const sent = double.last();
    expect(sent.method).toBe('POST');
    expect(sent.headers.get('content-type')).toBe(MEDIA_TYPE);
    expect(sent.headers.get('accept')).toBe(MEDIA_TYPE);
    expect(JSON.parse(sent.body)).toStrictEqual({
      data: { type: 'articles', attributes: { title: 'T' } },
    });
  });

  it('names an applied extension in Content-Type, as clients "MUST specify the ext media type parameter", and in Accept to require it', async () => {
    const double = fetchDouble(jsonApi({ 'atomic:results': [{}] }));
    const operations = {
      type: 'articles',
      call: 'operations',
      method: 'POST',
      url: 'https://api.example.com/operations',
      document: { 'atomic:operations': [] },
      extension: { uri: ATOMIC, members: ['atomic:results'] },
    } as const;

    const incoming = await send(stateWith({ fetch: double.fetch }), operations);

    const sent = double.last();
    expect(sent.headers.get('content-type')).toBe(ATOMIC_MEDIA_TYPE);
    expect(sent.headers.get('accept')).toBe(ATOMIC_MEDIA_TYPE);
    expect(incoming.document).toStrictEqual({ 'atomic:results': [{}] });
  });

  it('reads the members of an extension as a document only for a request that applies it', async () => {
    const double = fetchDouble(jsonApi({ 'atomic:results': [] }));

    await expect(
      send(stateWith({ fetch: double.fetch }), CREATE),
    ).rejects.toThrow(
      new TypeError('articles create answered 200 without a JSON:API document'),
    );
  });

  it('sends no Content-Type without a document, which would make a cross-origin GET preflighted', async () => {
    const double = fetchDouble(jsonApi({ data: [] }));
    const headers = { 'content-type': 'application/json', accept: 'text/html' };

    await send(stateWith({ fetch: double.fetch, headers }), LIST);

    expect(double.last().headers.get('content-type')).toBeNull();
    expect(double.last().headers.get('accept')).toBe(MEDIA_TYPE);
    expect(double.last().body).toBe('');
  });

  it('calls a headers function on every request, so a rotated token is current', async () => {
    let token = 0;
    const headers = async (): Promise<HeadersInit> => {
      token += 1;
      await Promise.resolve();
      return { authorization: `Bearer ${String(token)}` };
    };
    const double = fetchDouble(jsonApi({ data: [] }), jsonApi({ data: [] }));
    const state = stateWith({ fetch: double.fetch, headers });

    await send(state, LIST);
    await send(state, LIST);

    expect(
      double.sent.map((sent) => sent.headers.get('authorization')),
    ).toStrictEqual(['Bearer 1', 'Bearer 2']);
  });

  it('sends a non-empty language as Accept-Language, read per request, over the transport headers', async () => {
    const locales = ['de', '', undefined];
    const double = fetchDouble(
      jsonApi({ data: [] }),
      jsonApi({ data: [] }),
      jsonApi({ data: [] }),
    );
    const state = stateWith({
      fetch: double.fetch,
      headers: { 'accept-language': 'fr' },
      language: () => locales.shift(),
    });

    await send(state, LIST);
    await send(state, LIST);
    await send(state, LIST);

    expect(
      double.sent.map((sent) => sent.headers.get('accept-language')),
    ).toStrictEqual(['de', 'fr', 'fr']);
  });

  it("applies a call's headers after the transport's headers and language, before the client's own", async () => {
    const double = fetchDouble(jsonApi({ data: [] }));
    const state = stateWith({
      fetch: double.fetch,
      headers: [
        ['x-trace', 'transport'],
        ['x-tenant', 't1'],
      ],
      language: () => 'de',
    });

    await send(state, LIST, {
      headers: {
        'x-trace': 'call',
        'accept-language': 'en',
        accept: 'text/html',
      },
    });

    const { headers } = double.last();
    expect(headers.get('x-trace')).toBe('call');
    expect(headers.get('x-tenant')).toBe('t1');
    expect(headers.get('accept-language')).toBe('en');
    expect(headers.get('accept')).toBe(MEDIA_TYPE);
  });

  it("passes the call's signal to the request", async () => {
    const double = fetchDouble(jsonApi({ data: [] }));

    await send(stateWith({ fetch: double.fetch }), LIST, {
      signal: AbortSignal.abort(),
    });

    expect(double.last().signal.aborted).toBe(true);
  });
});

describe('send: the fetch it calls (SPEC 15.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the global fetch as it is at request time', async () => {
    const state = stateWith({});
    const double = fetchDouble(jsonApi({ data: [] }));
    vi.stubGlobal('fetch', double.fetch);

    await send(state, LIST);

    expect(double.sent).toHaveLength(1);
  });

  it('calls fetch as a plain function, as the global fetch of a browser needs', async () => {
    const calledOn: Array<unknown> = [];
    async function plain(this: unknown, request: Request): Promise<Response> {
      calledOn.push(this);
      await request.text();
      return jsonApi({ data: [] });
    }

    await send(stateWith({ fetch: plain }), LIST);

    expect(calledOn).toStrictEqual([undefined]);
  });

  it('lets a rejected fetch reach the caller as it is', async () => {
    const failure = new TypeError('network down');
    const fetch = async (request: Request): Promise<Response> => {
      await request.text();
      throw failure;
    };

    await expect(send(stateWith({ fetch }), LIST)).rejects.toBe(failure);
  });

  it('reads a response through status, headers, and text() alone, once', async () => {
    let reads = 0;
    const foreign = {
      status: 200,
      headers: {
        get: (name: string) => (name === 'content-type' ? MEDIA_TYPE : null),
      },
      text: async () => {
        reads += 1;
        await Promise.resolve();
        return '{"data":[]}';
      },
    };

    const fetch = async (request: Request): Promise<typeof foreign> => {
      await request.text();
      return foreign;
    };

    const incoming = await send(stateWith({ fetch }), LIST);

    expect(incoming).toStrictEqual({ status: 200, document: { data: [] } });
    expect(reads).toBe(1);
  });
});
