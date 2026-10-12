import type { AnyResource } from '@netvark/jsonapi-core';

import type { QueryServer } from '../test-support/query-server';

import { InfiniteQueryObserver, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import {
  createClients,
  createTransport,
  isResponseError,
} from '@netvark/jsonapi-client';
import { createDefineResource } from '@netvark/jsonapi-core';

import {
  contact,
  ok,
  queryServer,
  untilAborted,
} from '../test-support/query-server';
import { resourceQueries } from './queries';

/** Tags, which a raw definition declares without pages. */
const Tags: AnyResource = createDefineResource({
  links: { base: 'https://api.example.test' },
})({
  type: 'tags',
  attributes: ['name'],
  serialize: (row: { readonly id: string }) => ({ id: row.id }),
});

/** A read started as a component starts it, and the key it caches under. */
type Started = (server: QueryServer) => {
  readonly reading: Promise<unknown>;
  readonly queryKey: ReadonlyArray<unknown>;
};

const READS: ReadonlyArray<readonly [string, Started]> = [
  [
    'a list',
    ({ clients, queryClient }) => {
      const options = resourceQueries(clients.contacts).list();
      const reading = new QueryObserver(queryClient, options).refetch();
      return { reading, queryKey: options.queryKey };
    },
  ],
  [
    'a page',
    ({ clients, queryClient }) => {
      const options = resourceQueries(clients.contacts).pages();
      const reading = new InfiniteQueryObserver(queryClient, options).refetch();
      return { reading, queryKey: options.queryKey };
    },
  ],
  [
    'a record',
    ({ clients, queryClient }) => {
      const options = resourceQueries(clients.contacts).get('7');
      const reading = new QueryObserver(queryClient, options).refetch();
      return { reading, queryKey: options.queryKey };
    },
  ],
];

describe('the reads of resourceQueries (resource SPEC 20.6)', () => {
  it('lists through the client, resolving to its page of records with the links', async () => {
    const links = { next: '/api/contacts?page%5Bafter%5D=c1' };
    const { clients, arrivals, queryClient } = queryServer(() =>
      ok([contact('1', 'Ada', 'c1')], links),
    );
    const options = resourceQueries(clients.contacts).list({ sort: ['name'] });
    const { data } = await new QueryObserver(queryClient, options).refetch();
    expect(arrivals.map(({ method, target }) => [method, target])).toEqual([
      ['GET', '/api/contacts?sort=name'],
    ]);
    expect(data?.data).toEqual([
      {
        type: 'contacts',
        id: '1',
        name: 'Ada',
        $meta: { page: { cursor: 'c1' } },
      },
    ]);
    expect(data?.links).toEqual(links);
    expect(queryClient.getQueryData(options.queryKey)).toBe(data);
  });

  it('gets a record with the include and fields it asks for', async () => {
    const { clients, arrivals, queryClient } = queryServer(() => ({
      status: 200,
      document: {
        data: {
          ...contact('7', 'Ada'),
          relationships: {
            organization: { data: { type: 'organizations', id: '1' } },
          },
        },
        included: [
          { type: 'organizations', id: '1', attributes: { name: 'Acme' } },
        ],
      },
    }));
    const options = resourceQueries(clients.contacts).get('7', {
      include: ['organization'],
      fields: { contacts: ['name', 'organization'] },
    });
    const { data } = await new QueryObserver(queryClient, options).refetch();
    expect(arrivals.map(({ target }) => target)).toEqual([
      '/api/contacts/7?include=organization&fields[contacts]=name,organization',
    ]);
    expect(data?.data).toMatchObject({
      id: '7',
      name: 'Ada',
      organization: { type: 'organizations', id: '1', name: 'Acme' },
    });
  });

  it.each(READS)(
    'aborts the request of %s whose query is cancelled',
    async (_name, start) => {
      const server = queryServer(untilAborted);
      const { reading, queryKey } = start(server);
      await vi.waitFor(() => {
        expect(server.arrivals).toHaveLength(1);
      });
      expect(server.arrivals[0]?.signal.aborted).toBe(false);
      await server.queryClient.cancelQueries({ queryKey });
      expect(server.arrivals[0]?.signal.aborted).toBe(true);
      await reading;
      expect(server.queryClient.getQueryState(queryKey)).toMatchObject({
        data: undefined,
        fetchStatus: 'idle',
      });
    },
  );

  it("settles a refused read with the client's ResponseError", async () => {
    const { clients, queryClient } = queryServer(() => ({
      status: 404,
      document: { errors: [{ status: '404', code: 'NOT_FOUND' }] },
    }));
    const options = resourceQueries(clients.contacts).get('9');
    const { error } = await new QueryObserver(queryClient, options).refetch();
    expect(error).toSatisfy(
      (refusal) =>
        isResponseError(refusal, 'NOT_FOUND') && refusal.status === 404,
    );
  });

  it('refuses what is not a client, and pages of a definition that does not paginate', () => {
    for (const value of [undefined, {}, { definition: Tags }, Tags]) {
      expect(() => resourceQueries(value as never)).toThrow(
        new TypeError(
          'resourceQueries: client must be a client createClients returned',
        ),
      );
    }
    const { tags } = createClients(
      { tags: Tags },
      createTransport({ origin: 'https://api.example.test' }),
    );
    const queries = resourceQueries(tags);
    expect(queries.list().queryKey).toEqual(['tags', 'list', '']);
    expect(() => queries.pages()).toThrow(
      new TypeError(
        'resourceQueries: tags does not paginate, so it has no pages',
      ),
    );
  });
});
