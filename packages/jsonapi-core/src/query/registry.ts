/**
 * The include tree and type registry of a resource (SPEC 6.3): the
 * relationship paths clients may include, resolved to definitions, and the
 * resource types that can appear in a response and so may be named in
 * `fields[type]`. Built on first use and memoized per definition, because
 * relationship definitions are read lazily.
 * @ref https://jsonapi.org/format/1.1/#fetching-includes
 * @ref https://jsonapi.org/format/1.1/#fetching-sparse-fieldsets
 * @packageDocumentation
 */
import type { AnyResource } from '../resource/types';

import { relatedResource } from '../resource/define-resource';

interface IncludeNode {
  readonly resource: AnyResource;
  readonly children: ReadonlyMap<string, IncludeNode>;
}

export interface Registry {
  /** Declared include paths as a trie from the primary resource. */
  readonly include: ReadonlyMap<string, IncludeNode>;
  /** Every definition reachable through declared include paths, by type. */
  readonly types: ReadonlyMap<string, AnyResource>;
}

interface MutableNode {
  readonly resource: AnyResource;
  readonly children: Map<string, MutableNode>;
}

const registries = new WeakMap<AnyResource, Registry>();

function register(
  types: Map<string, AnyResource>,
  resource: AnyResource,
): void {
  const existing = types.get(resource.type);
  if (existing !== undefined && existing !== resource) {
    throw new TypeError(
      `two different definitions declare the type "${resource.type}"`,
    );
  }
  types.set(resource.type, resource);
}

function build(primary: AnyResource): Registry {
  const types = new Map<string, AnyResource>();
  register(types, primary);
  const root = new Map<string, MutableNode>();
  for (const path of primary.query.include) {
    let resource = primary;
    let level = root;
    for (const segment of path.split('.')) {
      let node = level.get(segment);
      if (node === undefined) {
        const related = relatedResource(resource, segment);
        register(types, related);
        node = { resource: related, children: new Map() };
        level.set(segment, node);
      }
      resource = node.resource;
      level = node.children;
    }
  }
  return { include: root, types };
}

/** The registry of `resource`, built once. Throws on definition mistakes. */
export function registryOf(resource: AnyResource): Registry {
  let registry = registries.get(resource);
  if (registry === undefined) {
    registry = build(resource);
    registries.set(resource, registry);
  }
  return registry;
}

/** The definition at the end of an include path, or `undefined` when undeclared. */
export function resolveIncludePath(
  registry: Registry,
  segments: ReadonlyArray<string>,
): AnyResource | undefined {
  let level = registry.include;
  let resource: AnyResource | undefined;
  for (const segment of segments) {
    const node = level.get(segment);
    if (node === undefined) {
      return undefined;
    }
    resource = node.resource;
    level = node.children;
  }
  return resource;
}
