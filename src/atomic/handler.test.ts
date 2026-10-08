import { beforeEach, describe, expect, it } from 'vitest';

import { ATOMIC_OPERATIONS_EXTENSION } from '../internal/constants';
import { ATOMIC_MEDIA_TYPE, Store, createApp, post } from './test-fixtures';

interface Results {
  readonly jsonapi: unknown;
  readonly 'atomic:results': Array<{ data?: Record<string, unknown> }>;
}

interface Errors {
  readonly errors: Array<Record<string, unknown>>;
}

let store: Store;

beforeEach(() => {
  store = new Store();
});

describe('atomicOperations: responses', () => {
  it('runs the specification example: two adds linked by a client-generated id', async () => {
    const { status, headers, body } = await post(createApp(store), [
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
    expect(headers.get('content-type')).toBe(ATOMIC_MEDIA_TYPE);
    expect(headers.get('vary')).toBe('Accept');
    const results = body as Results;
    expect(results.jsonapi).toEqual({
      version: '1.1',
      ext: [ATOMIC_OPERATIONS_EXTENSION],
    });
    // The author was created with a client id and an identical representation.
    expect(results['atomic:results']).toEqual([
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
    const { status, body } = await post(createApp(store), [
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
    const results = (body as Results)['atomic:results'];
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

  it('answers 204 when no operation returned data', async () => {
    store.articles.set('9', {
      id: '9',
      title: 't',
      authorId: null,
      tagIds: ['t1'],
    });
    const { status, body, headers } = await post(createApp(store), [
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
    expect(status).toBe(204);
    expect(body).toBeUndefined();
    expect(headers.get('content-type')).toBeNull();
    expect(store.articles.size).toBe(0);
    expect(store.tags.size).toBe(0);
  });
});

describe('atomicOperations: failures roll everything back', () => {
  it('reports a later operation failure with its pointer and keeps no effect of earlier ones', async () => {
    const { status, body } = await post(createApp(store), [
      { op: 'add', data: { type: 'authors', attributes: { name: 'kept?' } } },
      { op: 'add', data: { type: 'articles', attributes: {} } },
    ]);
    expect(status).toBe(422);
    expect((body as Errors).errors[0]).toMatchObject({
      code: 'VALIDATION_FAILED',
      source: { pointer: '/atomic:operations/1/data/attributes/title' },
    });
    expect(store.authors.size).toBe(0);
    expect(store.rollbacks).toBe(1);
  });

  it('points handler errors at the operation when they have no source', async () => {
    const { status, body } = await post(createApp(store), [
      {
        op: 'update',
        data: { type: 'articles', id: '404', attributes: { title: 'x' } },
      },
    ]);
    expect(status).toBe(404);
    expect((body as Errors).errors[0]).toMatchObject({
      code: 'NOT_FOUND',
      detail: 'Article "404" does not exist',
      source: { pointer: '/atomic:operations/0' },
    });
  });

  it('lets other errors reach app.onError after rolling back', async () => {
    const { status, body } = await post(createApp(store), [
      { op: 'add', data: { type: 'authors', attributes: { name: 'n' } } },
      { op: 'remove', ref: { type: 'tags', id: 'boom' } },
    ]);
    expect(status).toBe(500);
    expect((body as Errors).errors[0]?.['code']).toBe('INTERNAL_SERVER_ERROR');
    expect(store.authors.size).toBe(0);
    expect(store.rollbacks).toBe(1);
  });
});
