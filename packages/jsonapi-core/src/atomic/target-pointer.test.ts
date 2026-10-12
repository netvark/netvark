/**
 * Where an error about an operation's target points (SPEC 11.4): under
 * `ref` at the member at fault, and at `href` itself for a target the
 * resolver read from it, since the request then holds no `ref`.
 * @ref https://jsonapi.org/ext/atomic/#processing-errors ("a pointer to the source of the problem in the request document")
 */
import type { OperationTarget } from './types';

import { beforeEach, describe, expect, it } from 'vitest';

import { Store } from './test-fixtures';
import { failure } from './test-run';

/** The targets the hrefs of the tests name. */
const TARGETS: Readonly<Record<string, OperationTarget>> = {
  '/articles': { type: 'articles' },
  '/nopes': { type: 'nopes' },
  '/nopes/1': { type: 'nopes', id: '1' },
  '/articles/1/relationships/editor': {
    type: 'articles',
    id: '1',
    relationship: 'editor',
  },
  '/articles/x': { type: 'articles', lid: 'x' },
};

function resolveHref(href: string): OperationTarget | undefined {
  return Object.hasOwn(TARGETS, href) ? TARGETS[href] : undefined;
}

let store: Store;

beforeEach(() => {
  store = new Store();
  store.articles.set('1', { id: '1', title: 't', authorId: null, tagIds: [] });
});

/** The status and the pointer of the first error `operation` fails with. */
async function pointed(
  operation: Readonly<Record<string, unknown>>,
): Promise<ReadonlyArray<unknown>> {
  const { status, error } = await failure(store, [operation], { resolveHref });
  return [status, error.source?.pointer];
}

describe('target pointers (SPEC 11.4)', () => {
  it('points at the member of ref at fault', async () => {
    expect(
      await pointed({ op: 'remove', ref: { type: 'nopes', id: '1' } }),
    ).toEqual([404, '/atomic:operations/0/ref/type']);
    expect(
      await pointed({
        op: 'update',
        ref: { type: 'articles', id: '1', relationship: 'editor' },
        data: null,
      }),
    ).toEqual([400, '/atomic:operations/0/ref/relationship']);
    expect(
      await pointed({ op: 'remove', ref: { type: 'articles', lid: 'x' } }),
    ).toEqual([400, '/atomic:operations/0/ref/lid']);
  });

  it('points at href for every target the resolver read from it', async () => {
    const operations = [
      { op: 'add', href: '/nopes', data: { type: 'nopes' } },
      { op: 'remove', href: '/nopes/1' },
      {
        op: 'update',
        href: '/articles',
        data: { type: 'articles', attributes: { title: 'u' } },
      },
      { op: 'remove', href: '/articles' },
      { op: 'update', href: '/articles/1/relationships/editor', data: null },
      { op: 'remove', href: '/articles/x' },
    ];
    const pointers = await Promise.all(
      operations.map(async (operation) => pointed(operation)),
    );
    expect(pointers).toEqual([
      [404, '/atomic:operations/0/href'],
      [404, '/atomic:operations/0/href'],
      [400, '/atomic:operations/0/href'],
      [400, '/atomic:operations/0/href'],
      [400, '/atomic:operations/0/href'],
      [400, '/atomic:operations/0/href'],
    ]);
  });
});
