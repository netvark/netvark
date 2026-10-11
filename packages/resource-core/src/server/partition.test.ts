import type { Violation } from '../test-support/violations';
import type { ViolationNames } from './violation-names';

import { describe, expect, it } from 'vitest';

import { DRIVERS, Things, VIOLATIONS } from '../test-support/violations';
import { constraintError } from './constraint-error';
import { partitionViolation } from './partition';

type Raised =
  | 'notNull'
  | 'unique'
  | 'check'
  | 'exclusion'
  | 'foreignKey'
  | 'primaryKey';

/** A partition of `things` in another schema, as GitLab keeps its partitions. */
const PARTITION = { schema: 'archive', table: 'things_2026' } as const;
const ROOT = { schema: 'public', table: 'things' } as const;

/**
 * What PostgreSQL 14 and 18 report for each violation raised through the
 * partition: the partition as the table, and for an index-backed
 * constraint the partition's own index, which PostgreSQL names after the
 * partition. A CHECK and a foreign key keep the partitioned table's name.
 */
const RAISED: Readonly<Record<Raised, Violation>> = {
  notNull: { ...VIOLATIONS.notNull, ...PARTITION },
  unique: {
    ...VIOLATIONS.unique,
    ...PARTITION,
    constraint: 'things_2026_code_key',
  },
  check: { ...VIOLATIONS.check, ...PARTITION },
  exclusion: {
    ...VIOLATIONS.exclusion,
    ...PARTITION,
    constraint: 'things_2026_during_excl',
  },
  foreignKey: { ...VIOLATIONS.foreignKey, ...PARTITION },
  primaryKey: {
    ...VIOLATIONS.primaryKey,
    ...PARTITION,
    constraint: 'things_2026_pkey',
  },
};

/** What `partitionRoot` answers for each, and the code it then maps to. */
const RESOLVED: ReadonlyArray<readonly [Raised, ViolationNames, string]> = [
  ['notNull', ROOT, 'THINGS_NAME_NOT_NULL'],
  ['unique', { ...ROOT, constraint: 'things_code_key' }, 'THINGS_CODE_KEY'],
  ['check', { ...ROOT, constraint: 'things_qty_check' }, 'THINGS_QTY_CHECK'],
  [
    'exclusion',
    { ...ROOT, constraint: 'things_during_excl' },
    'THINGS_DURING_EXCL',
  ],
  [
    'foreignKey',
    { ...ROOT, constraint: 'things_owner_id_fkey' },
    'THINGS_OWNER_ID_FKEY',
  ],
  ['primaryKey', { ...ROOT, constraint: 'things_pkey' }, 'THINGS_PKEY'],
];

const CREATE = { resource: Things, operation: 'create' } as const;

describe.each(DRIVERS)('partitionViolation, %s', (_driver, errorOf) => {
  it.each(RESOLVED.map(([raised]) => raised))(
    'gives the names a %s violation of a partition carries',
    (raised) => {
      const { schema, table, constraint } = RAISED[raised];
      expect(partitionViolation(errorOf(RAISED[raised]), CREATE)).toEqual(
        constraint === undefined
          ? { schema, table }
          : { schema, table, constraint },
      );
    },
  );

  it.each([
    ["the resource's own table", VIOLATIONS.check],
    ['a domain CHECK, which names no table', VIOLATIONS.domainCheck],
    [
      'an error outside the integrity class',
      { ...RAISED.check, code: '40001' },
    ],
  ])('answers undefined for %s', (_name, violation) => {
    expect(partitionViolation(errorOf(violation), CREATE)).toBeUndefined();
  });

  it('answers undefined for a remove, whose violations are all CONFLICT', () => {
    expect(
      partitionViolation(errorOf(RAISED.foreignKey), {
        resource: Things,
        operation: 'remove',
      }),
    ).toBeUndefined();
  });
});

describe('partitionViolation: what it does not own', () => {
  it('answers undefined for an error that is not PostgreSQL', () => {
    expect(partitionViolation(new Error('boom'), CREATE)).toBeUndefined();
  });

  it('freezes the names', () => {
    const [, errorOf] = DRIVERS[0] ?? [];
    expect(
      Object.isFrozen(partitionViolation(errorOf?.(RAISED.check), CREATE)),
    ).toBe(true);
  });

  it('checks the options as constraintError does, under its own name', () => {
    expect(() =>
      Reflect.apply(partitionViolation, undefined, [
        new Error('x'),
        { resource: Things, operation: 'delete' },
      ]),
    ).toThrow(
      new TypeError(
        'partitionViolation: options.operation must be one of list, get, create, update, remove',
      ),
    );
  });
});

describe.each(DRIVERS)(
  'constraintError with a partition, %s',
  (_driver, errorOf) => {
    it.each(RESOLVED)(
      'maps a %s violation of a partition to the code of the partitioned table',
      (raised, partition, code) => {
        expect(
          constraintError(errorOf(RAISED[raised]), { ...CREATE, partition })
            ?.code,
        ).toBe(code);
      },
    );

    it('finds no code without the partition, since the violation names another table', () => {
      expect(constraintError(errorOf(RAISED.check), CREATE)).toBeUndefined();
    });

    it('finds no code when the partition belongs to another table', () => {
      expect(
        constraintError(errorOf(RAISED.check), {
          ...CREATE,
          partition: {
            schema: 'public',
            table: 'owners',
            constraint: 'things_qty_check',
          },
        }),
      ).toBeUndefined();
    });

    it('keeps a code only when its kind is the one the SQLSTATE reports', () => {
      expect(
        constraintError(errorOf(RAISED.unique), {
          ...CREATE,
          partition: { ...ROOT, constraint: 'things_qty_check' },
        }),
      ).toBeUndefined();
    });

    it('finds no code for a constraint the partitioned table does not have', () => {
      expect(
        constraintError(errorOf(RAISED.unique), {
          ...CREATE,
          partition: ROOT,
        }),
      ).toBeUndefined();
    });
  },
);
