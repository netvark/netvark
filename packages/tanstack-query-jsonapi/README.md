# @netvark/tanstack-query-jsonapi

[TanStack Query](https://tanstack.com/query/v5) options for
[`@netvark/jsonapi-client`](https://github.com/netvark/netvark/tree/main/packages/jsonapi-client#readme)'s
calls, which the hooks of every adapter take as they are: React's, Vue's, Solid's, Svelte's, and
Angular's. Each read is keyed by the request it sends, so two queries that send one request share
one cache entry; a read passes the query's signal, so a cancelled query aborts its request; an
infinite list pages by the server's links; and a write stays pending until the reads it changed have
refetched. The options are plain objects typed with `@tanstack/query-core`, the core every adapter
is built on, and the package imports no framework and no adapter. The contract is section 16 of
[`docs/jsonapi/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/jsonapi/SPEC.md), and the
decision behind it
[ADR 0020](https://github.com/netvark/netvark/blob/main/docs/jsonapi/adr/0020-tanstack-query-options-are-the-clients-binding-typed-through-query-core.md).

Status: in development and unreleased.

## Install

```bash
pnpm add @netvark/tanstack-query-jsonapi @netvark/jsonapi-client
pnpm add @tanstack/react-query
```

Install your adapter alone: `@tanstack/react-query`, `@tanstack/vue-query`, `@tanstack/solid-query`,
or `@tanstack/angular-query-experimental` at 5.89 or later, or `@tanstack/svelte-query` 6, for
Svelte 5. Each depends on one exact release of `@tanstack/query-core`, which this package takes as
an optional peer from 5.89 and imports only types from, so it reads your adapter's copy. Do not list
`@tanstack/query-core` yourself: a range of your own installs a second copy once a newer release is
published, and a key tagged by one copy is untagged for the other copy's `getQueryData`
([ADR 0011](https://github.com/netvark/netvark/blob/main/docs/adr/0011-a-binding-takes-the-core-an-adapter-brings-as-an-optional-peer.md)).
Under Yarn Plug'n'Play, which gives a package no peer its parent does not provide, list it at the
exact release your adapter depends on, which `yarn why @tanstack/query-core` shows.

`@netvark/jsonapi-client` is a peer dependency: the options call the clients your application makes
([ADR 0006](https://github.com/netvark/netvark/blob/main/docs/adr/0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md)).

## Queries

`resourceQueries(client)` gives the reads and writes of one resource. Make them once per resource,
beside the clients
([Calls](https://github.com/netvark/netvark/tree/main/packages/jsonapi-client#calls)):

```ts
// src/api/queries.ts
import { resourceQueries } from '@netvark/tanstack-query-jsonapi';

import { clients } from './clients';

export const contacts = resourceQueries(clients.contacts);
export const meetings = resourceQueries(clients.meetings);
```

```tsx
// src/contacts/contact-list.tsx
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';

import { contacts, meetings } from '../api/queries';

export function ContactList() {
  const list = useInfiniteQuery(contacts.pages({ sort: ['name'], page: { size: 25 } }));
  // Removing a contact sets their meetings' contact to null, so the meetings refetch too.
  const remove = useMutation(contacts.remove({ invalidates: [meetings.all] }));
  if (list.isPending) {
    return <p>Loading</p>;
  }
  if (list.isError) {
    return <p role="alert">The contacts could not be loaded.</p>;
  }
  return (
    <>
      <ul>
        {list.data.pages
          .flatMap((page) => page.data)
          .map((contact) => (
            <li key={contact.id}>
              {contact.name}
              <button disabled={remove.isPending} onClick={() => remove.mutate(contact.id)}>
                Remove
              </button>
            </li>
          ))}
      </ul>
      {list.hasNextPage && (
        <button disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          More
        </button>
      )}
    </>
  );
}
```

Every adapter takes the same options, as it takes its own:

| Adapter        | Read                                         | Infinite list                                             | Write                                     |
| -------------- | -------------------------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| React Query    | `useQuery(contacts.get(id))`                 | `useInfiniteQuery(contacts.pages(query))`                 | `useMutation(contacts.remove())`          |
| Vue Query      | `useQuery(() => contacts.get(id.value))`     | `useInfiniteQuery(() => contacts.pages(query.value))`     | `useMutation(contacts.remove())`          |
| Solid Query    | `useQuery(() => contacts.get(props.id))`     | `useInfiniteQuery(() => contacts.pages(query()))`         | `useMutation(() => contacts.remove())`    |
| Svelte Query 6 | `createQuery(() => contacts.get(id))`        | `createInfiniteQuery(() => contacts.pages(query))`        | `createMutation(() => contacts.remove())` |
| Angular Query  | `injectQuery(() => contacts.get(this.id()))` | `injectInfiniteQuery(() => contacts.pages(this.query()))` | `injectMutation(() => contacts.remove())` |

| Member                                      | Options        | Key                                                  |
| ------------------------------------------- | -------------- | ---------------------------------------------------- |
| `contacts.list(query)`                      | `ReadOptions`  | `['contacts', 'list', <query string>]`               |
| `contacts.pages(query)`                     | `PagesOptions` | `['contacts', 'pages', <query string>]`              |
| `contacts.get(id, query)`                   | `ReadOptions`  | `['contacts', 'get', id, <include, fields>]`         |
| `contacts.create()`, `update()`, `remove()` | `WriteOptions` | `['contacts', 'create']` and so on, as `mutationKey` |
| `contacts.all`                              |                | `['contacts']`: every list, page, and record         |

A read resolves to the client's result: the records in `data`, the document's `links` and `meta`
beside them, each record typed by the query's `include` and `fields`. A refused read settles the
query with the client's `ResponseError`. `update` takes `{ id, ...input }`, and `remove` the id. A
write resolves once every read it invalidated has refetched, so its `isPending` covers the refresh,
and `remove` drops the record's own entries first, so a screen still showing it does not ask the
server for it again. A refused write rejects with the client's `ResponseError` and invalidates
nothing.

## Types

The options hold only the members `resourceQueries` sets, so a hook infers everything from them: the
data is the client's result for the query passed, `select` infers from it, and a write's variables
are what the client's call takes. A read's key is tagged with its data, so
`queryClient.getQueryData(contacts.get(id).queryKey)` is typed. An infinite query's data, and
`getQueryData` of its key, are `InfiniteData<ListResult>`, the page parameters `unknown`, as every
adapter's `infiniteQueryOptions` types them. Add your own options by spreading,
`{ ...contacts.list(query), placeholderData: keepPreviousData }`, or pass the options through your
adapter's `queryOptions`, `infiniteQueryOptions`, and `mutationOptions`. In Vue, spread a list's
pages options instead of passing them to `infiniteQueryOptions`: Vue's `useInfiniteQuery` refuses
what that helper returns for a key it was handed tagged
([ADR 0021](https://github.com/netvark/netvark/blob/main/docs/jsonapi/adr/0021-a-lists-pages-key-is-tagged-as-the-adapters-tag-an-infinite-key.md)).

## Best practices

- **Make the options once per resource, at module scope, and call a member where you read.** The key
  is the query string the request sends: two queries that send one request share one entry, whatever
  order their members are written in, while a filter whose fields come in another order is another
  request. Build a screen's query in one place, such as its route's search.
- **Pass the options from a getter where your adapter takes one,** so the query follows the state it
  reads: a member computes its key when it is called. Vue's `useQuery(contacts.get(id.value))` reads
  `id` once; `useQuery(() => contacts.get(id.value))` follows it
  ([Vue Query's reactivity](https://tanstack.com/query/v5/docs/framework/vue/reactivity)).
- **Name the other resources a write changes on the server in `invalidates`,** such as the meetings
  a contact's removal touches, or the record a database trigger updates. Never invalidate in a
  callback passed to `mutate`: TanStack Query runs one only while the component that called it is
  mounted, and for the last of consecutive calls only. Keep those callbacks for what the screen does
  next, such as navigating.
- **Never override a write's `onSuccess`,** which holds its invalidation; spread a read's options to
  add `staleTime` or `select`.
- **Do not retry a refusal.** In the browser TanStack Query retries a failed query three times by
  default, and a `4xx` answers the same each time; set `retry` in the `QueryClient`'s defaults:
  `retry: (failures, error) => failures < 3 && !(isResponseError(error) && error.status < 500)`,
  with `isResponseError` from `@netvark/jsonapi-client`.
- **Page an infinite list with `fetchNextPage` and `fetchPreviousPage`.** It starts at the query's
  own `page.after` or `page.before`, keeps its `page.size`, follows the server's links, and ends a
  direction at a page without records.
- **Prefetch with the same options,** in a route loader or on the server:
  `queryClient.query({ ...contacts.get(id), staleTime: 'static' })` from TanStack Query 5.102, or
  `queryClient.ensureQueryData(contacts.get(id))` before it. Keys and results are JSON, so
  `dehydrate` and a persister take them as they are, and the keys `hydrate` restores stay typed.
- **Pass a list of keys to `invalidates`:** `[meetings.all]`, not `meetings.all`. `resourceQueries`
  throws `TypeError` for a value `createClients` did not return, a write for `invalidates` that is
  not a list of keys, and `pages` for a resource that does not paginate, which TypeScript types
  `never`.

## Documentation

- [`docs/jsonapi/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/jsonapi/SPEC.md),
  section 16: the binding's contract, with the tests that prove it
- [ADR 0020](https://github.com/netvark/netvark/blob/main/docs/jsonapi/adr/0020-tanstack-query-options-are-the-clients-binding-typed-through-query-core.md):
  TanStack Query options are the clients' binding, typed through query-core, and
  [ADR 0021](https://github.com/netvark/netvark/blob/main/docs/jsonapi/adr/0021-a-lists-pages-key-is-tagged-as-the-adapters-tag-an-infinite-key.md):
  a list's pages key is tagged as the adapters tag an infinite key
- [ADR 0010](https://github.com/netvark/netvark/blob/main/docs/adr/0010-a-binding-to-a-library-with-a-framework-free-core-binds-the-core.md)
  and
  [ADR 0011](https://github.com/netvark/netvark/blob/main/docs/adr/0011-a-binding-takes-the-core-an-adapter-brings-as-an-optional-peer.md):
  a binding binds a library's framework-free core, and takes it as an optional peer

## License

MIT
