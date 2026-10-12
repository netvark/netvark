/**
 * `deserialize(document, options)` (SPEC 15.6, ADR 0019): a document's
 * resource objects as flat records. A record holds `type`, `id`, each
 * attribute, each relationship, and the object's `links`, `meta`, and
 * relationship objects as `$links`, `$meta`, and `$relationships`. A
 * relationship on a requested include path resolves into the included
 * records, found by type and id among the primary data and `included`;
 * every other one is its linkage. The include paths are finite, so the
 * records form a tree: they serialize, clone, and cache as plain data.
 * Fields are set as own data properties, so a member named `__proto__`
 * stays a plain key.
 * @ref https://jsonapi.org/format/1.1/#document-compound-documents
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-fields
 * @ref https://jsonapi.org/format/1.1/#document-member-names-at-members
 * @packageDocumentation
 */
import type { JsonRecord } from '../internal/object';
import type { IncludeTree } from './include-tree';
import type {
  AnyRecord,
  Deserialized,
  DeserializeOptions,
  Identifier,
} from './types';

import { defineMember, isRecord, ownMember } from '../internal/object';
import { includeTree, NO_INCLUDES } from './include-tree';
import {
  jsonApiObjectOf,
  linksOf,
  relationshipObjectOf,
  resourceIdentifierOf,
} from './members';

/** A resource object whose `type` and `id` are strings. */
interface Resource {
  readonly type: string;
  readonly id: string;
  readonly object: JsonRecord;
}

/** Resource objects by type, then id; the first of a type and id wins. */
type Index = ReadonlyMap<string, ReadonlyMap<string, Resource>>;

type Linkage = Identifier | null | ReadonlyArray<Identifier>;

type Resolved = AnyRecord | null | undefined | ReadonlyArray<AnyRecord>;

const NOT_A_DOCUMENT = 'deserialize: the document is not a JSON object';
const NOT_A_RESOURCE =
  'deserialize: a resource object has no string type and id';
const NOT_DATA =
  'deserialize: data is not a resource object, a list of them, or null';
const NOT_INCLUDED = 'deserialize: included is not a list';

/** Whether a member name can be a field: not `type` or `id`, no `$`, not an @-member. */
function isField(name: string): boolean {
  return (
    name !== 'type' &&
    name !== 'id' &&
    !name.includes('$') &&
    !name.startsWith('@')
  );
}

function resourceOf(value: unknown, message: string): Resource {
  if (isRecord(value)) {
    const type = ownMember(value, 'type');
    const id = ownMember(value, 'id');
    if (typeof type === 'string' && typeof id === 'string') {
      return { type, id, object: value };
    }
  }
  throw new TypeError(message);
}

/** A linkage identifier: `type` and `id`, its `meta` left in `$relationships`. */
function identifierOf(value: unknown): Identifier {
  const { type, id } = resourceIdentifierOf(value);
  return { type, id };
}

function indexOf(resources: ReadonlyArray<Resource>): Index {
  const index = new Map<string, Map<string, Resource>>();
  for (const resource of resources) {
    let byId = index.get(resource.type);
    if (byId === undefined) {
      byId = new Map();
      index.set(resource.type, byId);
    }
    if (!byId.has(resource.id)) {
      byId.set(resource.id, resource);
    }
  }
  return index;
}

function linkageOf(data: unknown): Linkage {
  if (data === null) {
    return null;
  }
  return Array.isArray(data)
    ? data.map((item) => identifierOf(item))
    : identifierOf(data);
}

/** The records linkage names on an include path; a resource the document leaves out is left out. */
function resolve(data: unknown, tree: IncludeTree, index: Index): Resolved {
  if (data === null) {
    return null;
  }
  const found = (item: unknown): Resource | undefined => {
    const { type, id } = identifierOf(item);
    return index.get(type)?.get(id);
  };
  if (Array.isArray(data)) {
    return data.flatMap((item) => {
      const resource = found(item);
      return resource === undefined ? [] : [recordOf(resource, tree, index)];
    });
  }
  const resource = found(data);
  return resource === undefined ? undefined : recordOf(resource, tree, index);
}

