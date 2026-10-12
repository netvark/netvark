/**
 * What `resourceQueries` returns (resource SPEC 20.6), typed as TanStack
 * Query's own `queryOptions`, `infiniteQueryOptions`, and
 * `mutationOptions` return them: `useQuery`, `useInfiniteQuery`, and
 * `useMutation` take the options as they are, and a read's key tags its
 * data, so `queryClient.getQueryData(key)` is typed. A read's records are
 * the client's `RecordOf` for the query passed (jsonapi SPEC 15.6), a
 * literal query read as a constant, as the client reads it; a write's
 * variables are what the client's call takes.
 * @ref https://tanstack.com/query/v5/docs/framework/react/typescript#typing-query-options
 * @ref https://tanstack.com/query/v5/docs/framework/react/reference/mutationOptions
 * @packageDocumentation
 */
import type {
  DataTag,
  DefaultError,
  InfiniteData,
  QueryKey,
  UnusedSkipTokenInfiniteOptions,
  UnusedSkipTokenOptions,
  UseMutationOptions,
  WithRequired,
} from '@tanstack/react-query';

import type {
  CreateInput,
  GetQuery,
  ListQuery,
  ReadResult,
  RecordOf,
  UpdateInput,
  WriteResult,
} from '@netvark/jsonapi-client';

import type { PageParam } from './pages';
import type {
  AllKey,
  GetKey,
  KeyedDefinition,
  ListKey,
  PagesKey,
} from './query-keys';

/** A call's query left out: no members, as the client's calls default it. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- reason: a query left out must have no members at all, so it names no include path and no fieldset, as the client's own default; `undefined` does not satisfy the query constraint a type parameter's default must meet
type NoQuery = Readonly<Record<never, never>>;

/** A read's options, as `queryOptions` returns them: the key tagged with the data it caches. */
export type ReadOptions<TData, TKey extends QueryKey> = UnusedSkipTokenOptions<
  TData,
  DefaultError,
  TData,
  TKey
> & { queryKey: DataTag<TKey, TData, DefaultError> };

/** An infinite list's options, as `infiniteQueryOptions` returns them. */
export type PagesOptions<
  TPage,
  TKey extends QueryKey,
> = UnusedSkipTokenInfiniteOptions<
  TPage,
  DefaultError,
  InfiniteData<TPage>,
  TKey,
  PageParam
> & { queryKey: DataTag<TKey, InfiniteData<TPage>, DefaultError> };

/** A write's options, as `mutationOptions` returns them with a key. */
export type WriteOptions<TData, TVariables> = WithRequired<
  UseMutationOptions<TData, DefaultError, TVariables>,
  'mutationKey'
>;

/** A page of records, as the client's `list` of `TQuery` resolves to it. */
export type ListResult<TDefinitions, TDefinition, TQuery> = ReadResult<
  ReadonlyArray<RecordOf<TDefinitions, TDefinition, TQuery>>
>;

/** `update`'s variables: the record's id beside the input the client's `update` takes. */
export type UpdateVariables<TDefinition> = {
  readonly id: string;
} & UpdateInput<TDefinition>;

/**
 * What a write's options take. `invalidates` holds the keys of the other
 * types the write changes on the server, such as `meetings.all` for a
 * removal that cascades to a contact's meetings: the mutation invalidates
 * them with its own type and stays pending until they have refetched too.
 */
export interface WriteSettings {
  readonly invalidates?: ReadonlyArray<QueryKey> | undefined;
}

/** Whether the definition's list takes `page`. */
type Paginates<TDefinitions, TDefinition> = [
  Exclude<ListQuery<TDefinitions, TDefinition>['page'], undefined>,
] extends [never]
  ? false
  : true;

/** `pages` on a definition that paginates; `never` on one that does not, so no call compiles. */
type PagesMember<TDefinitions, TDefinition extends KeyedDefinition> =
  Paginates<TDefinitions, TDefinition> extends true
    ? <const TQuery extends ListQuery<TDefinitions, TDefinition> = NoQuery>(
        query?: TQuery,
      ) => PagesOptions<
        ListResult<TDefinitions, TDefinition, TQuery>,
        PagesKey<TDefinition['type']>
      >
    : never;

/** The keys and options of one resource's reads and writes (SPEC 20.6). */
export interface ResourceQueries<
  TDefinitions,
  TDefinition extends KeyedDefinition,
> {
  /** `[type]`: every list, page, and record of the type, which each write invalidates. */
  readonly all: AllKey<TDefinition['type']>;
  /** A page of records: `client.list(query)`, keyed by the query string it sends. */
  list<const TQuery extends ListQuery<TDefinitions, TDefinition> = NoQuery>(
    query?: TQuery,
  ): ReadOptions<
    ListResult<TDefinitions, TDefinition, TQuery>,
    ListKey<TDefinition['type']>
  >;
  /** An infinite list, from the query's cursors a page at a time in either direction. */
  readonly pages: PagesMember<TDefinitions, TDefinition>;
  /** One record: `client.get(id, query)`, keyed by the id and the `include` and `fields` it sends. */
  get<const TQuery extends GetQuery<TDefinitions, TDefinition> = NoQuery>(
    id: string,
    query?: TQuery,
  ): ReadOptions<
    ReadResult<RecordOf<TDefinitions, TDefinition, TQuery>>,
    GetKey<TDefinition['type']>
  >;
  /** `client.create(input)`, pending until the reads it invalidates have refetched. */
  create(
    settings?: WriteSettings,
  ): WriteOptions<
    WriteResult<RecordOf<TDefinitions, TDefinition>>,
    CreateInput<TDefinition>
  >;
  /** `client.update(id, input)` of `{ id, ...input }`, pending until the reads it invalidates have refetched. */
  update(
    settings?: WriteSettings,
  ): WriteOptions<
    WriteResult<RecordOf<TDefinitions, TDefinition>>,
    UpdateVariables<TDefinition>
  >;
  /** `client.remove(id)`, which removes the record's entries before the reads it invalidates refetch. */
  remove(
    settings?: WriteSettings,
  ): WriteOptions<WriteResult<undefined>, string>;
}
