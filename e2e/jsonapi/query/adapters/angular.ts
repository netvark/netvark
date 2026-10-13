/**
 * Angular Query's injectors over the options (SPEC 16.5), which take them
 * from a function and give signals: each query's data is the client's
 * result for the query passed, `select` infers from it, a mutation takes
 * what the client's call takes, and `getQueryData` reads through the
 * tagged keys. Checked against the built package by the type check only:
 * the component is never created.
 * @ref https://tanstack.com/query/v5/docs/framework/angular/typescript
 */
import type {
  InfiniteData,
  QueryClient,
} from '@tanstack/angular-query-experimental';

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
  injectInfiniteQuery,
  injectMutation,
  injectQuery,
  mutationOptions,
  queryOptions,
} from '@tanstack/angular-query-experimental';
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

/** A component's reads and writes, typed as Angular Query gives them. */
export function angularComponent(queryClient: QueryClient): void {
  const list = injectQuery(() => articles.list(LISTED));
  expectTypeOf(list.data()).toEqualTypeOf<Listed | undefined>();
  const record = injectQuery(() => articles.get('1', SPARSE));
  expectTypeOf(record.data()).toEqualTypeOf<Sparse | undefined>();
  const title = injectQuery(() => ({
    ...articles.get('1', SPARSE),
    select: (result) => result.data.title,
  }));
  expectTypeOf(title.data()).toEqualTypeOf<string | undefined>();
  const feed = injectInfiniteQuery(() => articles.pages(NEWEST));
  expectTypeOf(feed.data()).toEqualTypeOf<InfiniteData<Page> | undefined>();
  const create = injectMutation(() =>
    articles.create({ invalidates: [people.all] }),
  );
  expectTypeOf<typeof create.mutateAsync>()
    .parameter(0)
    .toEqualTypeOf<ArticleInput>();
  const update = injectMutation(() => articles.update());
  expectTypeOf<typeof update.mutate>()
    .parameter(0)
    .toEqualTypeOf<ArticleUpdate>();
  const bulk = injectMutation(() => operations);
  expectTypeOf<typeof bulk.mutateAsync>()
    .parameter(0)
    .toEqualTypeOf<Operations>();
  const retitle = injectMutation(() => retitling);
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
 * The options passed through Angular Query's own helpers, which keep the
 * data, the variables, and the key's tag.
 */
export function angularHelpers(queryClient: QueryClient): void {
  const fresh = queryOptions({
    ...articles.get('1', SPARSE),
    staleTime: Infinity,
  });
  expectTypeOf(injectQuery(() => fresh).data()).toEqualTypeOf<
    Sparse | undefined
  >();
  expectTypeOf(queryClient.getQueryData(fresh.queryKey)).toEqualTypeOf<
    Sparse | undefined
  >();
  const bounded = infiniteQueryOptions({
    ...articles.pages(NEWEST),
    staleTime: Infinity,
  });
  expectTypeOf(injectInfiniteQuery(() => bounded).data()).toEqualTypeOf<
    InfiniteData<Page> | undefined
  >();
  expectTypeOf(queryClient.getQueryData(bounded.queryKey)).toEqualTypeOf<
    InfiniteData<Page> | undefined
  >();
  const remove = injectMutation(() => mutationOptions(articles.remove()));
  expectTypeOf<typeof remove.mutate>().parameter(0).toEqualTypeOf<string>();
}