/** A relationship's value: resolved on an include path, else its linkage; `undefined` without `data`. */
function relationshipValue(
  relationship: JsonRecord,
  tree: IncludeTree | undefined,
  index: Index,
): Linkage | Resolved {
  if (!Object.hasOwn(relationship, 'data')) {
    return undefined;
  }
  const data = relationship['data'];
  return tree === undefined ? linkageOf(data) : resolve(data, tree, index);
}

function setRelationships(
  record: object,
  relationships: JsonRecord,
  tree: IncludeTree,
  index: Index,
): void {
  const sent = {};
  for (const [name, relationship] of Object.entries(relationships)) {
    if (isField(name) && isRecord(relationship)) {
      defineMember(
        record,
        name,
        relationshipValue(relationship, tree.get(name), index),
      );
      defineMember(sent, name, relationshipObjectOf(relationship));
    }
  }
  defineMember(record, '$relationships', sent);
}

function recordOf(
  resource: Resource,
  tree: IncludeTree,
  index: Index,
): AnyRecord {
  const record: { readonly type: string; readonly id: string } = {
    type: resource.type,
    id: resource.id,
  };
  const { object } = resource;
  const attributes = ownMember(object, 'attributes');
  if (isRecord(attributes)) {
    for (const [name, value] of Object.entries(attributes)) {
      if (isField(name)) {
        defineMember(record, name, value);
      }
    }
  }
  const relationships = ownMember(object, 'relationships');
  if (isRecord(relationships)) {
    setRelationships(record, relationships, tree, index);
  }
  const links = ownMember(object, 'links');
  if (isRecord(links)) {
    defineMember(record, '$links', linksOf(links));
  }
  const meta = ownMember(object, 'meta');
  if (isRecord(meta)) {
    defineMember(record, '$meta', meta);
  }
  return record;
}

function primaryOf(data: unknown): ReadonlyArray<Resource> {
  if (data === undefined || data === null) {
    return [];
  }
  if (Array.isArray(data)) {
    return data.map((item) => resourceOf(item, NOT_A_RESOURCE));
  }
  if (!isRecord(data)) {
    throw new TypeError(NOT_DATA);
  }
  return [resourceOf(data, NOT_A_RESOURCE)];
}

function includedOf(included: unknown): ReadonlyArray<Resource> {
  if (included === undefined) {
    return [];
  }
  if (!Array.isArray(included)) {
    throw new TypeError(NOT_INCLUDED);
  }
  return included.map((item) => resourceOf(item, NOT_A_RESOURCE));
}

function dataOf(
  data: unknown,
  primary: ReadonlyArray<Resource>,
  tree: IncludeTree,
  index: Index,
): Deserialized['data'] {
  if (data === undefined || data === null) {
    return data;
  }
  const records = primary.map((resource) => recordOf(resource, tree, index));
  return Array.isArray(data) ? records : records[0];
}

function objectMember(
  document: JsonRecord,
  key: string,
): JsonRecord | undefined {
  const value = ownMember(document, key);
  return isRecord(value) ? value : undefined;
}

/** The document's `links`, `meta`, and `jsonapi`, each `undefined` when it is not an object. */
export function documentMembers(
  document: JsonRecord,
): Pick<Deserialized, 'links' | 'meta' | 'jsonapi'> {
  const links = objectMember(document, 'links');
  const jsonapi = objectMember(document, 'jsonapi');
  return {
    links: links === undefined ? undefined : linksOf(links),
    meta: objectMember(document, 'meta'),
    jsonapi: jsonapi === undefined ? undefined : jsonApiObjectOf(jsonapi),
  };
}

/**
 * The records of a document. Throws `TypeError` when the document is not
 * a JSON object, `data` or `included` is not of its shape, or a resource
 * object or identifier has no string `type` and `id`.
 */
export function deserialize(
  document: unknown,
  options: DeserializeOptions = {},
): Deserialized {
  if (!isRecord(document)) {
    throw new TypeError(NOT_A_DOCUMENT);
  }
  const data = ownMember(document, 'data');
  const primary = primaryOf(data);
  const included = includedOf(ownMember(document, 'included'));
  const index = indexOf([...primary, ...included]);
  const tree = includeTree(options.include ?? []);
  return {
    data: dataOf(data, primary, tree, index),
    included: included.map((resource) =>
      recordOf(resource, NO_INCLUDES, index),
    ),
    ...documentMembers(document),
  };
}
