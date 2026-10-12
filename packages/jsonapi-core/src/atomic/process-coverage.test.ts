import { beforeEach, describe, expect, it } from 'vitest';

import { defineResource } from '../resource/define-resource';
import { Authors, CALLER, Store, createProcessor } from './test-fixtures';
import { failure } from './test-run';

let store: Store;

beforeEach(() => {
  store = new Store();
});

describe('operationsProcessor: handler coverage', () => {
  it('answers 403 for relationship operations without a handler', async () => {
    store.articles.set('1', {
      id: '1',
      title: 't',
      authorId: null,
      tagIds: [],
    });
    for (const op of ['update', 'add', 'remove']) {
      const result = await failure(store, [
        {
          op,
          ref: { type: 'articles', id: '1', relationship: 'reviewers' },
          data: [],
        },
      ]);
      expect(result.status, op).toBe(403);
      expect(result.error.detail, op).toBe(
        `"articles.reviewers" does not support ${op}`,
      );
    }
  });

  it('answers 403 for resource operations without a handler', async () => {
    const Bare = defineResource({
      type: 'bare',
      attributes: [],
      serialize: (row: { id: string }) => ({ id: row.id }),
    });
    const overrides = { resources: [{ resource: Bare }] };
    expect(
      await failure(
        store,
        [{ op: 'remove', ref: { type: 'bare', id: '1' } }],
        overrides,
      ),
    ).toMatchObject({
      status: 403,
      error: { detail: '"bare" does not support remove' },
    });
    expect(
      await failure(
        store,
        [{ op: 'update', data: { type: 'bare', id: '1' } }],
        overrides,
      ),
    ).toMatchObject({
      status: 403,
      error: { detail: '"bare" does not support update' },
    });
  });

  it('reports linkage problems in relationship operations with indexed pointers', async () => {
    store.articles.set('1', {
      id: '1',
      title: 't',
      authorId: null,
      tagIds: [],
    });
    expect(
      await failure(store, [
        {
          op: 'add',
          ref: { type: 'articles', id: '1', relationship: 'tags' },
          data: [
            { type: 'tags', id: 't1' },
            { type: 'labels', id: 'x' },
          ],
        },
      ]),
    ).toMatchObject({
      status: 409,
      error: { source: { pointer: '/atomic:operations/0/data/1/type' } },
    });
    expect(
      await failure(store, [
        {
          op: 'update',
          ref: { type: 'articles', id: '1', relationship: 'author' },
          data: [{ type: 'authors', id: '1' }],
        },
      ]),
    ).toMatchObject({
      status: 400,
      error: { source: { pointer: '/atomic:operations/0/data' } },
    });
  });

  it('rejects a non-string data type and a collection target for remove', async () => {
    expect(
      await failure(store, [{ op: 'add', data: { type: 1 } }]),
    ).toMatchObject({
      status: 400,
      error: { source: { pointer: '/atomic:operations/0/data/type' } },
    });
    expect(
      await failure(store, [{ op: 'remove', href: '/tags' }], {
        resolveHref: () => ({ type: 'tags' }),
      }),
    ).toMatchObject({
      status: 400,
      error: {
        detail: 'The target must name a resource by id or lid',
        source: { pointer: '/atomic:operations/0/href' },
      },
    });
  });

  it('fails loudly when a create handler returns nothing for an operation with a lid', async () => {
    const process = createProcessor(store, {
      // Returns the client id, which this operation does not carry.
      resources: [{ resource: Authors, create: ({ data }) => data.id }],
    });
    await expect(
      process(
        {
          'atomic:operations': [
            {
              op: 'add',
              data: { type: 'authors', lid: 'a', attributes: { name: 'n' } },
            },
          ],
        },
        CALLER,
      ),
    ).rejects.toThrow(TypeError);
  });
});
