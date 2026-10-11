/**
 * A create's or an update's input as the runtime takes it (resource SPEC
 * 12.3, 12.8): the declaration's `write` schema validates what
 * `@netvark/jsonapi-core` parsed from the request document, and the
 * members it accepted become the storage write, each relationship as its
 * target's id. A refusal is `VALIDATION_FAILED` with an item per issue, at
 * the issue's place in the document.
 */
import type { BanError } from '@netvark/ban-core';
import type { ResourceIssue } from '@netvark/resource-core';
import type {
  ResourceBehavior,
  StorageWrite,
} from '@netvark/resource-core/server';

import type { AppDomain } from './domain.ts';

import { createBan } from '@netvark/ban-core';
import { ERROR_CATALOG } from '@netvark/jsonapi-core';

/** Any resource's behavior in the domain. */
export type Behavior = ResourceBehavior<AppDomain>;

/** A create or an update as `@netvark/jsonapi-core` parses a resource object: each relationship as its `data`. */
export interface ResourceInput {
  readonly id?: string | undefined;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly relationships: Readonly<Record<string, unknown>>;
}

const ban = createBan({ errors: ERROR_CATALOG });

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(issues: ReadonlyArray<ResourceIssue>): BanError {
  return ban.error('VALIDATION_FAILED', {
    errors: issues.map((issue) => ({
      detail: issue.message,
      path: ['data', ...issue.path],
      reason: issue.code,
    })),
  });
}

/** A relationship's parsed `data` as its target's id, or `null`. */
function targetId(linkage: unknown): string | null {
  const id = isRecord(linkage) ? linkage['id'] : null;
  if (typeof id !== 'string' && id !== null) {
    throw new TypeError('a validated relationship has no id');
  }
  return id;
}

/** The members a validated write carried, relationships as target ids (SPEC 12.8). */
function storageWrite(value: unknown, id: string | undefined): StorageWrite {
  const attributes = isRecord(value) ? value['attributes'] : undefined;
  const relationships = isRecord(value) ? value['relationships'] : undefined;
  if (!isRecord(attributes) || !isRecord(relationships)) {
    throw new TypeError('a validated write has no attributes or relationships');
  }
  return {
    ...(id === undefined ? {} : { id }),
    attributes,
    relationships: Object.fromEntries(
      Object.entries(relationships).map(([name, linkage]) => [
        name,
        targetId(linkage),
      ]),
    ),
  };
}

/** The input as the declaration parses it; `VALIDATION_FAILED` with an item per issue otherwise. */
export function parsed(
  behavior: Behavior,
  write: 'create' | 'update',
  input: ResourceInput,
): StorageWrite {
  const result = behavior.resource.write[write]['~standard'].validate({
    attributes: input.attributes,
    relationships: input.relationships,
  });
  if (result.issues !== undefined) {
    throw invalid(result.issues);
  }
  return storageWrite(result.value, write === 'create' ? input.id : undefined);
}
