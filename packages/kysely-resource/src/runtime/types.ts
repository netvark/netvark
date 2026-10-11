/**
 * What the domain runs with and takes (SPEC 18.3, 18.4): the storage, each
 * resource's behavior keyed by its type, the scope bindings, the quotas,
 * the services, the application's codes, and the hooks after commit; and
 * a create's or an update's input as a host or a worker hands it over.
 * @packageDocumentation
 */
import type {
  DomainEvent,
  DomainShape,
  Quota,
  QuotaContext,
  ResourceBehavior,
  Scope,
} from '@netvark/resource-core/server';

import type { KyselyStorage } from '../storage/types';

/**
 * A create's or an update's input, as `@netvark/jsonapi-core` parses a
 * resource object: each relationship as its linkage, `{ type, id }` or
 * `null`. A missing member is `{}`. The write schemas validate it, so a
 * worker's input is held to what a request's is.
 */
export interface ResourceInput {
  /** A create's client-generated id, for a resource that takes them. */
  readonly id?: string | undefined;
  readonly attributes?: Readonly<Record<string, unknown>> | undefined;
  readonly relationships?: Readonly<Record<string, unknown>> | undefined;
}

/** A hook after commit: what an operation recorded, when it recorded anything (SPEC 18.6). */
type AfterCommit = (events: ReadonlyArray<DomainEvent>) => void | Promise<void>;

/** What the domain of an application runs with. */
export interface DomainOptions<TDomain extends DomainShape> {
  readonly storage: KyselyStorage;
  /** What `defineResource` returned for each resource, keyed by its type. */
  readonly resources: Readonly<Record<string, ResourceBehavior<TDomain>>>;
  /** A binding per scope of the definer (SPEC 12.5). */
  readonly scopes: Readonly<Record<string, Scope<string, TDomain['actor']>>>;
  /** A quota per name a create's behavior names (SPEC 12.6). */
  readonly quotas: Readonly<
    Record<string, Quota<QuotaContext<TDomain['actor'], TDomain['services']>>>
  >;
  /** Handed to policies, values, rules, quotas, and effects. */
  readonly services: TDomain['services'];
  /** The application's codes, for the error of a rule's rejection (SPEC 12.4). */
  readonly errors: TDomain['errors'];
  readonly afterCommit?: AfterCommit | undefined;
  /** Receives what `afterCommit` threw, which never reaches the operation's caller. */
  readonly report?: ((error: unknown) => void | Promise<void>) | undefined;
}
