/**
 * `filter` and `sort` against `@netvark/keyset-core`'s operator table
 * (SPEC 11.3): a member filters with the operators its keyset type accepts,
 * `isNull` only when it is effectively nullable, and sorts only by a scalar
 * keyset type. It runs once the members' specs are known, since a member's
 * keyset type and nullability come from them, so a filter the declaration
 * allows is one the planner executes. The type-level twin is
 * `FilterRequirement` in `filter-check.ts`.
 * @ref https://github.com/netvark/netvark/blob/main/docs/keyset/SPEC.md (section 4.2)
 * @packageDocumentation
 */
import type { Operator } from '@netvark/keyset-core';

import type { KeysetType } from '../jsonapi/keyset-type';
import type { MemberSpec } from '../schema/field-spec';
import type { ResourceSpecs } from '../schema/resource-specs';
import type { ValueForm } from '../schema/value-form';
import type { Declaration } from './types';

import { operatorsFor } from '@netvark/keyset-core';

import { ownValue } from '../internal/object';
import { keysetTypeOf } from '../jsonapi/keyset-type';

/** What a member declares about filtering and sorting. */
interface Filtering {
  readonly filter?: ReadonlyArray<Operator> | undefined;
  readonly sort?: boolean | undefined;
}

/**
 * Names a value without a keyset type by why it has none. Every other form
 * has one, so the last case is a text or enum form whose options are empty.
 */
function unkeyed(form: ValueForm): string {
  if (form.kind === 'codec') {
    return 'a codec field';
  }
  if (form.kind === 'json') {
    return `type ${form.type}`;
  }
  return form.kind === 'array'
    ? 'an array of enum values'
    : 'an enum without values';
}

function checkOperators(
  path: string,
  keyset: KeysetType,
  nullable: boolean,
  filter: ReadonlyArray<Operator>,
): void {
  const accepted = operatorsFor(keyset.type, nullable);
  for (const operator of filter) {
    if (operator === 'isNull' && !nullable) {
      throw new TypeError(
        `${path}.filter: operator "isNull" is not available for non-null fields`,
      );
    }
    if (!accepted.has(operator)) {
      throw new TypeError(
        `${path}.filter: operator "${operator}" is not available for ${keyset.type} fields`,
      );
    }
  }
}

function checkMember(path: string, spec: MemberSpec, member: Filtering): void {
  const { filter, sort } = member;
  if (filter === undefined && sort !== true) {
    return;
  }
  const keyset = keysetTypeOf(spec.value);
  if (keyset === undefined) {
    const what = unkeyed(spec.value.form);
    throw new TypeError(
      filter === undefined
        ? `${path}.sort: ${what} is not sortable`
        : `${path}.filter: ${what} is not filterable`,
    );
  }
  if (filter !== undefined) {
    checkOperators(path, keyset, spec.nullable, filter);
  }
  if (sort === true && keyset.type === 'array') {
    throw new TypeError(`${path}.sort: an array field is not sortable`);
  }
}

/** Checks the `filter` and `sort` of every field and relationship `declaration` names. */
export function checkFilters(
  table: string,
  declaration: Declaration,
  specs: Pick<ResourceSpecs, 'fields' | 'relationships'>,
): void {
  for (const spec of specs.fields) {
    const field = ownValue(declaration.fields, spec.column);
    if (field !== undefined) {
      checkMember(`${table}.fields.${spec.column}`, spec, field);
    }
  }
  const relationships = declaration.relationships ?? {};
  for (const spec of specs.relationships) {
    const relationship = ownValue(relationships, spec.column);
    if (relationship !== undefined) {
      checkMember(`${table}.relationships.${spec.column}`, spec, relationship);
    }
  }
}
