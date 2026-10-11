/**
 * The options of `constraintError` and `partitionViolation` (SPEC 9.5),
 * and their checks for JavaScript callers, whom no type holds to them.
 * @packageDocumentation
 */
import type {
  AnyDeclaredResource,
  DeclaredInternals,
} from '../declare/declared-resource';
import type { Operation } from '../declare/types';
import type { ViolationNames } from './violation-names';

import { OPERATIONS } from '../declare/check-options';
import { internalsOf } from '../declare/declared-resource';
import { isRecord } from '../internal/object';
import { pointerTokens } from './member-items';
import { isViolationNames } from './violation-names';

/** What `constraintError` needs to know about the operation. */
export interface ConstraintErrorOptions {
  /** The declared resource the operation runs on. */
  readonly resource: AnyDeclaredResource;
  readonly operation: Operation;
  /** The RFC 6901 pointer of the operation's resource object; default `/data`. */
  readonly pointer?: string | undefined;
  /**
   * For a violation a partition of the resource's table raised, its names
   * in the partitioned table, as `StorageAdapter.partitionRoot` answers
   * them, read in place of the table and constraint the violation names.
   */
  readonly partition?: ViolationNames | undefined;
}

/** The options, checked. */
export interface CheckedOptions {
  readonly internals: DeclaredInternals;
  readonly operation: Operation;
  /** The reference tokens of `pointer`. */
  readonly base: ReadonlyArray<string>;
  readonly partition: ViolationNames | undefined;
}

const DEFAULT_POINTER = '/data';

/** `options` as `caller` takes them; throws `TypeError` naming the first option that is wrong. */
export function checkOptions(caller: string, options: unknown): CheckedOptions {
  const value = isRecord(options) ? options : {};
  const internals = internalsOf(value['resource']);
  if (internals === undefined) {
    throw new TypeError(
      `${caller}: options.resource must be a resource declareResource returned`,
    );
  }
  const operation = OPERATIONS.find((known) => known === value['operation']);
  if (operation === undefined) {
    throw new TypeError(
      `${caller}: options.operation must be one of ${OPERATIONS.join(', ')}`,
    );
  }
  const pointer = value['pointer'] ?? DEFAULT_POINTER;
  const base = typeof pointer === 'string' ? pointerTokens(pointer) : undefined;
  if (base === undefined) {
    throw new TypeError(
      `${caller}: options.pointer must be an RFC 6901 JSON Pointer`,
    );
  }
  const partition = value['partition'];
  if (partition !== undefined && !isViolationNames(partition)) {
    throw new TypeError(
      `${caller}: options.partition must be what StorageAdapter.partitionRoot answers: { schema, table, constraint? }, each a string`,
    );
  }
  return { internals, operation, base, partition };
}
