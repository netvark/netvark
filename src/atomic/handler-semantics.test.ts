import { beforeEach, describe, expect, it } from 'vitest';

import { Authors, Store, createApp, post } from './test-fixtures';

interface Errors {
  readonly errors: Array<Record<string, unknown>>;
}

let store: Store;

beforeEach(() => {
  store = new Store();
});

describe('atomicOperations: operation semantics', () => {
  async function failure(
    operations: ReadonlyArray<unknown>,
  ): Promise<{ status: number; error: Record<string, unknown> }> {
    const { status, body } = await post(createApp(store), operations);
    const error = (body as Errors).errors[0];
    if (error === undefined) {
      throw new Error('expected an error object');
    }
    return { status, error };
  }

  it('404 for an unknown type, 403 for an unsupported operation', async () => {
    expect(
      await failure([{ op: 'add', data: { type: 'robots', attributes: {} } }]),
    ).toMatchObject({
      status: 404,
      error: { source: { pointer: '/atomic:operations/0/data/type' } },
    });
    expect(
      await failure([{ op: 'add', data: { type: 'tags' } }]),
    ).toMatchObject({
      status: 403,
      error: { code: 'FORBIDDEN', source: { pointer: '/atomic:operations/0' } },
    });
    expect(
      await failure([
        {
          op: 'update',
          ref: { type: 'authors', id: '1' },
          data: { type: 'authors', id: '1' },
        },
      ]),
    ).toMatchObject({ status: 403 });
    expect(
      await failure([
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
      const result = await failure([operation]);
      expect(result.status, JSON.stringify(operation)).toBe(400);
      expect(result.error['source'], JSON.stringify(operation)).toEqual({
        pointer,
      });
    }
  });

  it('rejects an unknown or repeated lid and a lid mismatch', async () => {
    expect(
      await failure([
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
      await failure([
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
      await failure([
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
      await failure([
        { op: 'remove', ref: { type: 'articles', lid: 'missing' } },
      ]),
    ).toMatchObject({
      status: 400,
      error: { source: { pointer: '/atomic:operations/0/ref/lid' } },
    });
  });

  it('requires a create handler to return the row when the operation declares a lid', async () => {
    const { status } = await post(createApp(store), [
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
    // The client id stands in for the row's id.
    expect(status).toBe(200);
    expect(store.articles.get('1')?.authorId).toBe('given');
  });
});

describe('atomicOperations: request requirements', () => {
  it('requires POST, the extension on Content-Type, and a JSON body', async () => {
    const get = await post(createApp(store), [], { method: 'GET' });
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
    const noExt = await post(createApp(store), [], {
      contentType: 'application/vnd.api+json',
    });
    expect(noExt.status).toBe(415);
    expect((noExt.body as Errors).errors[0]?.['detail']).toContain('ext=');
    const malformed = await post(createApp(store), [], { raw: '{' });
    expect(malformed.status).toBe(400);
  });

  it('caps the number of operations', async () => {
    const { status, body } = await post(
      createApp(store, { maxOperations: 1 }),
      [
        { op: 'remove', ref: { type: 'tags', id: 't1' } },
        { op: 'remove', ref: { type: 'tags', id: 't1' } },
      ],
    );
    expect(status).toBe(400);
    expect((body as Errors).errors[0]).toMatchObject({
      detail: 'At most 1 operations are accepted per request',
      source: { pointer: '/atomic:operations' },
    });
  });

  it('targets through href when a resolver is configured', async () => {
    store.articles.set('5', {
      id: '5',
      title: 't',
      authorId: null,
      tagIds: [],
    });
    const app = createApp(store, {
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
    const ok = await post(app, [
      {
        op: 'add',
        href: '/articles/5/relationships/tags',
        data: [{ type: 'tags', id: 't1' }],
      },
    ]);
    expect(ok.status).toBe(204);
    expect(store.articles.get('5')?.tagIds).toEqual(['t1']);
    const unresolved = await post(app, [{ op: 'remove', href: '/nope' }]);
    expect(unresolved.status).toBe(400);
    expect((unresolved.body as Errors).errors[0]).toMatchObject({
      source: { pointer: '/atomic:operations/0/href' },
    });
  });

  it('refuses two handler sets for one type at setup', () => {
    expect(() =>
      createApp(store, {
        resources: [
          {
            resource: Store.prototype.constructor === Store ? Authors : Authors,
          },
          { resource: Authors },
        ],
      }),
    ).toThrow(/listed twice/u);
  });
});
