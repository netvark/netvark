/**
 * The attribute schemas of a resource (SPEC 6.2): the object schemas of its
 * fields, with the validators of the multi-column CHECKs over fields only,
 * and the schema of its id (SPEC 3.4). A CHECK that names a relationship
 * runs where both its fields and its relationships are in view, on the
 * write schemas. `create`, `update`, and `id` also come as Standard Schema
 * validators (SPEC 6.5).
 * @packageDocumentation
 */
import type { z } from 'zod/v4';

import type { MemberSpec } from './field-spec';
import type { FindMember, MemberInfo } from './issues';
import type { MultiColumnCheck } from './multi-column';
import type { ObjectMember, ObjectSchemas } from './object-schemas';
import type { ResourceValidator } from './validate';

import { idSchema } from './id-schema';
import { memberFinder, memberInfo } from './member-info';
import { objectSchemas } from './object-schemas';
import { standardValidator } from './validate';
import { levelSchema } from './value-schema';

/** The attribute schemas, and the schema of an id. */
export interface AttributeSchemas extends ObjectSchemas {
  /** A resource id in its key's form (SPEC 3.4): a URL's, or a create's client id. */
  readonly id: z.ZodType<string>;
}

/** The attribute schemas of create and update and the id's schema as Standard Schema validators (SPEC 6.5). */
export interface AttributeValidators {
  readonly create: ResourceValidator;
  readonly update: ResourceValidator;
  readonly id: ResourceValidator<unknown, string>;
}

/** An id's issues lie at the id itself, a string whatever its key's type (SPEC 3.4). */
const ID_INFO: MemberInfo = {
  integer: false,
  integerElements: false,
  codec: undefined,
};
const findId: FindMember = () => ({ info: ID_INFO, depth: 0 });

/** A field as a member of the attribute objects. */
function fieldMember(spec: MemberSpec): ObjectMember {
  return {
    name: spec.name,
    access: spec.access,
    required: spec.required,
    value: (validators) =>
      levelSchema(spec.value, { nullable: spec.nullable, validators }),
  };
}

/** Whether every member of a CHECK is a field. */
export function overFields(check: MultiColumnCheck): boolean {
  return check.members.every((member) => member.kind === 'field');
}

/** The read, create, and update schemas of the attributes, and the id's schema. */
export function attributeSchemas(
  fields: ReadonlyArray<MemberSpec>,
  checks: ReadonlyArray<MultiColumnCheck>,
  id: MemberSpec,
): AttributeSchemas {
  return {
    ...objectSchemas(
      fields.map((field) => fieldMember(field)),
      checks.filter((check) => overFields(check)),
      (member) => ({ path: [member.name], read: (value) => value }),
    ),
    id: idSchema(id.value, id.column),
  };
}

/** The Standard Schema validators of the attributes, whose issues name members by public name. */
export function attributeValidators(
  fields: ReadonlyArray<MemberSpec>,
  schemas: AttributeSchemas,
): AttributeValidators {
  const findMember = memberFinder(
    new Map(fields.map((field) => [field.name, memberInfo(field.value)])),
  );
  return Object.freeze({
    create: standardValidator(schemas.create, findMember),
    update: standardValidator(schemas.update, findMember),
    id: standardValidator(schemas.id, findId),
  });
}
