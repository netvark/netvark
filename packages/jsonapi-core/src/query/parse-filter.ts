/**
 * The `filter` family grammar (SPEC 6.8). JSON:API reserves the family and
 * leaves its strategy to the server; this package defines:
 *
 * - `filter[field]=v`: the `eq` operator
 * - `filter[field][op]=v`: a declared operator
 * - `filter[or][n][field]=v` and `filter[or][n][field][op]=v`: a condition in
 *   disjunction group `n`
 * - the definition's search parameter when it lives in this family
 *
 * Fields and operators must be declared; anything else is a 400, whose
 * detail quotes the request's text only when it is a plain token (ADR 0016).
 * @ref https://jsonapi.org/format/1.1/#fetching-filtering
 * @packageDocumentation
 */
import type { ParseState } from './parse-families';
import type { FilterCondition, ParameterValue, ParsedFilter } from './types';

import { ownEntry } from '../internal/object';
import { quotable } from '../internal/quotable';
import { FILTER_OR_MEMBER } from '../resource/query-capabilities';
import { invalid, unknown } from './parse-families';

const GROUP_INDEX = /^[0-9]+$/u;
const EQ = 'eq';

export interface FilterState {
  readonly conditions: Array<FilterCondition>;
  readonly groups: Map<number, Array<FilterCondition>>;
}

export function emptyFilterState(): FilterState {
  return { conditions: [], groups: new Map() };
}

/** Whether `filter[...]` members name the definition's search parameter. */
export function isSearchMember(
  state: ParseState,
  members: ReadonlyArray<string>,
): boolean {
  const search = state.resource.query.search;
  return (
    search?.family === 'filter' &&
    members.length === 1 &&
    members[0] === search.member
  );
}

function condition(
  state: ParseState,
  parameter: string,
  field: string,
  operator: string,
  value: ParameterValue,
): FilterCondition | undefined {
  const operators = ownEntry(state.resource.query.filter, field);
  if (operators === undefined) {
    state.errors.push(
      invalid(
        parameter,
        quotable(field)
          ? `Filter field "${field}" is not supported by this endpoint`
          : 'The filter field of this parameter is not supported by this endpoint',
      ),
    );
    return undefined;
  }
  if (!operators.includes(operator)) {
    state.errors.push(
      invalid(
        parameter,
        quotable(operator)
          ? `Operator "${operator}" is not supported for filter field "${field}"`
          : `The operator of this parameter is not supported for filter field "${field}"`,
      ),
    );
    return undefined;
  }
  return { field, operator, value };
}

export function parseFilterMember(
  state: ParseState,
  filter: FilterState,
  parameter: string,
  members: ReadonlyArray<string>,
  value: ParameterValue,
): void {
  const search = state.resource.query.search;
  const [first, second, third, fourth] = members;
  if (
    first === undefined ||
    first === '' ||
    members.length > 4 ||
    (search?.family === 'filter' && first === search.member)
  ) {
    state.errors.push(unknown(parameter));
    return;
  }
  if (first === FILTER_OR_MEMBER) {
    if (
      second === undefined ||
      !GROUP_INDEX.test(second) ||
      third === undefined
    ) {
      state.errors.push(unknown(parameter));
      return;
    }
    const parsed = condition(state, parameter, third, fourth ?? EQ, value);
    if (parsed !== undefined) {
      const index = Number(second);
      const group = filter.groups.get(index);
      if (group === undefined) {
        filter.groups.set(index, [parsed]);
      } else {
        group.push(parsed);
      }
    }
    return;
  }
  if (members.length > 2) {
    state.errors.push(unknown(parameter));
    return;
  }
  const parsed = condition(state, parameter, first, second ?? EQ, value);
  if (parsed !== undefined) {
    filter.conditions.push(parsed);
  }
}

/** Groups in ascending index order. */
export function finishFilter(filter: FilterState): ParsedFilter {
  const anyOf = [...filter.groups.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([, group]) => group);
  return { conditions: filter.conditions, anyOf };
}
