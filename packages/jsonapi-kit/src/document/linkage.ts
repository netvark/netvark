/**
 * Full linkage (SPEC 7.3): every included resource must be reachable from
 * the primary data through a chain of relationship linkage, and when the
 * client sent `include`, only through the relationship paths it requested.
 * Both are checked over the complete resource objects (before sparse
 * fieldsets), which is exactly the specification's one exception: linkage a
 * sparse fieldset removed from the output still counts.
 * @ref https://jsonapi.org/format/1.1/#document-compound-documents
 * @ref https://jsonapi.org/format/1.1/#fetching-includes
 * @packageDocumentation
 */
import type {
  ResourceIdentifier,
  ResourceLinkage,
  ResourceObject,
} from './types';

type Key = string;

function isMany(
  data: ResourceLinkage,
): data is ReadonlyArray<ResourceIdentifier> {
  return Array.isArray(data);
}

function keyOf(type: string, id: string): Key {
  return `${type}\u0000${id}`;
}

/** The identifiers a resource object links to, by relationship name. */
function references(
  resource: ResourceObject,
  allowed: ReadonlySet<string> | undefined,
): Array<{ readonly name: string; readonly key: Key }> {
  const out: Array<{ name: string; key: Key }> = [];
  for (const [name, relationship] of Object.entries(
    resource.relationships ?? {},
  )) {
    if (allowed !== undefined && !allowed.has(name)) {
      continue;
    }
    const data = relationship.data;
    if (data === undefined || data === null) {
      continue;
    }
    for (const identifier of isMany(data) ? data : [data]) {
      out.push({ name, key: keyOf(identifier.type, identifier.id) });
    }
  }
  return out;
}

/** A trie of the requested include paths; `undefined` means every path. */
type PathTrie = Map<string, PathTrie>;

function trieOf(paths: ReadonlyArray<ReadonlyArray<string>>): PathTrie {
  const root: PathTrie = new Map();
  for (const path of paths) {
    let level = root;
    for (const segment of path) {
      let next = level.get(segment);
      if (next === undefined) {
        next = new Map();
        level.set(segment, next);
      }
      level = next;
    }
  }
  return root;
}

/**
 * Walks from the primary resources along relationship linkage and throws a
 * `TypeError` for any included resource the walk never reaches. With
 * `requested` paths the walk is confined to those paths, so an included
 * resource the client did not ask for is reported as well.
 */
export function assertFullLinkage(
  primary: ReadonlyArray<ResourceObject>,
  included: ReadonlyArray<ResourceObject>,
  requested: ReadonlyArray<ReadonlyArray<string>> | undefined,
): void {
  if (included.length === 0) {
    return;
  }
  const byKey = new Map<Key, ResourceObject>();
  for (const resource of included) {
    byKey.set(keyOf(resource.type, resource.id), resource);
  }
  const reached = new Set<Key>();
  const trie = requested === undefined ? undefined : trieOf(requested);
  const queue: Array<{
    resource: ResourceObject;
    level: PathTrie | undefined;
  }> = primary.map((resource) => ({ resource, level: trie }));
  while (queue.length > 0) {
    const { resource, level } = queue.shift() ?? {
      resource: undefined,
      level: undefined,
    };
    if (resource === undefined) {
      break;
    }
    const allowed = level === undefined ? undefined : new Set(level.keys());
    for (const { name, key } of references(resource, allowed)) {
      const target = byKey.get(key);
      if (target === undefined || reached.has(key)) {
        continue;
      }
      reached.add(key);
      queue.push({ resource: target, level: level?.get(name) });
    }
  }
  for (const resource of included) {
    if (!reached.has(keyOf(resource.type, resource.id))) {
      throw new TypeError(
        requested === undefined
          ? `included resource ${resource.type}:${resource.id} is not linked from the primary data (full linkage)`
          : `included resource ${resource.type}:${resource.id} is not reachable through the requested include paths`,
      );
    }
  }
}
