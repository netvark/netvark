/**
 * Resolution of a definition's `query` capabilities (SPEC 5.2): defaults,
 * member-name grammar for sort and filter names, the custom parameter naming
 * rule, and pagination bounds. All checks run once, at definition time.
 * @ref https://jsonapi.org/format/1.1/#query-parameters-custom
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/ (page[size])
 * @packageDocumentation
 */
import type {
  PageCapabilities,
  PageCapabilitiesInit,
  QueryCapabilities,
  QueryCapabilitiesInit,
  SearchParameter,
} from './types';

import {
  assertMemberName,
  isMemberName,
  isMemberPath,
} from '../document/member-name';
import {
  DEFAULT_MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  RESERVED_QUERY_FAMILIES,
} from '../internal/constants';

/** The `filter` member that groups conditions into a disjunction. */
export const FILTER_OR_MEMBER = 'or';
const NON_LOWERCASE = /[^a-z]/u;

export function assertUnique(what: string, names: ReadonlyArray<string>): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      throw new TypeError(`${what} "${name}" is declared more than once`);
    }
    seen.add(name);
  }
}

function assertPositiveInteger(what: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(
      `${what} must be a positive integer, received ${String(value)}`,
    );
  }
}

/**
 * The default page size MUST be between 1 and the max page size; this package
 * chooses a max of 100 when none is given rather than the profile's implicit
 * infinity, so an endpoint never returns an unbounded page by omission.
 */
function resolvePage(
  init: PageCapabilitiesInit | false | undefined,
): PageCapabilities | undefined {
  if (init === undefined || init === false) {
    return undefined;
  }
  const max = init.max ?? DEFAULT_MAX_PAGE_SIZE;
  assertPositiveInteger('query.page.max', max);
  const fallback = init.default ?? Math.min(DEFAULT_PAGE_SIZE, max);
  assertPositiveInteger('query.page.default', fallback);
  if (fallback > max) {
    throw new TypeError(
      `query.page.default (${String(fallback)}) exceeds query.page.max (${String(max)})`,
    );
  }
  return { default: fallback, max, range: init.range ?? false };
}

/**
 * A custom query parameter base name: a member name with at least one
 * character outside a-z, so it can never collide with a parameter the
 * specification may reserve later.
 */
function assertCustomBaseName(what: string, name: string): void {
  assertMemberName(what, name);
  if (!NON_LOWERCASE.test(name)) {
    throw new TypeError(
      `${what} "${name}" must contain at least one character outside a-z (https://jsonapi.org/format/1.1/#query-parameters-custom)`,
    );
  }
}

/** `filter[<member>]` or a custom base name. */
function resolveSearch(
  parameter: string | undefined,
): SearchParameter | undefined {
  if (parameter === undefined) {
    return undefined;
  }
  const bracket = parameter.indexOf('[');
  if (bracket === -1) {
    assertCustomBaseName('query.search', parameter);
    return { parameter, family: parameter, member: undefined };
  }
  const family = parameter.slice(0, bracket);
  const member = parameter.slice(bracket + 1, -1);
  if (
    family !== 'filter' ||
    !parameter.endsWith(']') ||
    !isMemberName(member)
  ) {
    throw new TypeError(
      `query.search "${parameter}" must be filter[<member>] or a custom base name`,
    );
  }
  return { parameter, family, member };
}

function resolveFilter(
  filter: Readonly<Record<string, ReadonlyArray<string>>>,
  search: SearchParameter | undefined,
): void {
  for (const [field, operators] of Object.entries(filter)) {
    if (!isMemberPath(field)) {
      throw new TypeError(
        `query.filter field "${field}" is not a member name or path`,
      );
    }
    if (
      field === FILTER_OR_MEMBER ||
      (search?.family === 'filter' && field === search.member)
    ) {
      throw new TypeError(`query.filter field "${field}" is reserved`);
    }
    if (operators.length === 0) {
      throw new TypeError(
        `query.filter field "${field}" declares no operators`,
      );
    }
    for (const operator of operators) {
      assertMemberName(`query.filter "${field}" operator`, operator);
    }
    assertUnique(`query.filter "${field}" operator`, operators);
  }
}

function resolveInclude(
  include: ReadonlyArray<string>,
  relationships: ReadonlySet<string>,
): void {
  for (const path of include) {
    const [first] = path.split('.');
    if (
      !isMemberPath(path) ||
      first === undefined ||
      !relationships.has(first)
    ) {
      throw new TypeError(
        `query.include path "${path}" does not start with a declared relationship`,
      );
    }
  }
  assertUnique('query.include path', include);
}

function resolveCustom(custom: ReadonlyArray<string>): void {
  for (const name of custom) {
    assertCustomBaseName('query.custom name', name);
    if (RESERVED_QUERY_FAMILIES.has(name)) {
      throw new TypeError(`query.custom name "${name}" is a reserved family`);
    }
  }
  assertUnique('query.custom name', custom);
}

/** Resolves and validates `query`; `relationships` are the declared names. */
export function resolveQueryCapabilities(
  init: QueryCapabilitiesInit<string, string> | undefined,
  relationships: ReadonlySet<string>,
): QueryCapabilities<string, string> {
  const sort = init?.sort ?? [];
  for (const field of sort) {
    if (!isMemberPath(field)) {
      throw new TypeError(
        `query.sort field "${field}" is not a member name or path`,
      );
    }
  }
  assertUnique('query.sort field', sort);
  const search = resolveSearch(init?.search);
  const filter = init?.filter ?? {};
  resolveFilter(filter, search);
  const include = init?.include ?? [];
  resolveInclude(include, relationships);
  const custom = init?.custom ?? [];
  resolveCustom(custom);
  return {
    sort,
    filter,
    include,
    fields: init?.fields ?? true,
    page: resolvePage(init?.page),
    search,
    custom,
  };
}
