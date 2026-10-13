# ADR 0021: A list's pages key is tagged as TanStack Query's adapters tag an infinite key

- Status: accepted
- Date: 2026-10-12

## Context

ADR 0020 tags each key with the data its query caches, so `queryClient.getQueryData(key)` is typed,
and tags a list's pages key `InfiniteData<TPage, PageParam>`, naming the page parameter. An
application may pass the options through its adapter's own `queryOptions`, `infiniteQueryOptions`,
and `mutationOptions` (SPEC 16.5), which tag the key they return once more. Every adapter's
`infiniteQueryOptions` tags it `InfiniteData<TQueryFnData>`, the page parameter left `unknown`, as
the hooks give their data.

Measured on 2026-10-12 with the five adapters of TanStack Query 5.104.1 (Svelte's at 6.3.1): the
pages options spread into each adapter's `infiniteQueryOptions` with a `staleTime` of their own,
then given to the adapter's infinite query and to `getQueryData`:

| The pages key is tagged          | React, Svelte, Angular                     | Solid                                      | Vue                                             |
| -------------------------------- | ------------------------------------------ | ------------------------------------------ | ----------------------------------------------- |
| `InfiniteData<TPage, PageParam>` | `getQueryData` reads `InfiniteData<TPage>` | `getQueryData` reads `never`               | `useInfiniteQuery` refuses the helper's options |
| `InfiniteData<TPage>`            | `getQueryData` reads `InfiniteData<TPage>` | `getQueryData` reads `InfiniteData<TPage>` | `useInfiniteQuery` refuses the helper's options |

Vue Query refuses what its `infiniteQueryOptions` returns for any key it is handed already tagged:
its `DeepUnwrapRef` maps the tagged tuple as an object, which the page function's key no longer
matches. The same options spread into `useInfiniteQuery`, as they are or from a getter, are taken.

@ref https://tanstack.com/query/v5/docs/framework/react/reference/infiniteQueryOptions @ref
https://tanstack.com/query/v5/docs/framework/vue/reference/functions/infiniteQueryOptions

## Decision

- A list's pages key is tagged `InfiniteData<TPage>`, as every adapter's `infiniteQueryOptions` tags
  an infinite key, so `getQueryData` of a pages key is the data of the query that reads it.
- In Vue, the pages options are spread, not passed through `infiniteQueryOptions`. The e2e adapter
  checks keep Vue's refusal under a `@ts-expect-error`, which fails once Vue Query takes the
  helper's options; the README's note on it goes then.

## Consequences

A list reads as one type wherever it is read: the infinite query's data, `getQueryData` of its key,
and the key an adapter's helper returns. The page parameters `getQueryData` gives are `unknown`, as
the hooks give them, while the options' own `initialPageParam` and page functions keep `PageParam`.
ADR 0020's consequence that `getQueryData` of a pages key is typed with the page parameter no longer
holds.
