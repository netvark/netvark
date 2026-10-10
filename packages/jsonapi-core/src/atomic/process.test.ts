import { beforeEach, describe, expect, it } from 'vitest';

import { ATOMIC_OPERATIONS_EXTENSION } from '../internal/constants';
import { Authors, CALLER, Store, createProcessor } from './test-fixtures';
import { run } from './test-run';

let store: Store;

beforeEach(() => {
  store = new Store();
});

describe('operationsProcessor: results', () => {
  it('runs the specification example: two adds linked by a client-generated id', async () => {
    const { status, document } = await run(createProcessor(store), [
      {
        op: 'add',
        data: {
          type: 'authors',
          id: 'acb2ebd6-ed30-4877-80ce-52a14d77d470',
          attributes: { name: 'dgeb' },
        },
      },
      {
        op: 'add',
        data: {
          type: 'articles',
          attributes: { title: 'JSON API paints my bikeshed!' },
          relationships: {
            author: {
              data: {
                type: 'authors',
                id: 'acb2ebd6-ed30-4877-80ce-52a14d77d470',
              },
            },
          },
        },
      },
    ]);
    expect(status).toBe(200);
    expect(document?.jsonapi).toEqual({
      version: '1.1',
      ext: [ATOMIC_OPERATIONS_EXTENSION],
    });
    // The author was created with a client id and an identical representation.
    expect(document?.['atomic:results']).toEqual([
      {},
      {
        data: {
          type: 'articles',
          id: '1',
          attributes: { title: 'JSON API paints my bikeshed!' },
          relationships: {
            author: {
              data: {
                type: 'authors',
                id: 'acb2ebd6-ed30-4877-80ce-52a14d77d470',
              },
            },
            tags: { data: [] },
          },
          links: { self: 'https://api.test/articles/1' },
        },
      },
    ]);
  });

  it('resolves local ids across operations, including in refs', async () => {
    const { status, results } = await run(createProcessor(store), [
      {
        op: 'add',
        data: { type: 'authors', lid: 'a', attributes: { name: 'n' } },
      },
      {
        op: 'add',
        data: {
          type: 'articles',
          lid: 'art',
          attributes: { title: 'T' },
          relationships: {
            author: {
              data: { type: 'authors', lid: 'a', meta: { via: 'lid' } },
            },
          },
        },
      },
      {
        op: 'add',
        ref: { type: 'articles', lid: 'art', relationship: 'tags' },
        data: [{ type: 'tags', id: 't1' }],
      },
      {
        op: 'update',
        ref: { type: 'articles', lid: 'art' },
        data: { type: 'articles', lid: 'art', attributes: { title: 'T2' } },
      },
    ]);
    expect(status).toBe(200);
    expect(results[0]?.data).toMatchObject({ type: 'authors', id: '1' });
    expect(results[1]?.data).toMatchObject({
      id: '2',
      relationships: { author: { data: { type: 'authors', id: '1' } } },
    });
    expect(results[2]).toEqual({});
    expect(results[3]?.data).toMatchObject({
      attributes: { title: 'T2' },
      relationships: { tags: { data: [{ type: 'tags', id: 't1' }] } },
    });
    expect(store.articles.get('2')).toMatchObject({
      authorId: '1',
      tagIds: ['t1'],
    });
  });

  it('returns one empty result per operation and no document when nothing returned data: the host answers 204', async () => {
    store.articles.set('9', {
      id: '9',
      title: 't',
      authorId: null,
      tagIds: ['t1'],
    });
    const outcome = await run(createProcessor(store), [
      {
        op: 'update',
        ref: { type: 'articles', id: '9', relationship: 'author' },
        data: null,
      },
      {
        op: 'remove',
        ref: { type: 'articles', id: '9', relationship: 'tags' },
        data: [{ type: 'tags', id: 't1' }],
      },
      { op: 'remove', ref: { type: 'tags', id: 't1' } },
      { op: 'remove', ref: { type: 'articles', id: '9' } },
    ]);
    expect(outcome).toEqual({
      status: 204,
      results: [{}, {}, {}, {}],
      document: undefined,
      errors: [],
    });
    expect(store.articles.size).toBe(0);
    expect(store.tags.size).toBe(0);
  });

  it('hands the host context to the transaction and to every handler', async () => {
    const seen: Array<string> = [];
    const process = createProcessor(store, {
      resources: [
        {
          resource: Authors,
          create: (_input, { ctx, tx, index, pointer }) => {
            seen.push(`${ctx.user}:${String(index)}:${pointer}`);
            const row = { id: tx.id(), name: 'n' };
            tx.authors.set(row.id, row);
            return row;
          },
        },
      ],
      transaction: async (ctx, work) => {
        seen.push(`transaction:${ctx.user}`);
        return work(store);
      },
    });
    const { status } = await run(
      process,
      [{ op: 'add', data: { type: 'authors', attributes: { name: 'n' } } }],
      { user: 'bob' },
    );
    expect(status).toBe(200);
    expect(seen).toEqual(['transaction:bob', 'bob:0:/atomic:operations/0']);
  });
});

describe('operationsProcessor: failures roll everything back', () => {
  it('reports a later operation failure with its pointer and keeps no effect of earlier ones', async () => {
    const { status, errors } = await run(createProcessor(store), [
      { op: 'add', data: { type: 'authors', attributes: { name: 'kept?' } } },
      { op: 'add', data: { type: 'articles', attributes: {} } },
    ]);
    expect(status).toBe(422);
    expect(errors[0]).toMatchObject({
      code: 'VALIDATION_FAILED',
      source: { pointer: '/atomic:operations/1/data/attributes/title' },
    });
    expect(store.authors.size).toBe(0);
    expect(store.rollbacks).toBe(1);
  });

  it('points handler errors at the operation when they have no source', async () => {
    const { status, errors } = await run(createProcessor(store), [
      {
        op: 'update',
        data: { type: 'articles', id: '404', attributes: { title: 'x' } },
      },
    ]);
    expect(status).toBe(404);
    expect(errors[0]).toMatchObject({
      code: 'NOT_FOUND',
      detail: 'Article "404" does not exist',
      source: { pointer: '/atomic:operations/0' },
    });
  });

  it('lets other errors escape as they are, after the rollback', async () => {
    const process = createProcessor(store);
    await expect(
      process(
        {
          'atomic:operations': [
            { op: 'add', data: { type: 'authors', attributes: { name: 'n' } } },
            { op: 'remove', ref: { type: 'tags', id: 'boom' } },
          ],
        },
        CALLER,
      ),
    ).rejects.toThrow('disk on fire');
    expect(store.authors.size).toBe(0);
    expect(store.rollbacks).toBe(1);
  });
});
