/**
 * The attribute schemas of a resource (SPEC 6.2): the object schemas of its
 * fields, with the validators of the multi-column CHECKs over fields only.
 * A CHECK that names a relationship runs where both its fields and its
 * relationships are in view, on the write schemas. `create` and `update`
 * also come as Standard Schema validators (SPEC 6.5).
 * @packageDocumentation
 */
import type { MemberSpec } from './field-spec';
import type { MultiColumnCheck } from './multi-column';
import type { ObjectMember, ObjectSchemas } from './object-schemas';
import type { ResourceValidator } from './validate';

import { memberFinder, memberInfo } from './member-info';
import { objectSchemas } from './object-schemas';
import { standardValidator } from './validate';
import { levelSchema } from './value-schema';

/** The attribute schemas of create and update as Standard Schema validators (SPEC 6.5). */
export interface AttributeValidators {
  readonly create: ResourceValidator;
  readonly update: ResourceValidator;
}

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

/** The read, create, and update schemas of the attributes. */
export function attributeSchemas(
  fields: ReadonlyArray<MemberSpec>,
  checks: ReadonlyArray<MultiColumnCheck>,
): ObjectSchemas {
  return objectSchemas(
    fields.map((field) => fieldMember(field)),
    checks.filter((check) => overFields(check)),
    (member) => ({ path: [member.name], read: (value) => value }),
  );
}

/** The Standard Schema validators of the attributes, whose issues name members by public name. */
export function attributeValidators(
  fields: ReadonlyArray<MemberSpec>,
  schemas: ObjectSchemas,
): AttributeValidators {
  const findMember = memberFinder(
    new Map(fields.map((field) => [field.name, memberInfo(field.value)])),
  );
  return Object.freeze({
    create: standardValidator(schemas.create, findMember),
    update: standardValidator(schemas.update, findMember),
  });
}
