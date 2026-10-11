import type { ColumnType } from './column-type';
import type { KyselyStorage } from './types';

import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { contractDatabase, storageOptions } from '../test-support/database';
import { arrayElements } from './array-literal';
import { createKyselyStorage } from './create-storage';
import { parameterText } from './parameter-text';

const database = contractDatabase();
let storage: KyselyStorage;

beforeAll(() => {
  storage = createKyselyStorage(storageOptions(database.db));
});
afterAll(async () => {
  await database.close();
});

/** What PostgreSQL reads `text` as, cast to `type` and printed back. */
async function roundTrip(text: string, type: string): Promise<string> {
  const [row] = await storage.transaction([], async (tx) =>
    tx.execute((db) =>
      sql<{
        text: string;
      }>`select ${text}::text::${sql.raw(type)}::text as "text"`.compile(db),
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
const TAGS = [
  'a',
  'a b',
  'quote"d',
  'back\\slash',
  'comma,',
  '{brace}',
  'NULL',
  '',
  'ü ✓',
];

describe('parameterText (SPEC 18.2)', () => {
  it('writes a string as it is, a number with String, and a boolean as a word', () => {
    expect(parameterText('it is', scalar('text'))).toBe('it is');
    expect(parameterText(-7, scalar('int4'))).toBe('-7');
    expect(parameterText(0.1, scalar('float8'))).toBe('0.1');
    expect(parameterText(true, scalar('bool'))).toBe('true');
    expect(parameterText(9007199254740993n, scalar('int8'))).toBe(
      '9007199254740993',
    );
  });

  it('writes a json value as JSON text, an array included', () => {
    expect(parameterText({ a: [1, null] }, scalar('jsonb'))).toBe(
      '{"a":[1,null]}',
    );
    expect(
      parameterText([1, 'x'], { base: 'json', enum: false, array: false }),
    ).toBe('[1,"x"]');
  });

  it('writes an array literal PostgreSQL reads back element for element', async () => {
    const text = parameterText(TAGS, array('text'));
    expect(arrayElements(await roundTrip(text, 'text[]'))).toEqual(TAGS);
    expect(
      await roundTrip(parameterText([1, -2], array('int4')), 'int4[]'),
    ).toBe('{1,-2}');
    expect(
      await roundTrip(parameterText([true, false], array('bool')), 'bool[]'),
    ).toBe('{t,f}');
    expect(await roundTrip(parameterText([], array('text')), 'text[]')).toBe(
      '{}',
    );
  });

  it('refuses a value no write form holds', () => {
    expect(() => parameterText({ x: 1 }, scalar('text'))).toThrow(
      new TypeError('no parameter text for a value of type object'),
    );
    expect(() => parameterText(undefined, scalar('text'))).toThrow(TypeError);
    expect(() => parameterText(['x', null], array('text'))).toThrow(
      new TypeError('no parameter text for a value of type object'),
    );
  });
});
