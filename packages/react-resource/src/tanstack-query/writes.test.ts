import type {
  QueryClient,
  QueryObserverOptions,
  QueryObserverResult,
} from '@tanstack/react-query';

import type { Arrival } from '../test-support/query-server';

import { MutationObserver, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { isResponseError } from '@netvark/jsonapi-client';

import { contact, held, ok, queryServer } from '../test-support/query-server';
import { resourceQueries } from './queries';

const ADA = contact('1', 'Ada');
const GRACE = contact('2', 'Grace');
const NOT_FOUND = { status: 404, document: { errors: [{ status: '404' }] } };

/** Each request as its method and target. */
function sent(arrivals: ReadonlyArray<Arrival>): Array<string> {
  return arrivals.map(({ method, target }) => `${method} ${target}`);
}

/** The names of the records a list result holds. */
function names(result: QueryObserverResult<any>): Array<string> {
  return result.data.data.map(({ name }: { name: string }) => name);
}

/** A screen showing what `options` reads: an observer subscribed, as a mounted `useQuery` is. */
async function showing(
  queryClient: QueryClient,
  options: QueryObserverOptions<any, any, any, any, any>,
) {
  const observer = new QueryObserver(queryClient, options);
  observer.subscribe(() => {});
  await vi.waitFor(() => {
    expect(observer.getCurrentResult().isSuccess).toBe(true);
  });
  return observer;
}

describe('the writes of resourceQueries (resource SPEC 20.6)', () => {
  it('creates, pending until the list a screen shows has refetched, and leaves an unshown record stale', async () => {
    const refetched = held();
    const { clients, arrivals, queryClient } = queryServer(async (arrival) => {
      if (arrival.method === 'POST') {
        return { status: 201, document: { data: GRACE } };
      }
      if (arrival.target !== '/api/contacts') {
        return ok(ADA);
      }
      return arrivals.length === 1 ? ok([ADA]) : refetched.answer;
    });
    const contacts = resourceQueries(clients.contacts);
    const list = await showing(queryClient, contacts.list());
    await new QueryObserver(queryClient, contacts.get('1')).refetch();
    const mutation = new MutationObserver(queryClient, contacts.create());
    const creating = mutation.mutate({ attributes: { name: 'Grace' } });
    await vi.waitFor(() => {
      expect(sent(arrivals)).toEqual([
        'GET /api/contacts',
        'GET /api/contacts/1',
        'POST /api/contacts',
        'GET /api/contacts',
      ]);
    });
    expect(mutation.getCurrentResult().isPending).toBe(true);
    refetched.release(ok([ADA, GRACE]));
    await expect(creating).resolves.toMatchObject({
      status: 201,
      data: { id: '2', name: 'Grace' },
    });
    expect(names(list.getCurrentResult())).toEqual(['Ada', 'Grace']);
    expect(
      queryClient.getQueryState(contacts.get('1').queryKey)?.isInvalidated,
    ).toBe(true);
    expect(arrivals).toHaveLength(4);
  });

  it('updates the record of { id, ...input } and refetches it where a screen shows it', async () => {
    const { clients, arrivals, queryClient } = queryServer((arrival) =>
      arrival.method === 'PATCH' || arrivals.length > 2
        ? ok(contact('1', 'Ada Lovelace'))
        : ok(ADA),
    );
    const contacts = resourceQueries(clients.contacts);
    const record = await showing(queryClient, contacts.get('1'));
    const mutation = new MutationObserver(queryClient, contacts.update());
    await mutation.mutate({ id: '1', attributes: { name: 'Ada Lovelace' } });
    expect(sent(arrivals)).toEqual([
      'GET /api/contacts/1',
      'PATCH /api/contacts/1',
      'GET /api/contacts/1',
    ]);
    expect(arrivals[1]?.body).toEqual({
      data: { type: 'contacts', id: '1', attributes: { name: 'Ada Lovelace' } },
    });
    expect(record.getCurrentResult().data.data.name).toBe('Ada Lovelace');
  });

  it("removes the record's entries before the lists refetch, so a screen showing it does not ask for it again", async () => {
    let removed = false;
    const { clients, arrivals, queryClient } = queryServer((arrival) => {
      if (arrival.method === 'DELETE') {
        removed = true;
        return { status: 204 };
      }
      if (arrival.target === '/api/contacts') {
        return ok(removed ? [GRACE] : [ADA, GRACE]);
      }
      return removed ? NOT_FOUND : ok(ADA);
    });
    const contacts = resourceQueries(clients.contacts);
    const list = await showing(queryClient, contacts.list());
    const record = await showing(queryClient, contacts.get('1'));
    await new QueryObserver(
      queryClient,
      contacts.get('1', { include: ['organization'] }),
    ).refetch();
    await new MutationObserver(queryClient, contacts.remove()).mutate('1');
    expect(sent(arrivals)).toEqual([
      'GET /api/contacts',
      'GET /api/contacts/1',
      'GET /api/contacts/1?include=organization',
      'DELETE /api/contacts/1',
      'GET /api/contacts',
    ]);
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ['contacts', 'get', '1'] }),
    ).toEqual([]);
    expect(names(list.getCurrentResult())).toEqual(['Grace']);
    expect(record.getCurrentResult().isError).toBe(false);
  });

  it('invalidates the other types the write names, pending until they have refetched, then runs the onSuccess of mutate', async () => {
    const refetched = held();
    const { clients, arrivals, queryClient } = queryServer(async (arrival) => {
      if (arrival.method === 'DELETE') {
        return { status: 204 };
      }
      return arrival.target === '/api/organizations' && arrivals.length > 2
        ? refetched.answer
        : ok([]);
    });
    const contacts = resourceQueries(clients.contacts);
    const organizations = resourceQueries(clients.organizations);
    await showing(queryClient, contacts.list());
    const shown = await showing(queryClient, organizations.list());
    const mutation = new MutationObserver(
      queryClient,
      contacts.remove({ invalidates: [organizations.all] }),
    );
    // A mutate call's callbacks run while the observer has a listener, as
    // a mounted useMutation's does.
    mutation.subscribe(() => {});
    const seen: Array<number> = [];
    const removing = mutation.mutate('1', {
      onSuccess: () => {
        seen.push(shown.getCurrentResult().data.data.length);
      },
    });
    await vi.waitFor(() => {
      expect(sent(arrivals).slice(2).toSorted()).toEqual([
        'DELETE /api/contacts/1',
        'GET /api/contacts',
        'GET /api/organizations',
      ]);
    });
    expect(mutation.getCurrentResult().isPending).toBe(true);
    refetched.release(
      ok([{ type: 'organizations', id: '1', attributes: { name: 'Acme' } }]),
    );
    await removing;
    expect(seen).toEqual([1]);
  });

  it('refuses invalidates that is not a list of query keys', () => {
    const { clients } = queryServer(() => ok([]));
    const contacts = resourceQueries(clients.contacts);
    const writes = [
      (settings: object) => contacts.create(settings),
      (settings: object) => contacts.update(settings),
      (settings: object) => contacts.remove(settings),
    ];
    for (const invalidates of [contacts.all, 'contacts', [contacts.all, 'x']]) {
      for (const write of writes) {
        expect(() => write({ invalidates })).toThrow(
          new TypeError(
            'resourceQueries: invalidates must be a list of query keys',
          ),
        );
      }
    }
  });

  it('invalidates nothing when the server refuses the write', async () => {
    const { clients, arrivals, queryClient } = queryServer((arrival) =>
      arrival.method === 'POST'
        ? {
            status: 409,
            document: {
              errors: [{ status: '409', code: 'CONTACT_EMAIL_TAKEN' }],
            },
          }
        : ok([ADA]),
    );
    const contacts = resourceQueries(clients.contacts);
    await showing(queryClient, contacts.list());
    const mutation = new MutationObserver(queryClient, contacts.create());
    await expect(
      mutation.mutate({ attributes: { name: 'Ada' } }),
    ).rejects.toSatisfy((error) =>
      isResponseError(error, 'CONTACT_EMAIL_TAKEN'),
    );
    expect(sent(arrivals)).toEqual(['GET /api/contacts', 'POST /api/contacts']);
    expect(
      queryClient.getQueryState(contacts.list().queryKey)?.isInvalidated,
    ).toBe(false);
  });
});
