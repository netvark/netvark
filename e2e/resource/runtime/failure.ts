/**
 * What a failed operation is to the client (resource SPEC 9.5 and 12.4):
 * a rule's `Rejection` becomes its code's error, and a PostgreSQL
 * integrity violation the declared code `constraintError` finds. A
 * violation a partition raised names the partition, so the adapter first
 * resolves the partitioned table's names for it, once the operation's
 * transaction has ended. Anything else stays as thrown, for the ban.
 */
import type { DeclaredResource } from '@netvark/resource-core';
import type { StorageAdapter } from '@netvark/resource-core/server';

import {
  constraintError,
  partitionViolation,
  Rejection,
  rejectionError,
} from '@netvark/resource-core/server';

import { APP_ERRORS } from './domain.ts';

/** The operations a failure can come from. */
export type FailedOperation = 'get' | 'create' | 'update' | 'remove';

/** The client's error for what `operation` on `resource` threw. */
export async function failure<TTransaction>(
  adapter: StorageAdapter<TTransaction>,
  error: unknown,
  resource: DeclaredResource,
  operation: FailedOperation,
): Promise<unknown> {
  if (error instanceof Rejection) {
    return rejectionError(error, { resource, errors: APP_ERRORS });
  }
  const options = { resource, operation };
  const raised = partitionViolation(error, options);
  const partition =
    raised === undefined ? undefined : await adapter.partitionRoot(raised);
  return constraintError(error, { ...options, partition }) ?? error;
}
