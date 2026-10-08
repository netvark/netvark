import type { ParsedQuery } from '../query/types';
import type { AnyResource, ResourceDefinition } from '../resource/types';
/**
 * Document builders (SPEC 7.2 and 7.3): primary data from rows, compound
 * documents with full linkage, deduplication by `type` and `id`, and the
 * `included` member rules that follow from the `include` parameter.
 * @ref https://jsonapi.org/format/1.1/#document-top-level
 * @ref https://jsonapi.org/format/1.1/#document-compound-documents
 * @ref https://jsonapi.org/format/1.1/#fetching-includes
 * @packageDocumentation
 */
import type {
  CollectionDocument,
  DocumentBase,
  JsonApiObject,
  ResourceDocument,
  ResourceObject,
  ToManyRelationshipDocument,
  ToOneRelationshipDocument,
} from './types';

import { JSON_API_VERSION } from '../internal/constants';
import { compact } from '../internal/object';
import { assertFullLinkage } from './linkage';
import { applyFields, identify, serializeResource } from './serialize';

/** Rows to include, paired with the definition that serializes them. */
export interface Included {
  readonly resource: AnyResource;
  readonly rows: ReadonlyArray<unknown>;
}

export interface DocumentOptions extends DocumentBase {
  /** The parsed query: drives sparse fieldsets and the `included` rules. */
  readonly query?: ParsedQuery | undefined;
  /** Related rows for a compound document, in any order. */
  readonly included?: ReadonlyArray<Included> | undefined;
}

/**
 * Pairs rows with their definition for `included`. The row type is checked
 * against the definition here, once, so `included` entries stay typed.
 */
export function include<TRow>(
  resource: ResourceDefinition<
    string,
    string,
    string,
    TRow,
    string,
    string,
    unknown,
    unknown
  >,
  rows: ReadonlyArray<TRow>,
): Included {
  return { resource, rows };
}

/** The `jsonapi` object: the version this package implements plus overrides. */
export function jsonApiObject(init: JsonApiObject = {}): JsonApiObject {
  return compact({ version: JSON_API_VERSION, ...init });
}

function fieldsFor(
  query: ParsedQuery | undefined,
  type: string,
): ReadonlyArray<string> | undefined {
  return query?.fields[type];
}

function sparse(
  resource: ResourceObject,
  fields: ReadonlyArray<string> | undefined,
): ResourceObject {
  return fields === undefined ? resource : applyFields(resource, fields);
}

function keyOf(resource: ResourceObject): string {
  return `${resource.type}\u0000${resource.id}`;
}

/**
 * Serializes included rows, deduplicating by `type` and `id` (first wins,
 * and a resource already in the primary data is never repeated), checks
 * full linkage over the complete objects, and returns them with the sparse
 * fieldsets applied.
 * @ref https://jsonapi.org/format/1.1/#document-compound-documents
 *   "A compound document MUST NOT include more than one resource object for
 *   each type and id pair."
 */
function buildIncluded(
  primary: ReadonlyArray<ResourceObject>,
  options: DocumentOptions,
): ReadonlyArray<ResourceObject> | undefined {
  const requested = options.query?.include;
  if (options.included === undefined && requested === undefined) {
    return undefined;
  }
  const seen = new Set(primary.map((resource) => keyOf(resource)));
  const full: Array<{
    resource: ResourceObject;
    fields: ReadonlyArray<string> | undefined;
  }> = [];
  for (const entry of options.included ?? []) {
    const fields = fieldsFor(options.query, entry.resource.type);
    for (const row of entry.rows) {
      const complete = serializeResource(entry.resource, row);
      const key = keyOf(complete);
      if (!seen.has(key)) {
        seen.add(key);
        full.push({ resource: complete, fields });
      }
    }
  }
  assertFullLinkage(
    primary,
    full.map((entry) => entry.resource),
    requested,
  );
  // Nothing to include and nothing requested: no `included` member at all.
  // With an `include` parameter the member is required even when empty.
  if (requested === undefined && full.length === 0) {
    return undefined;
  }
  return full.map((entry) => sparse(entry.resource, entry.fields));
}

function base(options: DocumentOptions): DocumentBase {
  return {
    jsonapi: jsonApiObject(options.jsonapi),
    links: options.links,
    meta: options.meta,
  };
}

/**
 * A document whose primary data is one resource or `null`.
 * @ref https://jsonapi.org/format/1.1/#fetching-resources-responses-200
 */
export function resourceDocument<TRow>(
  resource: ResourceDefinition<
    string,
    string,
    string,
    TRow,
    string,
    string,
    unknown,
    unknown
  >,
  row: TRow | null,
  options: DocumentOptions = {},
): ResourceDocument {
  const complete = row === null ? null : serializeResource(resource, row);
  const data =
    complete === null
      ? null
      : sparse(complete, fieldsFor(options.query, resource.type));
  return compact({
    ...base(options),
    data,
    included: buildIncluded(complete === null ? [] : [complete], options),
  });
}

/** A document whose primary data is a collection, possibly empty. */
export function collectionDocument<TRow>(
  resource: ResourceDefinition<
    string,
    string,
    string,
    TRow,
    string,
    string,
    unknown,
    unknown
  >,
  rows: ReadonlyArray<TRow>,
  options: DocumentOptions = {},
): CollectionDocument {
  const fields = fieldsFor(options.query, resource.type);
  const complete = rows.map((row) => serializeResource(resource, row));
  return compact({
    ...base(options),
    data: complete.map((item) => sparse(item, fields)),
    included: buildIncluded(complete, options),
  });
}

/**
 * A relationship document for a to-one relationship: identifier or `null`.
 * @ref https://jsonapi.org/format/1.1/#fetching-relationships-responses-200
 */
export function toOneRelationshipDocument<TRow>(
  resource: ResourceDefinition<
    string,
    string,
    string,
    TRow,
    string,
    string,
    unknown,
    unknown
  >,
  row: TRow | null,
  options: DocumentBase = {},
): ToOneRelationshipDocument {
  return compact({
    jsonapi: jsonApiObject(options.jsonapi),
    links: options.links,
    meta: options.meta,
    data: row === null ? null : identify(resource, row),
  });
}

/** A relationship document for a to-many relationship: identifiers. */
export function toManyRelationshipDocument<TRow>(
  resource: ResourceDefinition<
    string,
    string,
    string,
    TRow,
    string,
    string,
    unknown,
    unknown
  >,
  rows: ReadonlyArray<TRow>,
  options: DocumentBase = {},
): ToManyRelationshipDocument {
  return compact({
    jsonapi: jsonApiObject(options.jsonapi),
    links: options.links,
    meta: options.meta,
    data: rows.map((row) => identify(resource, row)),
  });
}
