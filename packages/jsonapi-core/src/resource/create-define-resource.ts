/**
 * `createDefineResource` (SPEC 5.1): a `defineResource` configured once
 * with the defaults every definition of an application shares: the links
 * convention's `base` (ADR 0015) and the cap on one Atomic Operations
 * request (ADR 0023). Definitions stay plain values and the defaults live
 * in the one module that exports the configured definer, not in
 * module-level state, so two applications in one process cannot collide
 * and nothing depends on import order.
 * @packageDocumentation
 */
import type { AtomicCapabilitiesInit } from './atomic-capabilities';
import type { Empty } from './client-types';
import type {
  DefinitionOf,
  RelationshipsInit,
  ResourceDefinitionInit,
} from './init-types';
import type { ResourceLinksInit } from './links';
import type { QueryCapabilitiesInit } from './types';
import type { ResourceValidators, WritableFieldsInit } from './write-types';

import { assertAtomicMax } from './atomic-capabilities';
import { defineResource } from './define-resource';
import { assertLinkBase } from './links';

/** The signature of `defineResource`, which a configured definer shares. */
export type DefineResource = typeof defineResource;

/** What a configured `defineResource` applies to every definition. */
export interface ResourceDefaults {
  /** Merged under each definition's own `links`, member by member. */
  readonly links?: ResourceLinksInit | undefined;
  /** Merged under each definition's own `atomic`, member by member. */
  readonly atomic?: AtomicCapabilitiesInit | undefined;
}

/**
 * A `defineResource` that merges `defaults` under every definition it is
 * given, member by member within `links` and within `atomic`: a member
 * the definition sets, even to `undefined`, replaces the default. A
 * default `links.base` the convention cannot use, and a default
 * `atomic.max` that is no cap, throw `TypeError` here, at startup.
 */
export function createDefineResource(
  defaults: ResourceDefaults,
): DefineResource {
  const links = defaults.links ?? {};
  if (links.base !== undefined) {
    assertLinkBase('links.base', links.base);
  }
  const atomic = defaults.atomic ?? {};
  if (atomic.max !== undefined) {
    assertAtomicMax('atomic.max', atomic.max);
  }
  return function configured<
    const TType extends string,
    const TAttribute extends string,
    const TRelationships extends RelationshipsInit = Empty,
    TRow = never,
    TAttributes = Empty,
    const TQuery extends QueryCapabilitiesInit<string, string> = Empty,
    TValidate extends ResourceValidators<unknown, unknown> = Empty,
    const TWritable extends WritableFieldsInit<
      NoInfer<TAttribute | (keyof TRelationships & string)>
    > = Empty,
    const TClientIds extends boolean = false,
  >(
    init: ResourceDefinitionInit<
      TType,
      TAttribute,
      TRelationships,
      TRow,
      TAttributes,
      TQuery,
      TValidate,
      TWritable,
      TClientIds
    >,
  ): DefinitionOf<
    TType,
    TAttribute,
    TRelationships,
    TRow,
    TAttributes,
    TQuery,
    TValidate,
    TWritable,
    TClientIds
  > {
    return defineResource<
      TType,
      TAttribute,
      TRelationships,
      TRow,
      TAttributes,
      TQuery,
      TValidate,
      TWritable,
      TClientIds
    >({
      ...init,
      links: { ...links, ...init.links },
      atomic: { ...atomic, ...init.atomic },
    });
  };
}
