/**
 * Solid Query's primitives over the options (SPEC 16.5), which take them
 * from a function: each primitive's data is the client's result for the
 * query passed, `select` infers from it, a mutation takes what the
 * client's call takes, and `getQueryData` reads through the tagged keys.
 * Checked against the built package by the type check only: the component
 * never renders.
 * @ref https://tanstack.com/query/v5/docs/framework/solid/typescript
 */
import type { InfiniteData, QueryClient } from '@tanstack/solid-query';

import type {
  ArticleInput,
  ArticleUpdate,
  Listed,
  Operations,
  Page,
  Retitled,
  Sparse,
} from './blog-queries.ts';

import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@tanstack/solid-query';
import { expectTypeOf } from 'vitest';

import {
  articles,
  LISTED,
  NEWEST,
  operations,
  people,
  retitling,
  SPARSE,
} from './blog-queries.ts';

/** A component's reads and writes, typed as Solid Query gives them. */
export function solidComponent(queryClient: QueryClient): void {
  const list = useQuery(() => articles.list(LISTED));
  expectTypeOf(list.data).toEqualTypeOf<Listed | undefined>();
  const record = useQuery(() => articles.get('1', SPARSE));
  expectTypeOf(record.data).toEqualTypeOf<Sparse | undefined>();
  const title = useQuery(() => ({
    ...articles.get('1', SPARSE),
    select: (result) => result.data.title,
  }));
  expectTypeOf(title.data).toEqualTypeOf<string | undefined>();
  const feed = useInfiniteQuery(() => articles.pages(NEWEST));
  expectTypeOf(feed.data).toEqualTypeOf<InfiniteData<Page> | undefined>();
  const create = useMutation(() =>
    articles.create({ invalidates: [people.all] }),
  );
  expectTypeOf<typeof create.mutateAsync>()
    .parameter(0)
    .toEqualTypeOf<ArticleInput>();
  const update = useMutation(() => articles.update());
  expectTypeOf<typeof update.mutate>()
    .parameter(0)
    .toEqualTypeOf<ArticleUpdate>();
  const bulk = useMutation(() => operations);
  expectTypeOf<typeof bulk.mutateAsync>()
    .parameter(0)
    .toEqualTypeOf<Operations>();
  const retitle = useMutation(() => retitling);
  expectTypeOf<
    typeof retitle.mutateAsync
  >().returns.resolves.toEqualTypeOf<Retitled>();
  expectTypeOf(
    queryClient.getQueryData(articles.list(LISTED).queryKey),
  ).toEqualTypeOf<Listed | undefined>();
  expectTypeOf(
    queryClient.getQueryData(articles.pages(NEWEST).queryKey),
  ).toEqualTypeOf<InfiniteData<Page> | undefined>();
}

/**
 * The options passed through Solid Query's own helpers, which keep the
 * data, the variables, and the key's tag.
 */
export function solidHelpers(queryClient: QueryClient): void {
  const fresh = queryOptions({
    ...articles.get('1', SPARSE),
    staleTime: Infinity,
  });
  expectTypeOf(useQuery(() => fresh).data).toEqualTypeOf<Sparse | undefined>();
  expectTypeOf(queryClient.getQueryData(fresh.queryKey)).toEqualTypeOf<
    Sparse | undefined
  >();
  const bounded = infiniteQueryOptions({
    ...articles.pages(NEWEST),
    staleTime: Infinity,
  });
  expectTypeOf(useInfiniteQuery(() => bounded).data).toEqualTypeOf<
    InfiniteData<Page> | undefined
  >();
  expectTypeOf(queryClient.getQueryData(bounded.queryKey)).toEqualTypeOf<
    InfiniteData<Page> | undefined
  >();
  const remove = useMutation(() => mutationOptions(articles.remove()));
  expectTypeOf<typeof remove.mutate>().parameter(0).toEqualTypeOf<string>();
}
