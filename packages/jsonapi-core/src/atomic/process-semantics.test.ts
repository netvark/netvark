import { beforeEach, describe, expect, it } from 'vitest';

import {
  Authors,
  Store,
  createProcessor,
  handlersCapped,
} from './test-fixtures';
import { failure, run } from './test-run';

let store: Store;

beforeEach(() => {
  store = new Store();
});

describe('operationsProcessor: operation semantics', () => {
  it('404 for an unknown type, 403 for an unsupported operation', async () => {
    expect(
      await failure(store, [
        { op: 'add', data: { type: 'robots', attributes: {} } },
      ]),
    ).toMatchObject({
      status: 404,
      error: { source: { pointer: '/atomic:operations/0/data/type' } },
    });
    expect(
      await failure(store, [{ op: 'add', data: { type: 'tags' } }]),
    ).toMatchObject({
      status: 403,
      error: { code: 'FORBIDDEN', source: { pointer: '/atomic:operations/0' } },
    });
    expect(
      await failure(store, [
        {
          op: 'update',
          ref: { type: 'authors', id: '1' },
          data: { type: 'authors', id: '1' },
        },
      ]),
    ).toMatchObject({ status: 403 });
    expect(
      await failure(store, [
        {
          op: 'update',
          ref: { type: 'articles', id: '1', relationship: 'tags' },
          data: [],
        },
      ]),
    ).toMatchObject({ status: 404 });
  });

  it('rejects malformed targets and codes with 400 at the right pointer', async () => {
    const cases: Array<[unknown, string]> = [
      [
        {
          op: 'add',
          ref: { type: 'articles', id: '1' },
          data: { type: 'articles' },
        },
        '/atomic:operations/0',
      ],
      [{ op: 'remove' }, '/atomic:operations/0'],
      [
        {
          op: 'add',
          ref: { type: 'articles', id: '1', relationship: 'author' },
          data: [],
        },
        '/atomic:operations/0/op',
      ],
      [
        {
          op: 'update',
          ref: { type: 'articles', id: '1', relationship: 'editor' },
          data: null,
        },
        '/atomic:operations/0/ref/relationship',
      ],
      [
        {
          op: 'update',
          ref: { type: 'articles', id: '1', relationship: 'author' },
        },
        '/atomic:operations/0',
      ],
      [{ op: 'add' }, '/atomic:operations/0'],
      [
        {
          op: 'update',
          data: { type: 'articles', attributes: { title: 'x' } },
        },
        '/atomic:operations/0/data/id',
      ],
    ];
    for (const [operation, pointer] of cases) {
      const result = await failure(store, [operation]);
      expect(result.status, JSON.stringify(operation)).toBe(400);
      expect(result.error.source, JSON.stringify(operation)).toEqual({
        pointer,
      });
    }
  });

  it('rejects an unknown or repeated lid and a lid mismatch', async () => {
    expect(
      await failure(store, [
        {
          op: 'add',
          data: {
            type: 'articles',
            attributes: { title: 'x' },
            relationships: {
              author: { data: { type: 'authors', lid: 'nope' } },
            },
          },
        },
      ]),
    ).toMatchObject({
      status: 400,
      error: {
        source: {
          pointer: '/atomic:operations/0/data/relationships/author/data/lid',
        },
      },
    });
    expect(
      await failure(store, [
        {
          op: 'add',
          data: { type: 'authors', lid: 'a', attributes: { name: 'x' } },
        },
        {
          op: 'add',
          data: { type: 'authors', lid: 'a', attributes: { name: 'y' } },
        },
      ]),
    ).toMatchObject({
      status: 400,
      error: { source: { pointer: '/atomic:operations/1/data/lid' } },
    });
    expect(
      await failure(store, [
        {
          op: 'add',
          data: { type: 'articles', lid: 'a', attributes: { title: 'x' } },
        },
        {
          op: 'update',
          ref: { type: 'articles', lid: 'a' },
          data: { type: 'articles', lid: 'b' },
        },
      ]),
    ).toMatchObject({
      status: 409,
      error: { source: { pointer: '/atomic:operations/1/data/lid' } },
    });
    expect(
      await failure(store, [
        { op: 'remove', ref: { type: 'articles', lid: 'missing' } },
      ]),
    ).toMatchObject({
      status: 400,
      error: { source: { pointer: '/atomic:operations/0/ref/lid' } },
    });
  });

  it('lets a client-generated id stand in for the row when a create handler returns nothing', async () => {
    const { status } = await run(createProcessor(store), [
      {
        op: 'add',
        data: {
          type: 'authors',
          id: 'given',
          lid: 'a',
          attributes: { name: 'n' },
        },
      },
      {
        op: 'add',
        data: {
          type: 'articles',
          attributes: { title: 't' },
          relationships: { author: { data: { type: 'authors', lid: 'a' } } },
        },
      },
    ]);
    expect(status).toBe(200);
    expect(store.articles.get('1')?.authorId).toBe('given');
  });
});

