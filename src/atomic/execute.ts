/**
 * Execution of one operation (SPEC 11.4): classify it by `op` and target
 * and hand it to the runner for resources or relationships. Every error
 * carries a pointer into the operation; the transaction wrapper rolls back
 * on the first.
 * @ref https://jsonapi.org/ext/atomic/#processing
 * @ref https://jsonapi.org/ext/atomic/#specific-operations
 * @packageDocumentation
 */
import type { Env } from 'hono';

import type { Execution, OperationResult } from './execute-support';
import type { RawOperation } from './parse-document';
import type { OperationCode } from './types';

import { relationship } from './execute-relationship';
import { create, remove, update } from './execute-resource';

export type { Execution, OperationResult } from './execute-support';

type Runner = <TTransaction, E extends Env>(
  execution: Execution<TTransaction, E>,
  operation: RawOperation,
) => Promise<OperationResult>;

const RUNNERS: Readonly<Record<OperationCode, Runner>> = {
  add: create,
  update,
  remove,
};

/** Runs one operation and returns its result object. */
export async function executeOperation<TTransaction, E extends Env>(
  execution: Execution<TTransaction, E>,
  operation: RawOperation,
): Promise<OperationResult> {
  const { target } = operation;
  if (target?.relationship !== undefined) {
    return relationship(execution, operation, target, target.relationship);
  }
  return RUNNERS[operation.op](execution, operation);
}
