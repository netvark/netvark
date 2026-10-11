import type { ColumnType } from './column-type';
import type { KyselyStorage } from './types';

import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { contractDatabase, storageOptions } from '../test-support/database';
import { createKyselyStorage } from './create-storage';
import { NO_READ_FORM, readForm } from './read-form';

const database = contractDatabase();
let storage: KyselyStorage;

beforeAll(() => {
  storage = createKyselyStorage(storageOptions(database.db));
});
afterAll(async () => {
  await database.close();
});

/** The text PostgreSQL prints for `literal` cast to `type`, under the transaction's settings. */
async function printed(literal: string, type: string): Promise<string> {
  const [row] = await storage.transaction([], async (tx) =>
    tx.execute((db) =>
      sql<{
        text: string;
      }>`select (${sql.raw(literal)})::${sql.raw(type)}::text as "text"`.compile(
        db,
      ),
    ),
  );
  if (row === undefined) {
    throw new Error('no row');
  }
  return row.text;
}

const scalar = (base: string): ColumnType => ({
  base,
  enum: false,
  array: false,
});
const array = (base: string): ColumnType => ({
  base,
  enum: false,
  array: true,
});

describe('readForm (SPEC 18.2)', () => {
  it.each([
    ['int2', "'-32768'", scalar('int2'), -32_768],
    ['int4', "'2147483647'", scalar('int4'), 2_147_483_647],
    ['int8', "'9007199254740993'", scalar('int8'), '9007199254740993'],
    ['numeric(6,2)', "'1.5'", scalar('numeric'), '1.50'],
    ['numeric', "'-0.000001'", scalar('numeric'), '-0.000001'],
    ['float4', "'0.1'", scalar('float4'), 0.1],
    ['float8', "'0.1'", scalar('float8'), 0.1],
    ['float8', "'1e300'", scalar('float8'), 1e300],
    ['bool', 'true', scalar('bool'), true],
    ['bool', 'false', scalar('bool'), false],
    ['date', "'2026-10-10'", scalar('date'), '2026-10-10'],
    [
      'timestamp',
      "'2026-10-10 12:30:00.123456'",
      scalar('timestamp'),
      '2026-10-10T12:30:00.123456',
    ],
    [
      'timestamp(0)',
      "'2026-10-10 12:30:00.6'",
      scalar('timestamp'),
      '2026-10-10T12:30:01',
    ],
    [
      'timestamptz',
      "'2026-10-10 12:30:00.5+02'",
      scalar('timestamptz'),
      '2026-10-10T10:30:00.5Z',
    ],
    [
      'jsonb',
      `'{"b": 1, "a": [true, null]}'`,
      scalar('jsonb'),
      { a: [true, null], b: 1 },
    ],
    ['json', `'{"b": 1, "a": 2}'`, scalar('json'), { b: 1, a: 2 }],
    ['text', "'  spaced  '", scalar('text'), '  spaced  '],
    [
      'uuid',
      "'0F8FAD5B-D9CB-469F-A165-70867728950E'",
      scalar('uuid'),
      '0f8fad5b-d9cb-469f-a165-70867728950e',
    ],
    [
      'task_priority',
      "'high'",
      { base: 'task_priority', enum: true, array: false },
      'high',
    ],
    [
      'text[]',
      `array['a', 'a b', 'quote"d', 'back\\slash', 'NULL', '', '{}', 'ü']`,
      array('text'),
      ['a', 'a b', 'quote"d', 'back\\slash', 'NULL', '', '{}', 'ü'],
    ],
    ['int4[]', "'{1,-2,3}'", array('int4'), [1, -2, 3]],
    ['bool[]', "'{true,false}'", array('bool'), [true, false]],
    [
      'timestamptz[]',
      "array['2026-10-10 00:00:00+00']",
      array('timestamptz'),
      ['2026-10-10T00:00:00Z'],
    ],
    ['text[]', "'{}'", array('text'), []],
  ])('reads %s %s', async (type, literal, columnType, expected) => {
    expect(readForm(await printed(literal, type), columnType)).toEqual(
      expected,
    );
  });

  it.each([
    ['numeric', "'NaN'", scalar('numeric')],
    ['numeric', "'Infinity'", scalar('numeric')],
    ['float8', "'-Infinity'", scalar('float8')],
    ['float4', "'NaN'", scalar('float4')],
    ['date', "'infinity'", scalar('date')],
    ['date', "'0044-03-15 BC'", scalar('date')],
    ['date', "'10000-01-01'", scalar('date')],
    ['timestamp', "'-infinity'", scalar('timestamp')],
    ['timestamptz', "'infinity'", scalar('timestamptz')],
    ['timestamptz', "'0044-03-15 12:00:00+00 BC'", scalar('timestamptz')],
    ['jsonb', "'null'", scalar('jsonb')],
    ['text[]', "array['a', null]", array('text')],
    ['int4[]', "'{{1,2},{3,4}}'", array('int4')],
    ['int4[]', "'[0:1]={1,2}'", array('int4')],
    ['date[]', "array['infinity'::date]", array('date')],
  ])('finds no read form for %s %s', async (type, literal, columnType) => {
    expect(readForm(await printed(literal, type), columnType)).toBe(
      NO_READ_FORM,
    );
  });

  it('finds no read form for a text its type never prints', () => {
    expect(readForm('yes', scalar('bool'))).toBe(NO_READ_FORM);
    expect(readForm('{t,yes}', array('bool'))).toBe(NO_READ_FORM);
  });
});