describe('operationsProcessor: options', () => {
  it('caps the number of operations at the atomic.max the definitions share', async () => {
    const removal = { op: 'remove', ref: { type: 'tags', id: 't1' } };
    const capped = { resources: handlersCapped(1) };
    const { status, error } = await failure(store, [removal, removal], capped);
    expect(status).toBe(400);
    expect(error).toMatchObject({
      detail: 'At most 1 operations are accepted per request',
      source: { pointer: '/atomic:operations' },
    });
    const atCap = await run(createProcessor(store, capped), [removal]);
    expect(atCap.status).toBe(204);
    expect(store.tags.has('t1')).toBe(false);
  });

  it('refuses definitions whose caps differ, at setup', () => {
    // authors capped at 1, articles at 2
    const resources = [
      ...handlersCapped(1).slice(0, 1),
      ...handlersCapped(2).slice(1, 2),
    ];
    expect(() => createProcessor(store, { resources })).toThrow(
      new TypeError(
        "operationsProcessor: the resources' definitions have different atomic.max (1, 2); one endpoint takes one cap",
      ),
    );
  });

  it('takes the default cap without resources', async () => {
    const removal = { op: 'remove', ref: { type: 'tags', id: 't1' } };
    const { errors } = await run(
      createProcessor(store, { resources: [] }),
      Array.from({ length: 11 }, () => removal),
    );
    expect(errors).toMatchObject([
      { detail: 'At most 10 operations are accepted per request' },
    ]);
  });

  it('targets through href when a resolver is configured', async () => {
    store.articles.set('5', {
      id: '5',
      title: 't',
      authorId: null,
      tagIds: [],
    });
    const process = createProcessor(store, {
      resolveHref: (href) => {
        const match =
          /^\/articles\/(?<id>[^/]+)\/relationships\/(?<name>[^/]+)$/u.exec(
            href,
          );
        return match?.groups === undefined
          ? undefined
          : {
              type: 'articles',
              id: match.groups['id'],
              relationship: match.groups['name'],
            };
      },
    });
    const ok = await run(process, [
      {
        op: 'add',
        href: '/articles/5/relationships/tags',
        data: [{ type: 'tags', id: 't1' }],
      },
    ]);
    expect(ok.status).toBe(204);
    expect(store.articles.get('5')?.tagIds).toEqual(['t1']);
    const unresolved = await run(process, [{ op: 'remove', href: '/nope' }]);
    expect(unresolved.status).toBe(400);
    expect(unresolved.errors[0]).toMatchObject({
      source: { pointer: '/atomic:operations/0/href' },
    });
  });

  it('refuses two handler sets for one type at setup', () => {
    expect(() =>
      createProcessor(store, {
        resources: [{ resource: Authors }, { resource: Authors }],
      }),
    ).toThrow(/listed twice/u);
  });
});
