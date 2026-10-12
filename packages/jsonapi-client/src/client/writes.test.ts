import type { Answer } from '../test-support/fetch-double';

import { describe, expect, it } from 'vitest';

import { isResponseError } from '../errors/response-error';
import { Articles, People, Tags } from '../test-support/blog';
import { empty, fetchDouble, jsonApi } from '../test-support/fetch-double';
import { createTransport } from '../transport/transport';
import { createClients } from './create-clients';

const ORIGIN = 'https://api.example.test';
const MEDIA_TYPE = 'application/vnd.api+json';
const NOTHING = {
  data: undefined,
  links: undefined,
  meta: undefined,
  jsonapi: undefined,
};

function clientsWith(...responses: ReadonlyArray<Answer>) {
  const double = fetchDouble(...responses);
  const transport = createTransport({ origin: ORIGIN, fetch: double.fetch });
  return {
    double,
    clients: createClients(
      { articles: Articles, people: People, tags: Tags },
      transport,
    ),
  };
}

const STORED = {
  type: 'articles',
  id: 'a9',
  attributes: { title: 'T', body: 'B' },
  relationships: { author: { data: { type: 'people', id: 'p1' } } },
};

describe('create (SPEC 15.4)', () => {
  it('POSTs the resource object to the collection and resolves to the stored record', async () => {
    const { double, clients } = clientsWith(
      jsonApi({ data: STORED, links: { self: '/api/articles/a9' } }, 201),
    );

    const result = await clients.articles.create({
      attributes: { title: 'T', body: 'B' },
      relationships: { author: 'p1' },
    });

    const sent = double.last();
    expect([
      sent.method,
      sent.url,
      sent.headers.get('content-type'),
    ]).toStrictEqual(['POST', `${ORIGIN}/api/articles`, MEDIA_TYPE]);
    expect(JSON.parse(sent.body)).toStrictEqual({
      data: {
        type: 'articles',
        attributes: { title: 'T', body: 'B' },
        relationships: { author: { data: { type: 'people', id: 'p1' } } },
      },
    });
    expect(result).toStrictEqual({
      status: 201,
      data: {
        type: 'articles',
        id: 'a9',
        title: 'T',
        body: 'B',
        author: { type: 'people', id: 'p1' },
        $relationships: { author: { data: { type: 'people', id: 'p1' } } },
      },
      links: { self: '/api/articles/a9' },
      meta: undefined,
      jsonapi: undefined,
    });
  });

  it('"202 Accepted": no data, the document\'s meta kept', async () => {
    const { clients } = clientsWith(
      jsonApi(
        { data: { type: 'jobs', id: 'j1' }, meta: { queued: true } },
        202,
      ),
    );

    expect(
      await clients.articles.create({ attributes: { title: 'T' } }),
    ).toStrictEqual({
      ...NOTHING,
      status: 202,
      meta: { queued: true },
    });
  });

  it('"204 No Content": no data, the input being the resource', async () => {
    const { clients } = clientsWith(empty(204));

    expect(
      await clients.articles.create({ attributes: { title: 'T' } }),
    ).toStrictEqual({
      ...NOTHING,
      status: 204,
    });
  });

  it('throws TypeError for data that is not one resource object', async () => {
    const { clients } = clientsWith(jsonApi({ data: [STORED] }, 201));

    await expect(
      clients.articles.create({ attributes: { title: 'T' } }),
    ).rejects.toThrow(
      new TypeError(
        'articles create answered 201 with data that is not a resource object',
      ),
    );
  });

  it('rejects a 422 with its pointers, the message naming the type, call, and status alone', async () => {
    const errors = [
      {
        status: '422',
        code: 'INVALID',
        source: { pointer: '/data/attributes/title' },
      },
    ];
    const { clients } = clientsWith(jsonApi({ errors }, 422));

    const error = await clients.articles
      .create({ attributes: { title: '' } })
      .catch((caught: unknown) => caught);

    expect(isResponseError(error, 'INVALID')).toBe(true);
    expect(error).toMatchObject({
      message: 'articles create answered 422',
      errors,
    });
  });
});

describe('update (SPEC 15.4)', () => {
  it('PATCHes the resource with the id in the path and the document', async () => {
    const { double, clients } = clientsWith(
      jsonApi({ data: { ...STORED, id: 'a/9' } }),
    );

    const result = await clients.articles.update('a/9', {
      attributes: { title: 'New' },
    });

    expect([double.last().method, double.last().url]).toStrictEqual([
      'PATCH',
      `${ORIGIN}/api/articles/a%2F9`,
    ]);
    expect(JSON.parse(double.last().body)).toStrictEqual({
      data: { type: 'articles', id: 'a/9', attributes: { title: 'New' } },
    });
    expect(result.data).toMatchObject({ id: 'a/9', title: 'T' });
  });

  it('"200 OK ... with only top-level meta data": no data, the meta kept', async () => {
    const { clients } = clientsWith(jsonApi({ meta: { audited: true } }));

    expect(await clients.articles.update('a1', {})).toStrictEqual({
      ...NOTHING,
      status: 200,
      meta: { audited: true },
    });
  });

  it('throws TypeError for an id the path cannot carry, before sending', async () => {
    const { double, clients } = clientsWith();

    await expect(clients.articles.update('..', {})).rejects.toThrow(
      new TypeError('articles update: an id must not be empty, "." or ".."'),
    );
    expect(double.sent).toHaveLength(0);
  });
});

describe('remove (SPEC 15.4)', () => {
  it('DELETEs the resource without a document or a Content-Type', async () => {
    const { double, clients } = clientsWith(empty(204));

    const result = await clients.articles.remove('a1');

    const sent = double.last();
    expect([
      sent.method,
      sent.url,
      sent.body,
      sent.headers.get('content-type'),
    ]).toStrictEqual(['DELETE', `${ORIGIN}/api/articles/a1`, '', null]);
    expect(result).toStrictEqual({ ...NOTHING, status: 204 });
  });

  it('"200 OK ... with only top-level meta data": the meta kept, never data', async () => {
    const { clients } = clientsWith(
      jsonApi({ data: null, meta: { deleted: 1 } }),
    );

    expect(await clients.articles.remove('a1')).toStrictEqual({
      ...NOTHING,
      status: 200,
      meta: { deleted: 1 },
    });
  });
});
