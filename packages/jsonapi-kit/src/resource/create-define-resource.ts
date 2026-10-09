/**
 * `createDefineResource` (SPEC 5.1): a `defineResource` configured once
 * with the defaults every definition of an application shares, today the
 * links convention's `base`. Definitions stay plain values and the
 * defaults live in the one module that exports the configured definer, not
 * in module-level state, so two applications in one process cannot collide
 * and nothing depends on import order (ADR 0015).
 * @packageDocumentation
 */
import type { ResourceDefaults } from './links';
import type { ResourceDefinition, ResourceDefinitionInit } from './types';

import { defineResource } from './define-resource';
import { assertLinkBase } from './links';

/** The signature of `defineResource`, which a configured definer shares. */
export type DefineResource = typeof defineResource;

/**
 * A `defineResource` that merges `defaults` under every definition it is
 * given, member by member within `links`: a member the definition sets,
 * even to `undefined`, replaces the default. A default `links.base` the
 * convention cannot use throws `TypeError` here, at startup.
 */
export function createDefineResource(
  defaults: ResourceDefaults,
): DefineResource {
  const links = defaults.links ?? {};
  if (links.base !== undefined) {
    assertLinkBase('links.base', links.base);
  }
  return function configured<
    const TType extends string,
    const TAttribute extends string,
    const TRelationship extends string = never,
    TRow = never,
    const TSort extends string = never,
    const TFilter extends string = never,
    TCreate = unknown,
    TUpdate = unknown,
  >(
    init: ResourceDefinitionInit<
      TType,
      TAttribute,
      TRelationship,
      TRow,
      TSort,
      TFilter,
      TCreate,
      TUpdate
    >,
  ): ResourceDefinition<
    TType,
    TAttribute,
    TRelationship,
    TRow,
    TSort,
    TFilter,
    TCreate,
    TUpdate
  > {
    return defineResource<
      TType,
      TAttribute,
      TRelationship,
      TRow,
      TSort,
      TFilter,
      TCreate,
      TUpdate
    >({ ...init, links: { ...links, ...init.links } });
  };
}
