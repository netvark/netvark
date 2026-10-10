import type { ErrorItem } from '../core/error-item';
import type { IssueLocation } from '../validation/issue';
import type { JsonSchema } from './context';

import {
  isPointerLocation,
  nameFromPath,
  pointerFromPath,
} from '../validation/issue';

/** One rendered item, shared by the Problem Details and plain formats (SPEC 7.1.3). */
export interface ErrorEntry {
  readonly location?: IssueLocation;
  /** RFC 6901 pointer for `body` and `form`, and for items without a location. */
  readonly pointer?: string;
  /** First path segment for `query`, `param`, `header`, `cookie`. */
  readonly name?: string;
  readonly detail: string;
  /** The item's `reason`: the validator's own code. */
  readonly code?: string;
  readonly expected?: string;
  readonly received?: string;
}

const LOCATIONS: ReadonlySet<string> = new Set<IssueLocation>([
  'body',
  'form',
  'query',
  'param',
  'header',
  'cookie',
]);

function isIssueLocation(value: unknown): value is IssueLocation {
  return typeof value === 'string' && LOCATIONS.has(value);
}

/**
 * The location `ban.validation()` records in `meta.location` (SPEC 8.2);
 * `undefined` when the error carries none.
 */
export function readLocation(
  meta: Readonly<Record<string, unknown>>,
): IssueLocation | undefined {
  const value = meta['location'];
  return isIssueLocation(value) ? value : undefined;
}

function address(
  path: ReadonlyArray<string | number> | undefined,
  location: IssueLocation | undefined,
): Pick<ErrorEntry, 'pointer' | 'name'> {
  if (path === undefined) {
    return {};
  }
  return location === undefined || isPointerLocation(location)
    ? { pointer: pointerFromPath(path) }
    : { name: nameFromPath(path) };
}

/**
 * Entries for a list of items. An item without a location takes `fallback`,
 * the location of the error as a whole.
 */
export function toErrorEntries(
  errors: ReadonlyArray<ErrorItem>,
  fallback?: IssueLocation,
): Array<ErrorEntry> {
  return errors.map((item): ErrorEntry => {
    const location = item.location ?? fallback;
    return {
      ...(location === undefined ? {} : { location }),
      ...address(item.path, location),
      detail: item.detail,
      ...(item.reason === undefined ? {} : { code: item.reason }),
      ...(item.expected === undefined ? {} : { expected: item.expected }),
      ...(item.received === undefined ? {} : { received: item.received }),
    };
  });
}

const ERROR_ENTRY_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['detail'],
  properties: {
    location: { type: 'string', enum: [...LOCATIONS] },
    pointer: { type: 'string' },
    name: { type: 'string' },
    detail: { type: 'string' },
    code: { type: 'string' },
    expected: { type: 'string' },
    received: { type: 'string' },
  },
  additionalProperties: false,
};

export const ERROR_ENTRIES_SCHEMA: JsonSchema = {
  type: 'array',
  items: ERROR_ENTRY_SCHEMA,
};
