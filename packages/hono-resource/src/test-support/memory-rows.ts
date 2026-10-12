/**
 * The rows of the runtime held in memory (`memory-runtime.ts`): new rows,
 * the members an input writes, the target lookup a runtime runs (SPEC
 * 12.3), pages, and includes, each settling after a turn of the
 * microtask queue as a storage round trip does. Not published with the
 * package.
 */
import type { DeclaredResource } from '@netvark/resource-core';
import type {
  PublicRow,
  ResourceInput,
  StoragePage,
} from '@netvark/resource-core/server';

import { jsonApiError } from '@netvark/hono-jsonapi';

const PAGE_SIZE = 10;

/** The error of a row the actor does not see, as a runtime answers it. */
export function notFound(): Error {
  return jsonApiError('NOT_FOUND', { detail: 'The resource does not exist' });
}

/** Throws NOT_FOUND at the first relationship of `input` that links a row `rows` does not hold. */
export function checkTargets(
  rows: ReadonlyMap<string, ReadonlyMap<string, PublicRow>>,
  input: ResourceInput,
): void {
  for (const [name, linkage] of Object.entries(input.relationships ?? {})) {
    const missing =
      typeof linkage === 'object' &&
      linkage !== null &&
      'type' in linkage &&
      'id' in linkage &&
      rows.get(String(linkage.type))?.has(String(linkage.id)) !== true;
    if (missing) {
      throw jsonApiError([
        {
          code: 'NOT_FOUND',
          status: 404,
          detail: 'The related resource does not exist',
          path: ['data', 'relationships', name],
        },
      ]);
    }
  }
}

/** The members `input` writes, each relationship as its target's id. */
export function membersOf(input: ResourceInput): Record<string, unknown> {
  const relationships = Object.entries(input.relationships ?? {}).map(
    ([name, linkage]) =>
      [
        name,
        typeof linkage === 'object' && linkage !== null && 'id' in linkage
          ? linkage.id
          : null,
      ] as const,
  );
  return { ...input.attributes, ...Object.fromEntries(relationships) };
}

/** A new row of `declared`: every member `null` but those `input` writes. */
export function newRow(
  declared: DeclaredResource,
  id: string,
  input: ResourceInput,
): Record<string, unknown> {
  const { attributes, relationships } = declared.resource;
  const members = [...attributes, ...Object.keys(relationships)];
  return {
    ...Object.fromEntries(members.map((name) => [name, null])),
    ...membersOf(input),
    id,
  };
}

/**
 * `work`'s result once a turn of the microtask queue has passed, as a
 * storage round trip settles: a route that did not await an operation
 * would hold a pending promise.
 */
export async function roundTrip<TResult>(
  work: () => TResult,
): Promise<TResult> {
  await Promise.resolve();
  return work();
}

/** A page of every row in `rows`. */
export function pageOf(rows: Array<PublicRow>): StoragePage {
  return {
    rows,
    cursors: rows.map((row) => row.id),
    next: null,
    prev: null,
    hasNext: false,
    hasPrev: false,
    size: PAGE_SIZE,
    cursor: (row: PublicRow) => row.id,
  };
}

/** The rows `rows` link to over `relationship` in `targets`, each once. */
export function linkedRows(
  rows: ReadonlyArray<PublicRow>,
  relationship: string,
  targets: ReadonlyMap<string, PublicRow> | undefined,
): Array<PublicRow> {
  const ids = new Set(
    rows.flatMap((row) => {
      const id = row[relationship];
      return typeof id === 'string' ? [id] : [];
    }),
  );
  return [...ids].flatMap((id) => {
    const target = targets?.get(id);
    return target === undefined ? [] : [target];
  });
}
