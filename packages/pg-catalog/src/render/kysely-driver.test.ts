/**
 * The Kysely type table (SPEC 9.2) held against node-postgres on a server:
 * a value of every insert alternative of every column of the types schema
 * goes in through the driver, and what comes back must have the column's
 * select type. The values the table keeps out of insert types are shown to
 * fail. Runs when `CATALOG_PG_URL` is set; CI runs it on PostgreSQL 14 and
 * 18.
 */
import type { Catalog, CatalogColumn } from '@netvark/catalog-core';

import type { SqlSession } from '../target/session';
import type { OracleContext } from '../test-support/driver-oracle';
import type { MappingContext } from './kysely-mapping';

import { inspect } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readCatalog } from '../extract/read-catalog';
import { replay } from '../replay';
import { openThrowawayDatabase } from '../target/server';
import { samples, satisfies } from '../test-support/driver-oracle';
import { typesMigrations } from '../test-support/types-schema';
import { mapType } from './kysely-mapping';
import { pascalCase } from './kysely-names';

const url = process.env['CATALOG_PG_URL'];
const INVALID_TEXT = '22P02';
const NOT_NULL = '23502';
const GENERATED_ALWAYS = '428C9';
/** The NOT NULL columns without a default, with a value each. */
const REQUIRED: ReadonlyArray<readonly [string, string]> = [
  ['regular', '1'],
  ['required', "'r'"],
];

function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** An insert of `$1` into `column` that fills the required columns and returns the stored value. */
function insertSql(column: string): string {
  const fixed = REQUIRED.filter(([name]) => name !== column);
  const names = [...fixed.map(([name]) => name), quote(column)].join(', ');
  const values = [...fixed.map(([, value]) => value), '$1'].join(', ');
  return `insert into kinds (${names}) values (${values}) returning ${quote(column)} as value`;
}

function columnsOf(catalog: Catalog): ReadonlyMap<string, CatalogColumn> {
  const kinds = catalog.tables['kinds'];
  if (kinds === undefined) {
    throw new Error('the types schema has no kinds table');
  }
  return new Map(Object.entries(kinds.columns));
}

describe.skipIf(url === undefined)(
  'the Kysely type table against node-postgres (SPEC 9.2)',
  () => {
    let session: SqlSession;
    let columns: ReadonlyMap<string, CatalogColumn>;
    let mapping: MappingContext;
    let oracle: OracleContext;

    beforeAll(async () => {
      session = await openThrowawayDatabase(url ?? '');
      await replay(session, typesMigrations);
      const catalog = await readCatalog(session, ['public']);
      const [interval] = await session.query<{ value: unknown }>(
        "select '1 day 02:00:00'::interval as value",
      );
      columns = columnsOf(catalog);
      const enums = Object.entries(catalog.enums);
      mapping = {
        catalog,
        enumNames: new Map(enums.map(([key]) => [key, pascalCase(key)])),
        overrides: new Map(),
      };
      oracle = {
        labels: new Map(
          enums.map(([key, labels]) => [pascalCase(key), labels]),
        ),
        interval: interval?.value,
      };
    });

    afterAll(async () => {
      await session.close();
    });

    /** What went wrong sending `value` into `column`, if anything. */
    async function probe(
      column: string,
      value: unknown,
      select: string,
    ): Promise<ReadonlyArray<string>> {
      let returned: unknown;
      try {
        const [row] = await session.query<{ value: unknown }>(
          insertSql(column),
          [value],
        );
        returned = row?.value;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return [`${column} rejected ${inspect(value)}: ${reason}`];
      }
      return satisfies(returned, select, oracle)
        ? []
        : [`${column} returned ${inspect(returned)}, not ${select}`];
    }

    it('accepts a value of every insert alternative and returns a value of the select type', async () => {
      const failures: Array<string> = [];
      const probed = new Set<string>();
      for (const [name, column] of columns) {
        const types = mapType(column, mapping);
        expect(types.update, name).toEqual(types.insert);
        if (column.identity === 'always' || column.generated !== null) {
          continue;
        }
        for (const value of samples(types.insert.text, column, oracle)) {
          probed.add(name);
          failures.push(...(await probe(name, value, types.select.text)));
        }
      }
      expect(failures).toEqual([]);
      // The two GeneratedAlways columns, the empty enum, and the domain from an unread schema.
      expect([...columns.keys()].filter((name) => !probed.has(name))).toEqual([
        'id',
        'nothing',
        'outside_score',
        'doubled',
      ]);
    });

    it('fills the defaults and generated columns on insert, with values of their select types', async () => {
      const [row = {}] = await session.query<Record<string, unknown>>(
        "insert into kinds (regular, required) values (1, 'r') returning *",
      );
      const filled = Object.entries(row).filter(([, value]) => value !== null);
      expect(filled.map(([name]) => name)).toEqual([
        'id',
        'regular',
        'required',
        'defaulted',
        'by_default',
        'doubled',
        'with_default',
      ]);
      const failures = filled.flatMap(([name, value]) => {
        const column = columns.get(name);
        const select =
          column === undefined ? 'never' : mapType(column, mapping).select.text;
        return satisfies(value, select, oracle)
          ? []
          : [`${name}: ${inspect(value)}`];
      });
      expect(failures).toEqual([]);
    });

    it.each([
      ['spot', { x: 1, y: 2 }],
      ['ring', { x: 1, y: 2, radius: 3 }],
      ['spots', [{ x: 1, y: 2 }]],
      ['doc', 'plain'],
      ['docb', [1, 2]],
      ['docbs', ['plain']],
    ])(
      'rejects %s = %j, a value of its select type, so its insert type is text',
      async (column, value) => {
        await expect(
          session.query(insertSql(column), [value]),
        ).rejects.toMatchObject({ code: INVALID_TEXT });
      },
    );

    it.each(['id', 'doubled'])(
      'refuses a value for %s, so it is GeneratedAlways',
      async (column) => {
        await expect(
          session.query(insertSql(column), ['1']),
        ).rejects.toMatchObject({ code: GENERATED_ALWAYS });
      },
    );

    it('refuses null for required, whose domain is NOT NULL, yet reads null from it', async () => {
      expect(columns.get('required')?.nullable).toBe(true);
      await expect(
        session.query(insertSql('required'), [null]),
      ).rejects.toMatchObject({ code: NOT_NULL });
      // The empty scalar sub-select of the CREATE DOMAIN notes stores a null unchecked.
      const [row] = await session.query<{ value: unknown }>(
        insertSql('required').replace(
          '$1',
          '(select required from kinds where false)',
        ),
      );
      expect(row).toEqual({ value: null });
    });
  },
);
