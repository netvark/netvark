/**
 * The parsed query (SPEC 6.1): what `parseQuery` hands a handler after
 * every parameter has been checked against the resource definition.
 * @packageDocumentation
 */

export interface SortField<TSort extends string = string> {
  readonly field: TSort;
  /** Ascending unless the field was prefixed with `-`. */
  readonly direction: 'asc' | 'desc';
}

/** A parameter's value: a string, or the strings of a repeated parameter. */
export type ParameterValue = string | ReadonlyArray<string>;

export interface FilterCondition<TFilter extends string = string> {
  readonly field: TFilter;
  /** An operator the definition lists for the field; `eq` for `filter[field]`. */
  readonly operator: string;
  readonly value: ParameterValue;
}

export interface ParsedFilter<TFilter extends string = string> {
  /** `filter[field]` and `filter[field][op]`, all of which must hold. */
  readonly conditions: ReadonlyArray<FilterCondition<TFilter>>;
  /**
   * `filter[or][n][field][op]` groups, in group order: within a group any
   * condition may hold; every group must hold.
   */
  readonly anyOf: ReadonlyArray<ReadonlyArray<FilterCondition<TFilter>>>;
}

/**
 * The resolved `page` family under the Cursor Pagination profile.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 */
export interface PageRequest {
  /** The "used page size": `page[size]`, else the default (the max on range requests). */
  readonly size: number;
  readonly after: string | undefined;
  readonly before: string | undefined;
  /** Whether the client sent `page[size]`; links repeat it only when it did. */
  readonly sizeRequested: boolean;
  /** Both cursors present: a range pagination request. */
  readonly range: boolean;
}

export interface ParsedQuery<
  TSort extends string = string,
  TFilter extends string = string,
> {
  /**
   * Relationship paths as segment arrays, deduplicated; `undefined` when the
   * client sent no `include`, `[]` when it sent an empty one (which still
   * requires an `included` member in the response).
   */
  readonly include: ReadonlyArray<ReadonlyArray<string>> | undefined;
  /** `fields[type]` by type; an empty array means no fields. Absent types get all fields. */
  readonly fields: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly sort: ReadonlyArray<SortField<TSort>>;
  readonly filter: ParsedFilter<TFilter>;
  /** Present when the definition paginates; defaults apply without `page` parameters. */
  readonly page: PageRequest | undefined;
  /** The value of the definition's search parameter. */
  readonly search: string | undefined;
  /** Implementation-specific parameters by their full name, as sent. */
  readonly custom: Readonly<Record<string, ParameterValue>>;
  /** Every parameter the client sent, for links that must reproduce them. */
  readonly params: URLSearchParams;
}

/**
 * Accepted inputs: a query string (with or without `?`), `URLSearchParams`,
 * or the record Hono's `validator('query', ...)` and `c.req.queries()` give.
 */
export type QueryInput =
  | string
  | URLSearchParams
  | Readonly<Record<string, string | ReadonlyArray<string>>>;
