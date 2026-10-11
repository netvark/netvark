/**
 * `createDomainDefiners<TDomain>()` (SPEC 12.1): binds `definePolicy` and
 * `defineResource` to the application's domain. The type argument is the
 * whole input, so `actor.can('contacts:raed')`, `quota: 'contact'`, and
 * `reject('CONTACT_LIMTI')` fail `tsc`; at runtime the definers are the
 * same for every domain and check what JavaScript passes.
 * @packageDocumentation
 */
import type { AnyDeclaredResource } from '../declare/declared-resource';
import type { BehaviorInit, ResourceBehavior } from './behavior-types';
import type { DomainOf, DomainShape } from './domain-types';
import type { Policy, PolicyInit } from './policy';
import type { ServerValuesOf } from './server-values';

import { defineResourceIn } from './define-resource';
import { definePolicyIn } from './policy';

/** The definers bound to a domain. */
export interface DomainDefiners<TDomain extends DomainShape> {
  /** A resource's policy: a predicate per declared operation and per includable relationship (SPEC 12.2). */
  readonly definePolicy: <TResource extends AnyDeclaredResource>(
    resource: TResource,
    init: PolicyInit<TDomain, TResource>,
  ) => Policy<TDomain, TResource>;
  /** A resource's behavior: its policy and its writing operations' values, quota, rules, and effects (SPEC 12.3). */
  readonly defineResource: <
    TResource extends AnyDeclaredResource,
    TValues extends ServerValuesOf<TResource> = ServerValuesOf<TResource>,
  >(
    resource: TResource,
    init: BehaviorInit<TDomain, TResource, TValues>,
  ) => ResourceBehavior<TDomain, TResource>;
}

/** The definers, bound to `TDomain` in types only. */
export function createDomainDefiners<
  TDomain extends DomainOf<TDomain>,
>(): DomainDefiners<TDomain> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the definers check their arguments at runtime and are the same for every domain; the domain exists in types only (SPEC 12.1)
  return DEFINERS as unknown as DomainDefiners<TDomain>;
}

const DEFINERS = Object.freeze({
  definePolicy: definePolicyIn,
  defineResource: defineResourceIn,
});
