/**
 * The seek starts an index scan at the cursor (keyset SPEC 6.2, ADR 0016).
 * On a PostgreSQL server with 10 000 rows and an index on the sort and the
 * key, the page after or before a cursor halfway down the list is an index
 * scan whose index condition bounds the first sort key, so it reads about
 * one page of entries instead of the 5 000 before the cursor. Runs only
 * when `KEYSET_PG_URL` names a server: only a server's planner shows the
 * plan production runs.
 * @ref https://www.postgresql.org/docs/current/using-explain.html
 * @ref https://use-the-index-luke.com/sql/partial-results/fetch-next-page
 */
import type { QueryEvent } from '@netvark/kysely-keyset';

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDefineKeyset } from '@netvark/kysely-keyset';

import { SECRET } from './support/keysets.ts';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Pool } = pg` for ESM
const { Pool } = pg;

const URL = process.env['KEYSET_PG_URL'];
const ROWS = 10_000;
/** The page whose plan is read. */
const SIZE = 100;
/** The pages walked to reach the middle of the list. */
const STRIDE = 1000;
const DEPTH = 5;
/** A page, the row that tells whether another follows, and the cursor's own row. */
const ONE_PAGE = SIZE + 2;

interface IndexDB {
  people: { id: string; name: string; nickname: string | null };
}

/** One node of `EXPLAIN (FORMAT JSON)`. */
interface PlanNode {
  readonly 'Node Type': string;
  readonly 'Scan Direction'?: string;
  readonly 'Index Name'?: string;
  readonly 'Index Cond'?: string;
  readonly 'Presorted Key'?: ReadonlyArray<string>;
  readonly 'Actual Rows': number;
  readonly 'Rows Removed by Filter'?: number;
  readonly Plans?: ReadonlyArray<PlanNode>;
}

const defineKeyset = createDefineKeyset<IndexDB>({
  cursor: { secret: SECRET },
});
const people = defineKeyset({
  table: 'people',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'bigint' },
    name: { column: 'name', type: 'text' },
    nickname: { column: 'nickname', type: 'text', nullable: true },
  },
  page: { max: STRIDE },
});
type Request = Parameters<typeof people.paginate>[1];

function nodesOf(node: PlanNode): Array<PlanNode> {
  return [node, ...(node.Plans ?? []).flatMap((child) => nodesOf(child))];
}

/** The scan node, and how many index entries it read. */
function scanOf(plan: PlanNode): { scan: PlanNode; read: number } {
  const scan = nodesOf(plan).find((node) => node['Node Type'].endsWith('Scan'));
  if (scan === undefined) {
    throw new Error('the plan has no scan');
  }
  return {
    scan,
    read: scan['Actual Rows'] + (scan['Rows Removed by Filter'] ?? 0),
  };
}

describe.skipIf(URL === undefined)(
  'PostgreSQL server: a page deep in the list is an index range scan',
  () => {
    const schema = `keyset_index_${Date.now().toString(36)}`;
    let pool: pg.Pool;
    let db: Kysely<IndexDB>;

    beforeAll(async () => {
      const admin = new Pool({ connectionString: URL, max: 1 });
      await admin.query(`create schema ${schema}`);
      await admin.end();
      pool = new Pool({
        connectionString: URL,
        max: 2,
        options: `-c search_path=${schema}`,
      });
      await pool.query(`
        create table people (
          id int8 generated always as identity primary key,
          name text not null,
          nickname text
        );
        insert into people (name, nickname)
          select md5(n::text), case when n % 4 = 0 then null else md5((n * 7)::text) end
          from generate_series(1, ${String(ROWS)}) as n;
        create index people_name_id on people (name, id);
        analyze people;`);
      db = new Kysely<IndexDB>({ dialect: new PostgresDialect({ pool }) });
    });
    afterAll(async () => {
      await pool.query(`drop schema ${schema} cascade`);
      await db.destroy();
    });

    /** The plan of the page query for `request`, as run by EXPLAIN ANALYZE. */
    async function planOf(request: Request): Promise<PlanNode> {
      const events: Array<QueryEvent> = [];
      await people.paginate(db.selectFrom('people').select('id'), request, {
        onQuery: (event) => {
          events.push(event);
        },
      });
      const page = events.find((event) => event.kind === 'page');
      if (page === undefined) {
        throw new Error('no page query ran');
      }
      const { rows } = await pool.query<{ 'QUERY PLAN': unknown }>(
        `explain (analyze, costs off, timing off, summary off, format json) ${page.sql}`,
        [...page.parameters],
      );
      const output = rows[0]?.['QUERY PLAN'];
      const parsed: unknown =
        typeof output === 'string' ? JSON.parse(output) : output;
      return (parsed as ReadonlyArray<{ Plan: PlanNode }>)[0]!.Plan;
    }

    /** The cursor halfway down `sort`. */
    async function middle(sort: Request['sort']): Promise<string> {
      let after: string | undefined;
      for (let walked = 0; walked < DEPTH; walked += 1) {
        const page = await people.paginate(
          db.selectFrom('people').select('id'),
          {
            sort,
            page: { size: STRIDE, after },
          },
        );
        after = page.next ?? undefined;
      }
      if (after === undefined) {
        throw new Error('the list ended early');
      }
      return after;
    }

    it('after a cursor: a forward index scan that starts at the cursor', async () => {
      const after = await middle(['name']);
      const { scan, read } = scanOf(
        await planOf({ sort: ['name'], page: { size: SIZE, after } }),
      );
      expect(scan).toMatchObject({
        'Node Type': expect.stringMatching(/^Index (?:Only )?Scan$/u),
        'Index Name': 'people_name_id',
        'Scan Direction': 'Forward',
        'Index Cond': expect.stringMatching(/^\(name >= '/u),
      });
      expect(read).toBeLessThanOrEqual(ONE_PAGE);
    });

    it('before a cursor: a backward index scan that starts at the cursor', async () => {
      const before = await middle(['name']);
      const { scan, read } = scanOf(
        await planOf({ sort: ['name'], page: { size: SIZE, before } }),
      );
      expect(scan).toMatchObject({
        'Index Name': 'people_name_id',
        'Scan Direction': 'Backward',
        'Index Cond': expect.stringMatching(/^\(name <= '/u),
      });
      expect(read).toBeLessThanOrEqual(ONE_PAGE);
    });

    it('descending over the ascending index: a backward scan from the cursor, ties sorted as they come', async () => {
      const after = await middle(['-name']);
      const plan = await planOf({
        sort: ['-name'],
        page: { size: SIZE, after },
      });
      const { scan, read } = scanOf(plan);
      expect(scan).toMatchObject({
        'Index Name': 'people_name_id',
        'Scan Direction': 'Backward',
        'Index Cond': expect.stringMatching(/^\(name <= '/u),
      });
      expect(nodesOf(plan)).toContainEqual(
        expect.objectContaining({
          'Node Type': 'Incremental Sort',
          'Presorted Key': ['name'],
        }),
      );
      expect(read).toBeLessThan(2 * SIZE);
    });

    it('walks a nullable sort through every row, its nulls last', async () => {
      const seen: Array<string | null> = [];
      let after: string | undefined;
      do {
        const page = await people.paginate(
          db.selectFrom('people').select(['id', 'nickname']),
          { sort: ['nickname'], page: { size: STRIDE, after } },
        );
        seen.push(...page.rows.map((row) => row.nickname));
        after = page.next ?? undefined;
      } while (after !== undefined);
      const nulls = seen.filter((nickname) => nickname === null).length;
      expect([seen.length, nulls]).toEqual([ROWS, ROWS / 4]);
      expect(seen.slice(-nulls).every((nickname) => nickname === null)).toBe(
        true,
      );
    });
  },
);
