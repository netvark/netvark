/**
 * What an integrity violation names (SPEC 9.5): a table by schema and
 * name, and the constraint, when it names one. A partition's violation
 * names the partition, and `StorageAdapter.partitionRoot` answers with the
 * same shape in the partitioned table.
 * @packageDocumentation
 */
import { isRecord } from '../internal/object';

/** A table by schema and name, and its constraint or unique index when there is one. */
export interface ViolationNames {
  readonly schema: string;
  readonly table: string;
  readonly constraint?: string | undefined;
}

/** Whether `value` holds a string `schema` and `table`, and a `constraint` that is a string or absent. */
export function isViolationNames(value: unknown): value is ViolationNames {
  return (
    isRecord(value) &&
    typeof value['schema'] === 'string' &&
    typeof value['table'] === 'string' &&
    (value['constraint'] === undefined ||
      typeof value['constraint'] === 'string')
  );
}
