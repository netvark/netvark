/**
 * The component schemas of a declared resource (SPEC 6.2, 13.1): its
 * resource object as a response carries it, its identifier, and the
 * resource objects of a create and an update. A response object is open,
 * as `schema.read` strips the keys it does not know, so a client that
 * validates responses keeps working when the server adds a member, and
 * requires no attribute, since a sparse fieldset may leave any out. A
 * request object is closed, as `@netvark/jsonapi-core`'s parser is: a
 * member the resource does not declare is a 400, one the operation does
 * not write a 403 (SPEC 9.4), a create's `id` without client ids a 403.
 * `@`-members are skipped by the parser, so the schemas allow them.
 * @ref https://jsonapi.org/format/1.1/#document-resource-objects
 * @ref https://jsonapi.org/format/1.1/#document-member-names-at-members
 * @ref https://github.com/netvark/netvark/blob/main/docs/jsonapi/SPEC.md (section 9.2)
 * @packageDocumentation
 */
import type { JsonSchema } from '@netvark/ban-core';

import type { DeclaredInternals } from '../declare/declared-resource';
import type { FieldMeta } from '../meta/types';
import type { DocumentSide } from './member-schemas';

import { idMeta } from '../meta/value-meta';
import {
  carries,
  fieldSchema,
  LINK_SCHEMA,
  relationshipSchema,
} from './member-schemas';
import { wireSchema } from './value-schema';

/** The writing sides, whose objects a request carries. */
export type RequestSide = Exclude<DocumentSide, 'response'>;

/** Members a request may carry beside the ones it declares. */
const AT_MEMBERS = { '^@': {} };

/** One member's schema per public name, for an object's `properties`. */
type Members = Readonly<Record<string, JsonSchema>>;

function fieldMetaOf(internals: DeclaredInternals, name: string): FieldMeta {
  const meta = internals.resource.fields[name];
  if (meta === undefined) {
    throw new TypeError(
      `${internals.resource.names.type}: no metadata for ${name}`,
    );
  }
  return meta;
}

function attributesOf(
  internals: DeclaredInternals,
  side: DocumentSide,
): Members {
  return Object.fromEntries(
    internals.specs.fields
      .filter((spec) => carries(side, spec.access))
      .map((spec) => [
        spec.name,
        fieldSchema(fieldMetaOf(internals, spec.name), spec, side),
      ]),
  );
}

function relationshipsOf(
  internals: DeclaredInternals,
  side: DocumentSide,
): Members {
  const links = internals.resource.resource.links.relationship !== undefined;
  return Object.fromEntries(
    internals.specs.relationships
      .filter((spec) => carries(side, spec.access))
      .map((spec) => [
        spec.name,
        relationshipSchema(
          fieldMetaOf(internals, spec.name),
          spec.target().names.type,
          side,
          links,
        ),
      ]),
  );
}

/** The schema of the resource's id, a string in its key's form (SPEC 3.4). */
export function idSchema(internals: DeclaredInternals): JsonSchema {
  return wireSchema(idMeta(internals.specs.id.value));
}

/** `{ type, id }`, the linkage that names the resource. */
export function identifierSchema(internals: DeclaredInternals): JsonSchema {
  return {
    type: 'object',
    properties: {
      type: { const: internals.resource.names.type },
      id: idSchema(internals),
      meta: { type: 'object' },
    },
    required: ['type', 'id'],
  };
}

function membersObject(members: Members, extra: JsonSchema = {}): JsonSchema {
  return { type: 'object', properties: members, ...extra };
}

/** The resource object of a response. */
export function resourceObjectSchema(internals: DeclaredInternals): JsonSchema {
  const { resource, declaration, names } = internals.resource;
  const attributes = attributesOf(internals, 'response');
  const relationships = relationshipsOf(internals, 'response');
  return {
    type: 'object',
    ...(declaration.description === undefined
      ? {}
      : { description: declaration.description }),
    properties: {
      type: { const: names.type },
      id: idSchema(internals),
      ...(Object.keys(attributes).length === 0
        ? {}
        : { attributes: membersObject(attributes) }),
      ...(Object.keys(relationships).length === 0
        ? {}
        : { relationships: membersObject(relationships) }),
      ...(resource.links.self === undefined
        ? {}
        : { links: { type: 'object', properties: { self: LINK_SCHEMA } } }),
      meta: { type: 'object' },
    },
    required: ['type', 'id'],
  };
}

/** The members a create must carry (SPEC 6.2, `FieldMeta.required`). */
function requiredOf(
  internals: DeclaredInternals,
  members: Members,
  side: RequestSide,
): Array<string> {
  return side === 'create'
    ? Object.keys(members).filter(
        (name) => fieldMetaOf(internals, name).required,
      )
    : [];
}

/** A closed object of `members`, requiring `required`, that allows `@`-members. */
function closedObject(
  members: Members,
  required: ReadonlyArray<string>,
): JsonSchema {
  return membersObject(members, {
    ...(required.length === 0 ? {} : { required: [...required] }),
    patternProperties: AT_MEMBERS,
    additionalProperties: false,
  });
}

/**
 * The resource object a create or an update sends: `id` on a create only
 * with client ids, and required on an update; `attributes` and
 * `relationships` required on a create when one of their members is.
 */
export function requestObjectSchema(
  internals: DeclaredInternals,
  side: RequestSide,
): JsonSchema {
  const { resource, names } = internals.resource;
  const attributes = attributesOf(internals, side);
  const relationships = relationshipsOf(internals, side);
  const requiredAttributes = requiredOf(internals, attributes, side);
  const requiredRelationships = requiredOf(internals, relationships, side);
  const takesId = side === 'update' || resource.clientIds;
  return {
    type: 'object',
    properties: {
      type: { const: names.type },
      ...(takesId ? { id: idSchema(internals) } : {}),
      attributes: closedObject(attributes, requiredAttributes),
      relationships: closedObject(relationships, requiredRelationships),
      links: {},
      meta: { type: 'object' },
    },
    required: [
      'type',
      ...(side === 'update' ? ['id'] : []),
      ...(requiredAttributes.length === 0 ? [] : ['attributes']),
      ...(requiredRelationships.length === 0 ? [] : ['relationships']),
    ],
    patternProperties: AT_MEMBERS,
    additionalProperties: false,
  };
}
