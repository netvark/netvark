/**
 * Query input normalization (SPEC 6.1): every accepted input becomes an
 * ordered list of name/value pairs and a `URLSearchParams` that reproduces
 * the client's parameters for links.
 * @ref https://jsonapi.org/format/1.1/#appendix-query-details-parsing
 * @packageDocumentation
 */
import type { QueryInput } from './types';

export type Pair = readonly [name: string, value: string];

/**
 * Parameters in order, one pair per occurrence. A string runs through the
 * `application/x-www-form-urlencoded` parser (`URLSearchParams`), the one
 * the specification names; a record expands repeated values to repeated pairs.
 */
export function toPairs(input: QueryInput): Array<Pair> {
  if (typeof input === 'string') {
    return [
      ...new URLSearchParams(input.startsWith('?') ? input.slice(1) : input),
    ];
  }
  if (input instanceof URLSearchParams) {
    return [...input];
  }
  const pairs: Array<Pair> = [];
  for (const [name, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      pairs.push([name, value]);
    } else {
      for (const item of value) {
        pairs.push([name, item]);
      }
    }
  }
  return pairs;
}

/** Groups pairs by name, keeping first-seen order of names and of values. */
export function groupByName(
  pairs: ReadonlyArray<Pair>,
): Map<string, Array<string>> {
  const groups = new Map<string, Array<string>>();
  for (const [name, value] of pairs) {
    const values = groups.get(name);
    if (values === undefined) {
      groups.set(name, [value]);
    } else {
      values.push(value);
    }
  }
  return groups;
}
