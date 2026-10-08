import type {
  AnyResource,
  LinkageInit,
  RelationshipDefinition,
  RelationshipInit,
  SerializedRelationship,
} from '../resource/types';
/**
 * Resource object serialization (SPEC 7.1): a definition plus one row
 * becomes a resource object. `id` is always a string, sparse fieldsets apply
 * on every path, and relationship linkage is built from ids with the
 * declared related type.
 * @ref https://jsonapi.org/format/1.1/#document-resource-objects
 * @ref https://jsonapi.org/format/1.1/#fetching-sparse-fieldsets
 * @packageDocumentation
 */
import type {
  Link,
  Links,
  Relationship,
  ResourceIdentifier,
  ResourceLinkage,
  ResourceObject,
} from './types';

import { compact, ownEntry } from '../internal/object';

/** Identifiers as `serialize` may hand them: ids, or identifier objects. */
function identifier(
  value: string | ResourceIdentifier,
  type: string,
): ResourceIdentifier {
  return typeof value === 'string' ? { type, id: value } : value;
}

function isRelationshipInit(
  value: SerializedRelationship,
): value is RelationshipInit {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('type' in value)
  );
}

/**
 * Linkage from the shorthand: `null` and `[]` stay empty linkage; an id or
 * identifier becomes to-one linkage; an array becomes to-many linkage. The
 * declared cardinality is enforced so a to-one relationship never carries
 * an array and a to-many never carries a single identifier.
 */
function isList(
  value: LinkageInit,
): value is ReadonlyArray<string> | ReadonlyArray<ResourceIdentifier> {
  return Array.isArray(value);
}

export function linkage(
  value: LinkageInit,
  definition: RelationshipDefinition,
  name: string,
): ResourceLinkage {
  if (definition.cardinality === 'many') {
    if (!isList(value)) {
      throw new TypeError(
        `relationship "${name}" is to-many; serialize must return an array of ids or identifiers`,
      );
    }
    return value.map((item: string | ResourceIdentifier) =>
      identifier(item, definition.type),
    );
  }
  if (isList(value)) {
    throw new TypeError(
      `relationship "${name}" is to-one; serialize must return one id, one identifier, or null`,
    );
  }
  return value === null ? null : identifier(value, definition.type);
}

function relationship(
  value: SerializedRelationship,
  definition: RelationshipDefinition,
  name: string,
  links: Links | undefined,
): Relationship {
  const init: RelationshipInit = isRelationshipInit(value)
    ? value
    : { data: value };
  const merged =
    links === undefined && init.links === undefined
      ? undefined
      : { ...links, ...init.links };
  const out = compact({
    links: merged,
    data:
      init.data === undefined
        ? undefined
        : linkage(init.data, definition, name),
    meta: init.meta,
  });
  if (Object.keys(out).length === 0) {
    throw new TypeError(
      `relationship "${name}" must carry at least one of links, data, or meta`,
    );
  }
  return out;
}

function relationshipLinks(
  resource: AnyResource,
  id: string,
  name: string,
): Links | undefined {
  const build = resource.links.relationship;
  if (build === undefined) {
    return undefined;
  }
  const built = build(id, name);
  const links: Record<string, Link> = {};
  if (built.self !== undefined) {
    links['self'] = built.self;
  }
  if (built.related !== undefined) {
    links['related'] = built.related;
  }
  return Object.keys(links).length === 0 ? undefined : links;
}

/**
 * Applies a sparse fieldset to a complete resource object: only the named
 * attributes and relationships survive; an empty fieldset drops both
 * members. `type`, `id`, `links`, and `meta` are not fields and stay.
 */
export function applyFields(
  resource: ResourceObject,
  fields: ReadonlyArray<string>,
): ResourceObject {
  const wanted = new Set(fields);
  const attributes = Object.fromEntries(
    Object.entries(resource.attributes ?? {}).filter(([name]) =>
      wanted.has(name),
    ),
  );
  const relationships = Object.fromEntries(
    Object.entries(resource.relationships ?? {}).filter(([name]) =>
      wanted.has(name),
    ),
  );
  return compact({
    type: resource.type,
    id: resource.id,
    attributes: Object.keys(attributes).length === 0 ? undefined : attributes,
    relationships:
      Object.keys(relationships).length === 0 ? undefined : relationships,
    links: resource.links,
    meta: resource.meta,
  });
}

/**
 * Serializes one row into a complete resource object; `undefined`
 * attribute values are dropped because JSON has no undefined.
 */
export function serializeResource(
  resource: AnyResource,
  row: unknown,
): ResourceObject {
  const serialized = resource.serialize(row);
  if (typeof serialized.id !== 'string') {
    throw new TypeError(
      `serialize for "${resource.type}" must return a string id, received ${typeof serialized.id}`,
    );
  }
  const attributes: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(serialized.attributes ?? {})) {
    if (value !== undefined) {
      attributes[name] = value;
    }
  }
  const relationships: Record<string, Relationship> = {};
  for (const [name, value] of Object.entries(serialized.relationships ?? {})) {
    const definition = ownEntry(resource.relationships, name);
    if (definition === undefined) {
      throw new TypeError(
        `serialize for "${resource.type}" returned undeclared relationship "${name}"`,
      );
    }
    if (value !== undefined) {
      relationships[name] = relationship(
        value,
        definition,
        name,
        relationshipLinks(resource, serialized.id, name),
      );
    }
  }
  const self = resource.links.self?.(serialized.id);
  const links =
    self === undefined && serialized.links === undefined
      ? undefined
      : { ...(self === undefined ? {} : { self }), ...serialized.links };
  return compact({
    type: resource.type,
    id: serialized.id,
    attributes: Object.keys(attributes).length === 0 ? undefined : attributes,
    relationships:
      Object.keys(relationships).length === 0 ? undefined : relationships,
    links,
    meta: serialized.meta,
  });
}

/** The identifier of a row: `type` and `id` only. */
export function identify(
  resource: AnyResource,
  row: unknown,
): ResourceIdentifier {
  const serialized = resource.serialize(row);
  return { type: resource.type, id: serialized.id };
}
