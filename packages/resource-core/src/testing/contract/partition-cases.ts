/**
 * The cases of obligation 11 (SPEC 12.8): a violation raised through a
 * partitioned table names the partition, and `partitionRoot` answers with
 * the partitioned table's names for it, which `constraintError` maps to
 * the declared code. `logs` keeps ids below 1000 in `logs_low` and the
 * rest in `contract_archive.logs_high_rest`, two levels down and in
 * another schema, so each violation is raised in both.
 * @ref https://www.postgresql.org/docs/18/ddl-partitioning.html
 * @packageDocumentation
 */
import type { StorageWrite } from '../../server/storage';
import type { ViolationNames } from '../../server/violation-names';
import type { Contract } from './context';
import type { ContractCase } from './types';

import { constraintError } from '../../server/constraint-error';
import { partitionViolation } from '../../server/partition';
import { assertEqual, ContractFailure, rejection } from './assert';

/** The partitioned table, as `partitionRoot` names it. */
const LOGS = { schema: 'public', table: 'logs' } as const;
/** An id in each partition, and the partition that stores it. */
const PARTITIONS = [
  { id: '7', schema: 'public', table: 'logs_low' },
  { id: '1007', schema: 'contract_archive', table: 'logs_high_rest' },
] as const;
/** A workspace id no row has. */
const NO_WORKSPACE = '404';

/** A violation the case raises: the write after a first log with the same id, and what it resolves to. */
interface Raised {
  readonly what: string;
  readonly write: (id: string) => StorageWrite;
  readonly constraint: string | undefined;
  readonly code: string;
}

const RAISED: ReadonlyArray<Raised> = [
  {
    what: 'a second log with the id',
    write: (id) => ({
      id,
      attributes: { note: 'Again' },
      relationships: { owner: '1' },
    }),
    constraint: 'logs_pkey',
    code: 'LOGS_PKEY',
  },
  {
    what: 'an empty note',
    write: (id) => ({
      id: `${id}1`,
      attributes: { note: '' },
      relationships: { owner: '1' },
    }),
    constraint: 'logs_note_check',
    code: 'LOGS_NOTE_CHECK',
  },
  {
    what: 'no note',
    write: (id) => ({
      id: `${id}2`,
      attributes: {},
      relationships: { owner: '1' },
    }),
    constraint: undefined,
    code: 'LOGS_NOTE_NOT_NULL',
  },
  {
    what: 'an owner no workspace is',
    write: (id) => ({
      id: `${id}3`,
      attributes: { note: 'Lost' },
      relationships: { owner: NO_WORKSPACE },
    }),
    constraint: 'logs_owner_id_fkey',
    code: 'LOGS_OWNER_ID_FKEY',
  },
];

/** The answer as plain keys, so a `null` an adapter passed on stays visible. */
function plain(names: ViolationNames | undefined): unknown {
  return names === undefined
    ? undefined
    : {
        schema: names.schema,
        table: names.table,
        constraint: names.constraint,
      };
}

/** The cases of obligation 11. */
export function partitionCases<TTransaction>(
  contract: Contract<TTransaction>,
): ReadonlyArray<ContractCase> {
  const { harness, logs, within } = contract;
  const { adapter } = harness;
  const create = async (write: StorageWrite) =>
    within('1', async (tx) => adapter.create(tx, logs, write));
  const options = { resource: logs, operation: 'create' } as const;
  return [
    {
      name: 'obligation 11: partitionRoot names the partitioned table and its constraint for what a partition raised',
      run: async () => {
        for (const partition of PARTITIONS) {
          await create({
            id: partition.id,
            attributes: { note: 'First' },
            relationships: { owner: '1' },
          });
          for (const raised of RAISED) {
            const what = `${raised.what} in ${partition.table}`;
            const thrown = await rejection(
              create(raised.write(partition.id)),
              what,
            );
            const names = partitionViolation(thrown, options);
            if (names === undefined) {
              throw new ContractFailure(
                `${what}: expected an integrity violation that names a partition`,
                { cause: thrown },
              );
            }
            assertEqual(
              { schema: names.schema, table: names.table },
              { schema: partition.schema, table: partition.table },
              `the table ${what} names`,
            );
            const root = await adapter.partitionRoot(names);
            assertEqual(
              plain(root),
              { ...LOGS, constraint: raised.constraint },
              `partitionRoot for ${what}`,
            );
            assertEqual(
              constraintError(thrown, { ...options, partition: root })?.code,
              raised.code,
              `the code of ${what}`,
            );
          }
        }
      },
    },
    {
      name: 'obligation 11: partitionRoot answers undefined for a table that is not a partition',
      run: async () => {
        const tables: ReadonlyArray<ViolationNames> = [
          { schema: 'public', table: 'tasks', constraint: 'tasks_pkey' },
          { ...LOGS, constraint: 'logs_pkey' },
          { schema: 'public', table: 'no_such_table' },
        ];
        for (const names of tables) {
          assertEqual(
            plain(await adapter.partitionRoot(names)),
            undefined,
            `partitionRoot for ${names.table}`,
          );
        }
      },
    },
  ];
}
