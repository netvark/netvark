/**
 * The behavior of a resource in types (SPEC 12.3): its policy and, per
 * writing operation, the server values, the quota, the rules, and the
 * effects. `values` is required exactly when the resource has server
 * values and returns exactly those columns; an operation the resource
 * does not declare takes no behavior; a rule's `reject` takes the
 * domain's codes and the resource's members.
 * @packageDocumentation
 */
import type {
  AnyDeclaredResource,
  DeclaredResource,
} from '../declare/declared-resource';
import type { KnownMembers, Requirement } from '../declare/requirement';
import type { AppCodeOf, DomainContext, DomainShape } from './domain-types';
import type { DomainEvent } from './event';
import type { Policy } from './policy';
import type { Reject } from './reject';
import type {
  CreateInputOf,
  MemberNameOf,
  OperationOf,
  PublicRowOf,
  UpdateInputOf,
} from './resource-types';
import type { HasServerValues, ServerValuesOf } from './server-values';

/** A rule: refuses with `reject`, or resolves. */
export type Rule<TContext> = (context: TContext) => void | Promise<void>;

/** An effect: the events to record with the write. */
export type Effect<TContext> = (
  context: TContext,
) => ReadonlyArray<DomainEvent> | Promise<ReadonlyArray<DomainEvent>>;

/** What every rule receives besides the operation's own members. */
export type RuleContext<
  TDomain extends DomainShape,
  TResource extends AnyDeclaredResource,
> = DomainContext<TDomain> & {
  readonly reject: Reject<AppCodeOf<TDomain>, MemberNameOf<TResource>>;
};

type CreateInput<TResource extends AnyDeclaredResource> = {
  readonly input: CreateInputOf<TResource>;
};
type UpdateInput<TResource extends AnyDeclaredResource> = {
  readonly input: UpdateInputOf<TResource>;
};
type Row<TResource extends AnyDeclaredResource> = {
  readonly row: PublicRowOf<TResource>;
};

/** What `values` receives. */
export type ValuesContext<
  TDomain extends DomainShape,
  TResource extends AnyDeclaredResource,
> = DomainContext<TDomain> & CreateInput<TResource>;

/** A create's behavior as stored: every member but `values` and `quota` normalized. */
export interface CreateBehavior<
  TDomain extends DomainShape = DomainShape,
  TResource extends AnyDeclaredResource = AnyDeclaredResource,
> {
  readonly values:
    | ((
        context: ValuesContext<TDomain, TResource>,
      ) => ServerValuesOf<TResource>)
    | undefined;
  readonly quota: TDomain['quotas'] | undefined;
  readonly rules: ReadonlyArray<
    Rule<RuleContext<TDomain, TResource> & CreateInput<TResource>>
  >;
  readonly effects: ReadonlyArray<
    Effect<DomainContext<TDomain> & CreateInput<TResource> & Row<TResource>>
  >;
}

/** An update's behavior as stored; `previous` is the row before the write. */
export interface UpdateBehavior<
  TDomain extends DomainShape = DomainShape,
  TResource extends AnyDeclaredResource = AnyDeclaredResource,
> {
  readonly rules: ReadonlyArray<
    Rule<
      RuleContext<TDomain, TResource> & UpdateInput<TResource> & Row<TResource>
    >
  >;
  readonly effects: ReadonlyArray<
    Effect<
      DomainContext<TDomain> &
        UpdateInput<TResource> &
        Row<TResource> & { readonly previous: PublicRowOf<TResource> }
    >
  >;
}

/** A remove's behavior as stored; the effects receive the removed row. */
export interface RemoveBehavior<
  TDomain extends DomainShape = DomainShape,
  TResource extends AnyDeclaredResource = AnyDeclaredResource,
> {
  readonly rules: ReadonlyArray<
    Rule<RuleContext<TDomain, TResource> & Row<TResource>>
  >;
  readonly effects: ReadonlyArray<
    Effect<DomainContext<TDomain> & Row<TResource>>
  >;
}

/**
 * What `defineResource` returns: the resource, its policy (`denyAll` when
 * none), and its operations' behavior. A runtime takes any resource's as
 * `ResourceBehavior<TDomain>`, which TypeScript checks against the
 * resource's few `AnyDeclaredResource` members only.
 */
export interface ResourceBehavior<
  TDomain extends DomainShape = DomainShape,
  TResource extends AnyDeclaredResource = AnyDeclaredResource,
> {
  /** The resource as declared, and as the wide `DeclaredResource` a storage adapter takes. */
  readonly resource: TResource & DeclaredResource;
  readonly policy: Policy<TDomain, TResource>;
  readonly operations: {
    readonly create?: CreateBehavior<TDomain, TResource> | undefined;
    readonly update?: UpdateBehavior<TDomain, TResource> | undefined;
    readonly remove?: RemoveBehavior<TDomain, TResource> | undefined;
  };
  /** The columns `operations.create.values` supplies, in column order (SPEC 12.3). */
  readonly serverValues: ReadonlyArray<string>;
}

type Partialize<TBehavior> = {
  readonly [K in keyof TBehavior]?: TBehavior[K] | undefined;
};

/** `values` as `defineResource` takes it: exactly the server values. */
type ValuesInit<
  TDomain extends DomainShape,
  TResource extends AnyDeclaredResource,
  TValues,
> = (
  context: ValuesContext<TDomain, TResource>,
) => TValues &
  KnownMembers<
    TValues,
    keyof ServerValuesOf<TResource> & string,
    'the server values'
  >;

type CreateInit<
  TDomain extends DomainShape,
  TResource extends AnyDeclaredResource,
  TValues,
> = Partialize<Omit<CreateBehavior<TDomain, TResource>, 'values'>> &
  (HasServerValues<TResource> extends true
    ? { readonly values: ValuesInit<TDomain, TResource, TValues> }
    : {
        readonly values?: Requirement<'the resource has no server values'>;
      });

type Undeclared<TOperation extends string> =
  Requirement<`${TOperation} is not a declared operation`>;

/** `operations` as `defineResource` takes it: only the declared writing operations. */
type OperationsInit<
  TDomain extends DomainShape,
  TResource extends AnyDeclaredResource,
  TValues,
> = ('create' extends OperationOf<TResource>
  ? HasServerValues<TResource> extends true
    ? { readonly create: CreateInit<TDomain, TResource, TValues> }
    : { readonly create?: CreateInit<TDomain, TResource, TValues> }
  : { readonly create?: Undeclared<'create'> }) &
  ('update' extends OperationOf<TResource>
    ? { readonly update?: Partialize<UpdateBehavior<TDomain, TResource>> }
    : { readonly update?: Undeclared<'update'> }) &
  ('remove' extends OperationOf<TResource>
    ? { readonly remove?: Partialize<RemoveBehavior<TDomain, TResource>> }
    : { readonly remove?: Undeclared<'remove'> });

/** `defineResource`'s second argument. */
export type BehaviorInit<
  TDomain extends DomainShape,
  TResource extends AnyDeclaredResource,
  TValues,
> = {
  readonly policy?: Policy<TDomain, TResource> | undefined;
} & (HasServerValues<TResource> extends true
  ? { readonly operations: OperationsInit<TDomain, TResource, TValues> }
  : {
      readonly operations?: OperationsInit<TDomain, TResource, TValues>;
    });
