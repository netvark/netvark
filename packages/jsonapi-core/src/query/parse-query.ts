/**
 * `parseQuery` (SPEC 6): turns a request's query parameters into a
 * `ParsedQuery` checked against a resource definition, or throws one
 * `BanError` carrying every problem found. A parameter the endpoint
 * does not know how to process is a 400, as the specification requires;
 * nothing is silently dropped.
 * @ref https://jsonapi.org/format/1.1/#query-parameters
 * @ref https://jsonapi.org/format/1.1/#query-parameters-custom
 * @ref https://jsonapi.org/format/1.1/#extension-query-parameters
 * @packageDocumentation
 */
import type { AnyResource, ResourceDefinition } from '../resource/types';
import type { ParseState } from './parse-families';
import type {
  PageRequest,
  ParameterValue,
  ParsedQuery,
  QueryInput,
} from './types';

import { jsonApiError } from '../errors/json-api-error';
import { rangePaginationNotSupportedError } from '../pagination/errors';
import { groupByName, toPairs } from './input';
import { parseParameterName } from './parameter-name';
import {
  parseFields,
  parseInclude,
  parsePageMember,
  parseSort,
  single,
  unknown,
} from './parse-families';
import {
  emptyFilterState,
  finishFilter,
  isSearchMember,
  parseFilterMember,
} from './parse-filter';
import { registryOf } from './registry';

function asValue(values: ReadonlyArray<string>): ParameterValue {
  return values.length === 1 ? (values[0] ?? '') : values;
}

/**
 * The used page size and range flag once every `page` member is known. On a
 * range request the default is the max page size.
 */
function resolvePage(state: ParseState): PageRequest | undefined {
  const page = state.resource.query.page;
  if (page === undefined) {
    return undefined;
  }
  const after = state.page.get('after');
  const before = state.page.get('before');
  const requested = state.page.get('size');
  const range = after !== undefined && before !== undefined;
  if (range && !page.range) {
    state.errors.push(rangePaginationNotSupportedError());
  }
  const fallback = range ? page.max : page.default;
  return {
    size: requested === undefined ? fallback : Number(requested),
    after,
    before,
    sizeRequested: requested !== undefined,
    range,
  };
}

/**
 * Parses and validates every query parameter of a request against
 * `resource`. Throws a `BanError` (400) listing all invalid and unknown
 * parameters, each with `source.parameter`.
 */
export function parseQuery<TSort extends string, TFilter extends string>(
  resource: ResourceDefinition<
    string,
    string,
    string,
    unknown,
    TSort,
    TFilter,
    unknown,
    unknown
  >,
  input: QueryInput,
): ParsedQuery<TSort, TFilter>;
export function parseQuery(
  resource: AnyResource,
  input: QueryInput,
): ParsedQuery {
  const pairs = toPairs(input);
  const state: ParseState = {
    resource,
    registry: registryOf(resource),
    errors: [],
    fields: new Map(),
    sort: [],
    page: new Map(),
  };
  const filter = emptyFilterState();
  let include: Array<ReadonlyArray<string>> | undefined;
  let search: string | undefined;
  // Keys are declared custom base names, which cannot be prototype keys:
  // a custom name must contain a character outside a-z.
  const custom: Record<string, ParameterValue> = {};
  for (const [name, values] of groupByName(pairs)) {
    const value = asValue(values);
    const parsed = parseParameterName(name);
    if (parsed === undefined) {
      state.errors.push(unknown(name));
      continue;
    }
    const { base, members } = parsed;
    const [member] = members;
    if (base === 'include' && members.length === 0) {
      const one = single(state, name, value);
      if (one !== undefined) {
        include = parseInclude(state, one);
      }
    } else if (base === 'fields' && members.length === 1 && member !== '') {
      const one = single(state, name, value);
      if (one !== undefined) {
        parseFields(state, name, member ?? '', one);
      }
    } else if (base === 'sort' && members.length === 0) {
      const one = single(state, name, value);
      if (one !== undefined) {
        parseSort(state, one);
      }
    } else if (base === 'page' && members.length === 1) {
      const one = single(state, name, value);
      if (one !== undefined) {
        parsePageMember(state, name, member ?? '', one);
      }
    } else if (base === 'filter' && isSearchMember(state, members)) {
      search = single(state, name, value);
    } else if (base === 'filter') {
      parseFilterMember(state, filter, name, members, value);
    } else if (
      resource.query.search?.family === base &&
      resource.query.search.member === undefined &&
      members.length === 0
    ) {
      search = single(state, name, value);
    } else if (resource.query.custom.includes(base)) {
      custom[name] = value;
    } else {
      state.errors.push(unknown(name));
    }
  }
  const page = resolvePage(state);
  if (state.errors.length > 0) {
    throw jsonApiError(state.errors);
  }
  return {
    include,
    fields: Object.fromEntries(state.fields),
    sort: state.sort,
    filter: finishFilter(filter),
    page,
    search,
    custom,
    params: new URLSearchParams(pairs.map(([name, value]) => [name, value])),
  };
}
