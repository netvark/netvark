/**
 * Svelte Query's functions over the options (SPEC 16.5), which take them
 * from a function, as Svelte 5's runes read them: each query's data is
 * the client's result for the query passed, `select` infers from it, a
 * mutation takes what the client's call takes, and `getQueryData` reads
 * through the tagged keys. Checked against the built package by the type
 * check only: the component never mounts.
 * @ref https://tanstack.com/query/v5/docs/framework/svelte/overview
 */
import type { InfiniteData, QueryClient } from '@tanstack/svelte-query';

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
  createInfiniteQuery,
  createMutation,
  createQuery,
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
} from '@tanstack/svelte-query';
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

/** A component's reads and writes, typed as Svelte Query gives them. */
export function svelteComponent(queryClient: QueryClient): void {
  const list = createQuery(() => articles.list(LISTED));
  expectTypeOf(list.data).toEqualTypeOf<Listed | undefined>();
  const record = createQuery(() => articles.get('1', SPARSE));
  expectTypeOf(record.data).toEqualTypeOf<Sparse | undefined>();
  const title = createQuery(() => ({
    ...articles.get('1', SPARSE),
    select: (result) => result.data.title,
  }));
  expectTypeOf(title.data).toEqualTypeOf<string | undefined>();
  const feed = createInfiniteQuery(() => articles.pages(NEWEST));
  expectTypeOf(feed.data).toEqualTypeOf<InfiniteData<Page> | undefined>();
  const create = createMutation(() =>
    articles.create({ invalidates: [people.all] }),
  );
  expectTypeOf<typeof create.mutateAsync>()
    .parameter(0)
    .toEqualTypeOf<ArticleInput>();
  const update = createMutation(() => articles.update());
  expectTypeOf<typeof update.mutate>()
    .parameter(0)
    .toEqualTypeOf<ArticleUpdate>();
  const bulk = createMutation(() => operations);
  expectTypeOf<typeof bulk.mutateAsync>()
    .parameter(0)
    .toEqualTypeOf<Operations>();
  const retitle = createMutation(() => retitling);
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
 * The options passed through Svelte Query's own helpers, which keep the
 * data, the variables, and the key's tag.
 */
export function svelteHelpers(queryClient: QueryClient): void {
  const fresh = queryOptions({
    ...articles.get('1', SPARSE),
    staleTime: Infinity,
  });
  expectTypeOf(createQuery(() => fresh).data).toEqualTypeOf<
    Sparse | undefined
  >();
  expectTypeOf(queryClient.getQueryData(fresh.queryKey)).toEqualTypeOf<
    Sparse | undefined
  >();
  const bounded = infiniteQueryOptions({
    ...articles.pages(NEWEST),
    staleTime: Infinity,
  });
  expectTypeOf(createInfiniteQuery(() => bounded).data).toEqualTypeOf<
    InfiniteData<Page> | undefined
  >();
  expectTypeOf(queryClient.getQueryData(bounded.queryKey)).toEqualTypeOf<
    InfiniteData<Page> | undefined
  >();
  const remove = createMutation(() => mutationOptions(articles.remove()));
  expectTypeOf<typeof remove.mutate>().parameter(0).toEqualTypeOf<string>();
}
