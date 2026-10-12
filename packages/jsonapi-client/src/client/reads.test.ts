import type { Answer } from '../test-support/fetch-double';

import { describe, expect, it } from 'vitest';

import { Articles, People, Tags } from '../test-support/blog';
import { fetchDouble, jsonApi } from '../test-support/fetch-double';
import { createTransport } from '../transport/transport';
import { createClients } from './create-clients';

const ORIGIN = 'https://api.example.test';

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

const ARTICLE = {
  type: 'articles',
  id: 'a1',
  attributes: { title: 'One' },
  relationships: { author: { data: { type: 'people', id: 'p1' } } },
  links: { self: 'https://blog.example/api/articles/a1' },
};
const ADA = { type: 'people', id: 'p1', attributes: { name: 'Ada' } };

describe('list (SPEC 15.4)', () => {
  it("GETs the collection on the transport's origin with the query, never the definition's origin", async () => {
    const { double, clients } = clientsWith(
      jsonApi({ data: [ARTICLE], included: [ADA], meta: { total: 1 } }),
    );

    const result = await clients.articles.list({
      include: ['author'],
      sort: ['-createdAt'],
      filter: { title: { like: 'O%' } },
      page: { size: 2 },
    });

    expect(double.last().method).toBe('GET');
    expect(double.last().url).toBe(
      `${ORIGIN}/api/articles?include=author&sort=-createdAt&page%5Bsize%5D=2&filter%5Btitle%5D%5Blike%5D=O%25`,
    );
    expect(result).toStrictEqual({
      status: 200,
      data: [
        {
          type: 'articles',
          id: 'a1',
          title: 'One',
          author: { type: 'people', id: 'p1', name: 'Ada' },
          $relationships: { author: { data: { type: 'people', id: 'p1' } } },
          $links: { self: 'https://blog.example/api/articles/a1' },
        },
      ],
      links: undefined,
      meta: { total: 1 },
      jsonapi: undefined,
    });
  });

  it('sends no query string without a query, and keeps linkage where nothing is included', async () => {
    const { double, clients } = clientsWith(
      jsonApi({ data: [ARTICLE], included: [ADA] }),
    );

    const { data } = await clients.articles.list();

    expect(double.last().url).toBe(`${ORIGIN}/api/articles`);
    expect(data[0]?.['author']).toStrictEqual({ type: 'people', id: 'p1' });
  });

  it('throws TypeError when the data is not a list, quoting nothing of it', async () => {
    const { clients } = clientsWith(jsonApi({ data: ARTICLE }));

    await expect(clients.articles.list()).rejects.toThrow(
      new TypeError(
        'articles list answered 200 with data that is not a list of resource objects',
      ),
    );
  });
});

describe('get (SPEC 15.4)', () => {
  it('GETs the resource with include and fields alone, the id percent-encoded', async () => {
    const { double, clients } = clientsWith(
      jsonApi({ data: { ...ARTICLE, id: 'a/1 ?' } }),
    );
    const query = {
      include: ['author'],
      fields: { articles: ['title', 'author'] },
      sort: ['title'],
    };

    const { data } = await clients.articles.get('a/1 ?', query);

    expect(double.last().url).toBe(
      `${ORIGIN}/api/articles/a%2F1%20%3F?include=author&fields%5Barticles%5D=title%2Cauthor`,
    );
    expect(data.id).toBe('a/1 ?');
  });

  it.each([
    ['an empty id', ''],
    ['a single dot', '.'],
    ['a double dot', '..'],
  ])(
    'throws TypeError for %s, which the URL parser would drop from the path',
    async (_, id) => {
      const { double, clients } = clientsWith();

      await expect(clients.articles.get(id)).rejects.toThrow(
        new TypeError('articles get: an id must not be empty, "." or ".."'),
      );
      expect(double.sent).toHaveLength(0);
    },
  );

  it('throws TypeError for data that is not one resource object', async () => {
    const { clients } = clientsWith(
      jsonApi({ data: null }),
      jsonApi({ data: [ARTICLE] }),
    );

    await expect(clients.articles.get('a1')).rejects.toThrow(
      'articles get answered 200 with data that is not a resource object',
    );
    await expect(clients.articles.get('a1')).rejects.toThrow(TypeError);
  });

  it('throws TypeError for a 204, which holds no document', async () => {
    const { clients } = clientsWith(new Response(null, { status: 204 }));

    await expect(clients.articles.get('a1')).rejects.toThrow(
      new TypeError('articles get answered 204 without a JSON:API document'),
    );
  });
});

describe('related (SPEC 15.4)', () => {
  it('GETs a to-one related link: the record, or null', async () => {
    const { double, clients } = clientsWith(
      jsonApi({ data: ADA }),
      jsonApi({ data: null }),
    );

    const found = await clients.articles.related('a1', 'author', {
      fields: { people: ['name'] },
    });
    const none = await clients.articles.related('a2', 'author');

    expect(double.sent.map((sent) => sent.url)).toStrictEqual([
      `${ORIGIN}/api/articles/a1/author?fields%5Bpeople%5D=name`,
      `${ORIGIN}/api/articles/a2/author`,
    ]);
    expect(found.data).toStrictEqual({ type: 'people', id: 'p1', name: 'Ada' });
    expect(none.data).toBeNull();
  });

  it('GETs a to-many related link, resolving its records along the include sent', async () => {
    const { double, clients } = clientsWith(
      jsonApi({ data: [ARTICLE], included: [ADA] }),
    );

    const result = await clients.people.related('p1', 'articles', {
      include: ['author'],
    });

    expect(double.last().url).toBe(
      `${ORIGIN}/api/people/p1/articles?include=author`,
    );
    expect(result.data).toMatchObject([
      { id: 'a1', author: { type: 'people', id: 'p1', name: 'Ada' } },
    ]);
  });

  it('throws TypeError when a to-one answers a list', async () => {
    const { clients } = clientsWith(jsonApi({ data: [ADA] }));

    await expect(clients.articles.related('a1', 'author')).rejects.toThrow(
      new TypeError(
        'articles related answered 200 with data that is not a resource object or null',
      ),
    );
  });
});
