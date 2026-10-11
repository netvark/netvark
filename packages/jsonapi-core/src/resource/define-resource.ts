/**
 * `defineResource` (SPEC 5.1): validates a definition once, at startup, and
 * fills in defaults. Every check here is a rule a client would otherwise
 * trip over at request time: member-name grammar for types and fields,
 * fields sharing a namespace with `type` and `id`, query capabilities that
 * name declared fields, custom parameter names that the specification allows.
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-fields
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-identification
 * @packageDocumentation
 */
import type {
  AnyResource,
  RelationshipDefinition,
  ResourceDefinition,
  ResourceDefinitionInit,
} from './types';
import type {
  ResourceValidators,
  WritableFields,
  WritableFieldsInit,
} from './write-types';

import { assertMemberName } from '../document/member-name';
import { isRecord, ownEntry } from '../internal/object';
import { resolveLinks } from './links';
import { assertUnique, resolveQueryCapabilities } from './query-capabilities';

/** Names no field may take: fields share a namespace with these members. */
const RESERVED_FIELD_NAMES: ReadonlySet<string> = new Set([
  'type',
  'id',
  'lid',
]);
const CARDINALITIES: ReadonlySet<string> = new Set(['one', 'many']);

function assertFieldName(what: string, name: string): void {
  assertMemberName(what, name);
  if (RESERVED_FIELD_NAMES.has(name)) {
    throw new TypeError(
      `${what} "${name}" is not allowed: fields share a namespace with type and id`,
    );
  }
}

function assertRelationships(
  relationships: Readonly<Record<string, RelationshipDefinition>>,
  attributes: ReadonlySet<string>,
): void {
  for (const [name, definition] of Object.entries(relationships)) {
    assertFieldName('relationship', name);
    if (attributes.has(name)) {
      throw new TypeError(
        `"${name}" is declared as both an attribute and a relationship`,
      );
    }
    assertMemberName(`relationship "${name}" type`, definition.type);
    if (!CARDINALITIES.has(definition.cardinality)) {
      throw new TypeError(
        `relationship "${name}" cardinality must be "one" or "many"`,
      );
    }
  }
}

/**
 * Structural check for Standard Schema V1. `~standard` is read with `in`
 * rather than as an own property: zod 4, valibot, and ArkType define it as
 * a prototype getter, which the specification permits.
 * @ref https://standardschema.dev/#how-do-i-accept-standard-schemas-in-my-library
 */
function isStandardSchema(value: unknown): boolean {
  if (
    (typeof value !== 'object' && typeof value !== 'function') ||
    value === null ||
    !('~standard' in value)
  ) {
    return false;
  }
  const props: unknown = value['~standard'];
  return (
    isRecord(props) &&
    props['version'] === 1 &&
    typeof props['validate'] === 'function'
  );
}

function assertValidators(
  validate: ResourceValidators<unknown, unknown>,
): void {
  for (const [name, schema] of Object.entries(validate)) {
    if (schema !== undefined && !isStandardSchema(schema)) {
      throw new TypeError(
        `validate.${name} is not a Standard Schema V1 object`,
      );
    }
  }
}

/** Each write's fields: the declared fields a list names, each once, or every field without a list. */
function resolveWritable(
  writable: WritableFieldsInit<string> | undefined,
  fields: ReadonlySet<string>,
): WritableFields {
  const resolve = (operation: 'create' | 'update'): ReadonlySet<string> => {
    const names = writable?.[operation];
    if (names === undefined) {
      return fields;
    }
    for (const name of names) {
      if (!fields.has(name)) {
        throw new TypeError(
          `writable.${operation}: "${name}" is not a declared field`,
        );
      }
    }
    assertUnique(`writable.${operation} field`, names);
    return new Set(names);
  };
  return { create: resolve('create'), update: resolve('update') };
}

/**
 * Validates and resolves a resource definition. Throws a `TypeError` naming
 * the offending option; never throws for a valid definition.
 *
 * The literal types of `type`, `attributes`, the relationship names, and the
 * sort and filter names are inferred and carried on the result.
 */
export function defineResource<
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
>;
export function defineResource(
  init: ResourceDefinitionInit<
    string,
    string,
    string,
    unknown,
    string,
    string,
    unknown,
    unknown
  >,
): AnyResource {
  assertMemberName('type', init.type);
  for (const name of init.attributes) {
    assertFieldName('attribute', name);
  }
  assertUnique('attribute', init.attributes);
  const attributes = new Set(init.attributes);
  const relationships = init.relationships ?? {};
  assertRelationships(relationships, attributes);
  if (typeof init.serialize !== 'function') {
    throw new TypeError('serialize must be a function');
  }
  const validate = init.validate ?? {};
  assertValidators(validate);
  if (validate.id !== undefined && init.clientIds !== true) {
    throw new TypeError('validate.id needs clientIds: true');
  }
  const relationshipNames = new Set(Object.keys(relationships));
  const fields = new Set([...attributes, ...relationshipNames]);
  return {
    type: init.type,
    attributes: [...init.attributes],
    relationships,
    fields,
    serialize: init.serialize,
    links: resolveLinks(init.links ?? {}, init.type),
    query: resolveQueryCapabilities(init.query, relationshipNames),
    validate,
    writable: resolveWritable(init.writable, fields),
    clientIds: init.clientIds ?? false,
  };
}

/**
 * Follows a relationship to its definition. Throws when the relationship
 * declares no `resource` or the definition's type disagrees with the
 * relationship's: both are definition mistakes that would otherwise surface
 * as a confusing 400 to a client.
 */
export function relatedResource(
  resource: AnyResource,
  name: string,
): AnyResource {
  const relationship = ownEntry(resource.relationships, name);
  if (relationship === undefined) {
    throw new TypeError(`"${resource.type}" has no relationship "${name}"`);
  }
  if (relationship.resource === undefined) {
    throw new TypeError(
      `relationship "${name}" of "${resource.type}" declares no resource definition`,
    );
  }
  const related = relationship.resource();
  if (related.type !== relationship.type) {
    throw new TypeError(
      `relationship "${name}" of "${resource.type}" declares type "${relationship.type}" but its resource definition is "${related.type}"`,
    );
  }
  return related;
}
