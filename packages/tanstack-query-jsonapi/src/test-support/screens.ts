/**
 * What the write tests read a screen through: the requests sent, the
 * titles a list shows, and a screen showing a read, an observer subscribed
 * as a mounted `useQuery` is, once its first fetch has succeeded. Never
 * published.
 * @packageDocumentation
 */
import type {
  QueryClient,
  QueryObserverOptions,
  QueryObserverResult,
} from '@tanstack/query-core';

import type { Arrival } from './fetch-double';

import { QueryObserver } from '@tanstack/query-core';
import { expect, vi } from 'vitest';

/** Each request as its method and target. */
export function sent(arrivals: ReadonlyArray<Arrival>): Array<string> {
  return arrivals.map(({ method, target }) => `${method} ${target}`);
}

/** The titles of the records a list result holds. */
export function titles(result: QueryObserverResult<any>): Array<string> {
  return result.data.data.map(({ title }: { title: string }) => title);
}

/** A screen showing what `options` reads: an observer subscribed, as a mounted `useQuery` is. */
export async function showing(
  queryClient: QueryClient,
  options: QueryObserverOptions<any, any, any, any, any>,
): Promise<QueryObserver<any, any, any, any, any>> {
  const observer = new QueryObserver(queryClient, options);
  observer.subscribe(() => {});
  await vi.waitFor(() => {
    expect(observer.getCurrentResult().isSuccess).toBe(true);
  });
  return observer;
}
