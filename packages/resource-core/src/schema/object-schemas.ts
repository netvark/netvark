/**
 * The read, create, and update schemas of an object of members (SPEC 6.2):
 * Zod objects keyed by public names, for the attributes and, with linkage
 * members, for the relationships. `read` holds every member a response
 * carries, each required, and strips unknown keys, so a client that
 * validates responses keeps working when the server adds a member; it has
 * no object-level check, so `read.pick(...)` validates a sparse fieldset.
 * `create` and `update` reject unknown keys, take an optional member as a
 * missing key or `undefined` alike, and never output a member whose value
 * is `undefined` (ADR 0004). No schema has a default, a prefault, a catch,
 * or a transform: what a client leaves out stays out, and the database
 * decides it.
 * @ref https://zod.dev/api#objects
 * @packageDocumentation
 */
import type { $ZodCheck } from 'zod/v4/core';

import type { Access } from '../declare/types';
import type {
  CheckMember,
  MemberLocation,
  MultiColumnCheck,
} from './multi-column';

import { z } from 'zod/v4';

import { checkRefinements } from './multi-column';

/** The three schemas of an object of members. */
type SchemaName = 'read' | 'create' | 'update';

/** A member of an object schema: its public name, access, requirement, and value schema. */
export interface ObjectMember {
  readonly name: string;
  readonly access: Access;
  /** Required on insert (SPEC 6.3): the member is not optional in `create`. */
  readonly required: boolean;
  /** The member's value schema, `null` included when the member takes it; validators run outside `read`. */
  readonly value: (validators: boolean) => z.ZodType;
}

/** The object schemas of one set of members. */
export interface ObjectSchemas {
  readonly read: z.ZodObject;
  readonly create: z.ZodObject;
  readonly update: z.ZodObject;
}

/** The accesses each schema holds (SPEC 3.1). */
const ACCESSES: { readonly [K in SchemaName]: ReadonlySet<Access> } = {
  read: new Set<Access>(['read', 'readWrite', 'immutable']),
  create: new Set<Access>(['readWrite', 'immutable', 'write']),
  update: new Set<Access>(['readWrite', 'write']),
};

/** Whether a member with `access` belongs in the schema `name` (SPEC 3.1). */
export function schemaHolds(name: SchemaName, access: Access): boolean {
  return ACCESSES[name].has(access);
}

function shapeOf(
  members: ReadonlyArray<ObjectMember>,
  name: SchemaName,
): Record<string, z.ZodType> {
  return Object.fromEntries(
    members
      .filter((member) => schemaHolds(name, member.access))
      .map((member) => {
        const value = member.value(name !== 'read');
        const required =
          name === 'read' || (name === 'create' && member.required);
        return [member.name, required ? value : value.optional()];
      }),
  );
}

/** The parsed object without the members a client set to `undefined`. */
function withoutUndefined(
  value: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, member]) => member !== undefined),
  );
}

/** The refinements of the CHECKs whose every member the schema holds. */
function refinementsOf(
  shape: Readonly<Record<string, z.ZodType>>,
  checks: ReadonlyArray<MultiColumnCheck>,
  locate: (member: CheckMember) => MemberLocation,
): ReadonlyArray<$ZodCheck<object>> {
  return checks
    .filter((check) =>
      check.members.every((member) => Object.hasOwn(shape, member.name)),
    )
    .flatMap((check) => checkRefinements(check, locate));
}

function writeSchema(
  members: ReadonlyArray<ObjectMember>,
  name: 'create' | 'update',
  checks: ReadonlyArray<MultiColumnCheck>,
  locate: (member: CheckMember) => MemberLocation,
): z.ZodObject {
  const shape = shapeOf(members, name);
  const schema = z.strictObject(shape).overwrite(withoutUndefined);
  const refinements = refinementsOf(shape, checks, locate);
  return refinements.length === 0 ? schema : schema.check(...refinements);
}

/**
 * The read, create, and update schemas of `members`. `checks` are the
 * multi-column CHECKs to run on this object; a CHECK runs in a schema only
 * when the schema holds all its members, since otherwise they are never
 * all present (SPEC 6.2).
 */
export function objectSchemas(
  members: ReadonlyArray<ObjectMember>,
  checks: ReadonlyArray<MultiColumnCheck>,
  locate: (member: CheckMember) => MemberLocation,
): ObjectSchemas {
  return {
    read: z.object(shapeOf(members, 'read')),
    create: writeSchema(members, 'create', checks, locate),
    update: writeSchema(members, 'update', checks, locate),
  };
}
