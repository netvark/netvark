/**
 * The members of `filter` a declared resource's JSON:API definition gives
 * a meaning of its own (SPEC 3.7, 11.1), which no filtered member may take:
 * `@netvark/jsonapi-core` refuses a filter field named after either.
 * @ref https://github.com/netvark/netvark/blob/main/docs/jsonapi/SPEC.md (sections 5.2 and 6.8)
 * @packageDocumentation
 */

/** The member of the search parameter, `filter[q]`, of a declaration with `search`. */
export const SEARCH_MEMBER = 'q';

/** The member that groups conditions into a disjunction, `filter[or][n]` (jsonapi SPEC 6.8). */
export const FILTER_OR_MEMBER = 'or';
