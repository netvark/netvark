/**
 * The documents a write sends (SPEC 15.4): a resource object for `create`
 * and `update`, and linkage for the relationship calls. An id becomes an
 * identifier of the relationship's declared type; an identifier object
 * gives its `type` and `id` and nothing else, so a record passed as one
 * sends only what identifies it. Members left `undefined` are left out
 * when the document is written as JSON, so an attribute a create leaves
 * out keeps the server's default.
 * @ref https://jsonapi.org/format/1.1/#crud-creating
 * @ref https://jsonapi.org/format/1.1/#crud-updating
 * @ref https://jsonapi.org/format/1.1/#crud-updating-relationships
 * @ref https://jsonapi.org/format/1.1/#document-resource-identifier-objects
 * @packageDocumentation
 */
import type {
  AnyResource,
  RelationshipDefinition,
  ResourceIdentifier,
  ResourceLinkage,
} from '@netvark/jsonapi-core';

import type { Identifier } from '../document/types';
import type { LinkageInput } from './types';

import { defineMember } from '../internal/object';

/** A write's members, typed wide. */
export interface WriteInput {
  readonly id?: string | undefined;
  readonly attributes?: unknown;
  readonly relationships?:
    | Readonly<Record<string, LinkageInput | undefined>>
    | undefined;
}

/** A document a write sends. */
export interface RequestDocument {
  readonly data: unknown;
}

function identifierOf(
  type: string,
  value: string | Identifier,
): ResourceIdentifier {
  return typeof value === 'string'
    ? { type, id: value }
    : { type: value.type, id: value.id };
}

function isList(
  value: LinkageInput,
): value is ReadonlyArray<string | Identifier> {
  return Array.isArray(value);
}

/** The relationship `name` declares; throws `TypeError` naming it when there is none. */
export function relationshipOf(
  definition: AnyResource,
  call: string,
  name: string,
): RelationshipDefinition {
  const relationship = Object.hasOwn(definition.relationships, name)
    ? definition.relationships[name]
    : undefined;
  if (relationship === undefined) {
    throw new TypeError(
      `${definition.type} ${call}: ${definition.type} has no relationship "${name}"`,
    );
  }
  return relationship;
}

/** The linkage a write's value names: `null`, one identifier, or a list of them. */
export function linkageOf(
  relationship: RelationshipDefinition,
  value: LinkageInput,
): ResourceLinkage {
  if (value === null) {
    return null;
  }
  return isList(value)
    ? value.map((item) => identifierOf(relationship.type, item))
    : identifierOf(relationship.type, value);
}

function relationshipsOf(
  definition: AnyResource,
  call: string,
  relationships: Readonly<Record<string, LinkageInput | undefined>>,
): object {
  const members = {};
  for (const [name, value] of Object.entries(relationships)) {
    if (value !== undefined) {
      defineMember(members, name, {
        data: linkageOf(relationshipOf(definition, call, name), value),
      });
    }
  }
  return members;
}

/**
 * `{ data: { type, id?, attributes?, relationships? } }`: `id` is the
 * client's for a create, the path's for an update.
 */
export function resourceDocument(
  definition: AnyResource,
  call: 'create' | 'update',
  input: WriteInput,
  id?: string,
): RequestDocument {
  return {
    data: {
      type: definition.type,
      ...(id === undefined ? {} : { id }),
      ...(input.attributes === undefined
        ? {}
        : { attributes: input.attributes }),
      ...(input.relationships === undefined
        ? {}
        : {
            relationships: relationshipsOf(
              definition,
              call,
              input.relationships,
            ),
          }),
    },
  };
}
