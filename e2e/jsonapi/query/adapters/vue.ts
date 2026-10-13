/**
 * Vue Query's composables over the options (SPEC 16.5), checked against
 * the built package: each composable's data, a ref, holds the client's
 * result for the query passed, whether the options are passed as they are
 * or from a getter or a `computed` over reactive state, `select` infers
 * from it, a mutation takes what the client's call takes, and
 * `getQueryData` reads through the tagged keys. Read by the type check
 * only: the component never mounts.
 * @ref https://tanstack.com/query/v5/docs/framework/vue/typescript
 * @ref https://tanstack.com/query/v5/docs/framework/vue/reactivity ("reactive getters")
 */
import type { InfiniteData, QueryClient } from '@tanstack/vue-query';

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
} from '@tanstack/vue-query';
import { expectTypeOf } from 'vitest';
import { computed, ref } from 'vue';

import {
  articles,
  LISTED,
  NEWEST,
  operations,
  people,
  retitling,
  SPARSE,
} from './blog-queries.ts';

/** A component's reads and writes, typed as Vue Query gives them. */
export function vueSetup(queryClient: QueryClient): void {
  const list = useQuery(articles.list(LISTED));
  expectTypeOf(list.data.value).toEqualTypeOf<Listed | undefined>();
  const record = useQuery(articles.get('1', SPARSE));
  expectTypeOf(record.data.value).toEqualTypeOf<Sparse | undefined>();
  const id = ref('1');
  const followed = useQuery(() => articles.get(id.value, SPARSE));
  expectTypeOf(followed.data.value).toEqualTypeOf<Sparse | undefined>();
  const computedRecord = useQuery(
    computed(() => articles.get(id.value, SPARSE)),
  );
  expectTypeOf(computedRecord.data.value).toEqualTypeOf<Sparse | undefined>();
  const title = useQuery({
    ...articles.get('1', SPARSE),
    select: (result) => result.data.title,
  });
  expectTypeOf(title.data.value).toEqualTypeOf<string | undefined>();
  const feed = useInfiniteQuery(articles.pages(NEWEST));
  expectTypeOf(feed.data.value).toEqualTypeOf<InfiniteData<Page> | undefined>();
  const newest = ref(NEWEST);
  const followedFeed = useInfiniteQuery(() => articles.pages(newest.value));
  expectTypeOf(followedFeed.data.value).toEqualTypeOf<
    InfiniteData<Page> | undefined
  >();
  const create = useMutation(articles.create({ invalidates: [people.all] }));
  expectTypeOf<typeof create.mutateAsync>()
    .parameter(0)
    .toEqualTypeOf<ArticleInput>();
  const update = useMutation(articles.update());
  expectTypeOf<typeof update.mutate>()
    .parameter(0)
    .toEqualTypeOf<ArticleUpdate>();
  const bulk = useMutation(operations);
  expectTypeOf<typeof bulk.mutateAsync>()
    .parameter(0)
    .toEqualTypeOf<Operations>();
  const retitle = useMutation(retitling);
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
 * The options passed through Vue Query's own helpers, which keep the
 * data, the variables, and the key's tag, but for `infiniteQueryOptions`:
 * a list's pages options are spread instead.
 */
export function vueHelpers(queryClient: QueryClient): void {
  const fresh = queryOptions({
    ...articles.get('1', SPARSE),
    staleTime: Infinity,
  });
  expectTypeOf(useQuery(fresh).data.value).toEqualTypeOf<Sparse | undefined>();
  expectTypeOf(queryClient.getQueryData(fresh.queryKey)).toEqualTypeOf<
    Sparse | undefined
  >();
  const bounded = useInfiniteQuery({
    ...articles.pages(NEWEST),
    staleTime: Infinity,
  });
  expectTypeOf(bounded.data.value).toEqualTypeOf<
    InfiniteData<Page> | undefined
  >();
  // Vue Query's `DeepUnwrapRef` maps a key `infiniteQueryOptions` is handed
  // already tagged as an object, and its `useInfiniteQuery` then refuses
  // what the helper returned; the README spreads the pages options instead.
  // The directive fails once Vue Query takes them, and the note goes too.
  // @ts-expect-error -- Vue Query's infiniteQueryOptions over a tagged key
  useInfiniteQuery(infiniteQueryOptions(articles.pages(NEWEST)));
  const remove = useMutation(mutationOptions(articles.remove()));
  expectTypeOf<typeof remove.mutate>().parameter(0).toEqualTypeOf<string>();
}
