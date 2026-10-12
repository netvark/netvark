/**
 * The `filter` family as `parseQuery` reads it (SPEC 6.8, 15.5):
 * `filter[<field>]` for a bare value, which is `eq`, and
 * `filter[<field>][<operator>]` for values by operator, then each `or`
 * group's conditions under `filter[or][<n>]`. A list is the parameter
 * repeated, one pair per value and never joined, since a comma belongs to
 * the value. Names are not checked here: the types restrict them, and the
 * server reports what is left in one 400.
 * @ref https://jsonapi.org/format/1.1/#fetching-filtering
 * @packageDocumentation
 */
import type { FilterInput } from './types';

import { isRecord } from '../internal/object';

/** The member holding the disjunction groups (SPEC 6.8). */
const OR = 'or';

type Append = (name: string, value: string) => void;

/** A filter value as its parameter carries it; `TypeError` for a value with no such form. */
function written(parameter: string, value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  throw new TypeError(
    `serializeQuery: ${parameter} must be a string, a finite number, a bigint, a boolean, or a list of them`,
  );
}

/**
 * One pair per value. An empty list throws: no pair can carry it, and
 * dropping the condition would widen what the server returns.
 */
function appendValues(
  append: Append,
  parameter: string,
  values: unknown,
): void {
  const list: ReadonlyArray<unknown> = Array.isArray(values)
    ? values
    : [values];
  if (list.length === 0) {
    throw new TypeError(
      `serializeQuery: ${parameter} must hold at least one value`,
    );
  }
  for (const value of list) {
    append(parameter, written(parameter, value));
  }
}

/** A field's condition: a bare value or list, or values by operator in key order. */
function appendCondition(
  append: Append,
  parameter: string,
  condition: unknown,
): void {
  if (!isRecord(condition)) {
    appendValues(append, parameter, condition);
    return;
  }
  for (const [operator, values] of Object.entries(condition)) {
    if (values !== undefined) {
      appendValues(append, `${parameter}[${operator}]`, values);
    }
  }
}

function appendConditions(
  append: Append,
  prefix: string,
  conditions: Readonly<Record<string, unknown>>,
): void {
  for (const [field, condition] of Object.entries(conditions)) {
    if (field !== OR && condition !== undefined) {
      appendCondition(append, `${prefix}[${field}]`, condition);
    }
  }
}

/** Appends `filter`'s pairs: the conditions in key order, then the `or` groups by index. */
export function appendFilter(append: Append, filter: FilterInput): void {
  appendConditions(append, 'filter', filter);
  const groups = filter[OR];
  if (groups === undefined) {
    return;
  }
  if (!Array.isArray(groups)) {
    throw new TypeError('serializeQuery: filter.or must be a list of groups');
  }
  for (const [index, group] of groups.entries()) {
    if (!isRecord(group)) {
      throw new TypeError(
        `serializeQuery: filter.or[${String(index)}] must be an object of conditions`,
      );
    }
    appendConditions(append, `filter[${OR}][${String(index)}]`, group);
  }
}
