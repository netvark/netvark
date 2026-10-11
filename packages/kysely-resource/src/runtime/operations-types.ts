/**
 * The domain's types (SPEC 18.4): one resource's operations as one actor
 * runs them, typed by its declaration, and the domain and runtime that
 * hold them. A resource TypeScript knows has exactly the operations it
 * declares, and `include` when a relationship is includable; its rows are
 * its public rows and its list request names its own keyset fields. A
 * resource typed wide may have any of them.
 * @packageDocumentation
 */
import type {
  FieldsInit,
  KeysetRequestOf,
  NoRelations,
  Page,
} from '@netvark/kysely-keyset';
import type { AnyDeclaredResource } from '@netvark/resource-core';
import type {
  DomainShape,
  IncludableOf,
  OperationOf,
  PublicRow,
  PublicRowOf,
  ResourceBehavior,
  StorageListRequest,
} from '@netvark/resource-core/server';

import type { ListOptions } from '../storage/types';
import type { ResourceInput, RuntimeResources } from './types';

/** The keyset request of `TResource`'s list, in its public names. */
type ListRequestOf<TResource extends AnyDeclaredResource> = TResource extends {
  readonly keyset: { readonly fields: infer TFields extends FieldsInit };
}
  ? KeysetRequestOf<TFields, NoRelations>
  : StorageListRequest;

/** Every operation a resource may declare, typed by it. */
interface Operations<TResource extends AnyDeclaredResource> {
  readonly list: (
    request?: ListRequestOf<TResource>,
    options?: ListOptions,
  ) => Promise<Page<PublicRowOf<TResource>>>;
  readonly get: (id: string) => Promise<PublicRowOf<TResource>>;
  readonly create: (input: ResourceInput) => Promise<PublicRowOf<TResource>>;
  readonly update: (
    id: string,
    input: ResourceInput,
  ) => Promise<PublicRowOf<TResource>>;
  readonly remove: (id: string) => Promise<void>;
  /** The rows of the target `rows` link to over `relationship`, each once. */
  readonly include: (
    relationship: IncludableOf<TResource>,
    rows: ReadonlyArray<PublicRow>,
  ) => Promise<ReadonlyArray<PublicRow>>;
}

/** `include` when `TResource` has an includable relationship. */
type IncludeOf<TResource extends AnyDeclaredResource> = [
  IncludableOf<TResource>,
] extends [never]
  ? never
  : 'include';

/** The operations of one resource as one actor runs them (SPEC 18.4). */
export type ResourceOperations<
  TResource extends AnyDeclaredResource = AnyDeclaredResource,
> = string extends TResource['table']
  ? Partial<Operations<TResource>>
  : Pick<Operations<TResource>, OperationOf<TResource> | IncludeOf<TResource>>;

/** The resource `defineResource` was given for `TBehavior`. */
type ResourceOf<TBehavior> =
  TBehavior extends ResourceBehavior<infer _TDomain, infer TResource>
    ? TResource
    : AnyDeclaredResource;

/** One `ResourceOperations` per resource, keyed by type. */
export type Domain<
  TResources extends Readonly<Record<string, unknown>> =
    RuntimeResources<DomainShape>,
> = {
  readonly [TType in keyof TResources]: ResourceOperations<
    ResourceOf<TResources[TType]>
  >;
};

/** What `createResourceRuntime` resolves to. */
export interface ResourceRuntime<
  TDomain extends DomainShape = DomainShape,
  TResources extends RuntimeResources<TDomain> = RuntimeResources<TDomain>,
> {
  /** What boot warned about (SPEC 18.3). */
  readonly warnings: ReadonlyArray<string>;
  /** Each resource's operations as `actor` runs them. */
  readonly as: (actor: TDomain['actor']) => Domain<TResources>;
}
