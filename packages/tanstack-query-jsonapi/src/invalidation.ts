/**
 * The invalidation a write's `onSuccess` returns (SPEC 16.4, 17.4): the
 * keys a write's settings add, checked when the options are made, and
 * the invalidation of every key together through the `QueryClient`
 * TanStack Query hands the callback. The mutation awaits it, so it stays
 * pending until the reads those keys reach have refetched.
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
 * @packageDocumentation
 */
import type { QueryClient, QueryKey } from '@tanstack/query-core';

import type { WriteSettings } from './query-types';

/** Whether `value` is a list of query keys, each an array. */
function isKeyList(value: unknown): value is ReadonlyArray<QueryKey> {
  return (
    Array.isArray(value) && value.every((key: unknown) => Array.isArray(key))
  );
}

/**
 * The keys `settings.invalidates` names, none without it. Throws
 * `TypeError`, naming `caller`, for anything but a list of query keys,
 * such as one key passed alone.
 */
export function settingsKeys(
  caller: string,
  settings: WriteSettings | undefined,
): ReadonlyArray<QueryKey> {
  const keys: unknown = settings?.invalidates;
  if (keys === undefined) {
    return [];
  }
  if (!isKeyList(keys)) {
    throw new TypeError(`${caller}: invalidates must be a list of query keys`);
  }
  return keys;
}

/** Invalidates `keys` together, settling once every read they reach has refetched. */
export async function invalidate(
  queryClient: QueryClient,
  keys: ReadonlyArray<QueryKey>,
): Promise<void> {
  await Promise.all(
    keys.map(async (queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}
