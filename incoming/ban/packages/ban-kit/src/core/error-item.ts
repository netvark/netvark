/**
 * Error items (SPEC 4.2): the list an error carries under `errors`.
 * `ban.validation()` fills it with one item per validator issue; a library
 * that reports several problems in one response (a JSON:API error document
 * with one object per problem, for example) builds items with their own
 * status, code, and title. Each format renders the list in its own way
 * (SPEC 7).
 * @packageDocumentation
 */
import type { IssueLocation, ValidationIssue } from '../validation/issue';
import type { ErrorStatusCode } from './status';

export interface ErrorItem {
  /**
   * Per-item identity, for responses that combine several catalog entries.
   * The JSON:API format renders `status`, `code`, and `title` when its
   * `mixedEntries` option is on; every other format carries one status and
   * code per response and ignores them (SPEC 7). Each falls back to the
   * error's own value.
   */
  readonly status?: ErrorStatusCode | undefined;
  readonly code?: string | undefined;
  readonly title?: string | undefined;
  /** URI reference for this item's type link, when it differs from the error's. */
  readonly type?: string | undefined;
  /** What went wrong, for the client. */
  readonly detail: string;
  /** The part of the request the item points into. */
  readonly location?: IssueLocation | undefined;
  /**
   * Where inside that part: RFC 6901 pointer segments for `body` and `form`
   * (and when `location` is absent), a name for the other locations.
   */
  readonly path?: ReadonlyArray<string | number> | undefined;
  /** The validator's own code (`invalid_type`), never a catalog code. */
  readonly reason?: string | undefined;
  readonly expected?: string | undefined;
  readonly received?: string | undefined;
  /** Rendered as the JSON:API error object's `meta`; ignored elsewhere. */
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
}

/** One item per validator issue, at the location the validator ran on (SPEC 8.2). */
export function itemFromIssue(
  issue: ValidationIssue,
  location: IssueLocation,
): ErrorItem {
  return {
    detail: issue.message,
    location,
    path: issue.path,
    ...(issue.code === undefined ? {} : { reason: issue.code }),
    ...(issue.expected === undefined ? {} : { expected: issue.expected }),
    ...(issue.received === undefined ? {} : { received: issue.received }),
  };
}

export function itemsFromIssues(
  issues: ReadonlyArray<ValidationIssue>,
  location: IssueLocation,
): Array<ErrorItem> {
  return issues.map((issue) => itemFromIssue(issue, location));
}
