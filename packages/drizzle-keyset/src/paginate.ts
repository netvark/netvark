import type { SQL } from 'drizzle-orm';
import type { PgTable, SelectedFields } from 'drizzle-orm/pg-core';
import type { SelectResultFields } from 'drizzle-orm/query-builders/select.types';

/**
 * `keyset.paginate` (SPEC 14.3, ADR 0017): the plan rendered as Drizzle
 * `sql` into a select this module builds over the definition's table. The
 * caller's selection gets the text-cast keys under private aliases; the
 * caller's `where`, the filter, and the seek are each parenthesized and
 * joined with `and`, since Drizzle's `and()` does not parenthesize its
 * operands; the total (when asked for) counts the first two. The aliases
 * are stripped before the rows reach the caller.
 * @ref https://orm.drizzle.team/docs/select#aggregations-helpers (count)
 * @ref https://www.postgresql.org/docs/current/queries-order.html (NULLS FIRST / LAST)
 * @ref https://www.postgresql.org/docs/current/sql-expressions.html#SQL-SYNTAX-TYPE-CASTS
 * @packageDocumentation
 */
import type {
  CursorValue,
  FieldsInit,
  Keyset,
  KeysetRequestOf,
  Page,
  PlanKey,
  QueryPlan,
  RelationsInit,
} from '@netvark/keyset-core';

import type {
  KeysetDatabase,
  KeysetSchema,
  PaginateOptions,
  QueryEvent,
  RenderContext,
} from './types';

import { count, getTableColumns, sql } from 'drizzle-orm';

import { renderPredicate } from './render/predicate';
import { renderTarget, table } from './render/target';

/** The names `keyAlias` gives the sort keys: reserved in a caller's selection. */
const KEY_ALIAS = /^keyset\d+$/u;

const DIRECTIONS: Readonly<Record<PlanKey['direction'], SQL>> = {
  asc: sql.raw('asc'),
  desc: sql.raw('desc'),
};

const NULLS: Readonly<Record<'first' | 'last', SQL>> = {
  first: sql.raw('nulls first'),
  last: sql.raw('nulls last'),
};

type Reporter = (event: QueryEvent) => void;

/** What `run` needs of a Drizzle select: its statement, and its rows. */
interface Statement<TRow> {
  toSQL(): { readonly sql: string; readonly params: ReadonlyArray<unknown> };
  execute(): Promise<Array<TRow>>;
}

async function run<TRow>(
  query: Statement<TRow>,
  kind: QueryEvent['kind'],
  report: Reporter | undefined,
): Promise<Array<TRow>> {
  if (report === undefined) {
    return query.execute();
  }
  const compiled = query.toSQL();
  const started = performance.now();
  const rows = await query.execute();
  report({
    kind,
    sql: compiled.sql,
    parameters: compiled.params,
    durationMs: performance.now() - started,
    rowCount: rows.length,
  });
  return rows;
}

function checkSelection(selection: SelectedFields | undefined): void {
  for (const name of Object.keys(selection ?? {})) {
    if (KEY_ALIAS.test(name)) {
      throw new TypeError(
        `select has a member named ${name}: paginate reserves the names keyset0, keyset1, ... for the sort keys`,
      );
    }
  }
}

/** The present parts, each in parentheses, joined with `and`. */
function conjunction(parts: ReadonlyArray<SQL | undefined>): SQL | undefined {
  const present = parts.filter((part) => part !== undefined);
  if (present.length === 0) {
    return undefined;
  }
  return sql.join(
    present.map((part) => sql`(${part})`),
    sql` and `,
  );
}

async function countTotal(
  db: KeysetDatabase,
  from: PgTable,
  where: SQL | undefined,
  report: Reporter | undefined,
): Promise<number> {
  const query = db.select({ total: count() }).from(from).where(where);
  const [row] = await run(query, 'total', report);
  return row === undefined ? 0 : row.total;
}

function keySelection(
  plan: QueryPlan,
  context: RenderContext,
): Record<string, SQL.Aliased<string | null>> {
  return Object.fromEntries(
    plan.keys.map((key) => [
      key.alias,
      sql<string | null>`cast(${renderTarget(key.target, context)} as text)`.as(
        key.alias,
      ),
    ]),
  );
}

function orderOf(key: PlanKey, context: RenderContext): SQL {
  const ordered = sql`${renderTarget(key.target, context)} ${DIRECTIONS[key.direction]}`;
  return key.nulls === null ? ordered : sql`${ordered} ${NULLS[key.nulls]}`;
}

/** Reads the key values of a fetched row and returns the row without the private aliases. */
function splitRow(
  fetched: Record<string, unknown>,
  plan: QueryPlan,
): {
  readonly row: Record<string, unknown>;
  readonly values: ReadonlyArray<CursorValue>;
} {
  const aliases = new Set(plan.keys.map((key) => key.alias));
  const values = plan.keys.map((key) => {
    const value = fetched[key.alias];
    return typeof value === 'string' ? value : null;
  });
  const row = Object.fromEntries(
    Object.entries(fetched).filter(([name]) => !aliases.has(name)),
  );
  return { row, values };
}

/**
 * Plans `request` with `keyset`, builds and runs the page select over the
 * plan's table of `schema` on `db`, and assembles the page (SPEC 14.3).
 */
export async function paginate<
  TFields extends FieldsInit,
  TRelations extends RelationsInit,
  TSelection extends SelectedFields,
>(
  keyset: Keyset<TFields, TRelations>,
  schema: KeysetSchema,
  db: KeysetDatabase,
  request: KeysetRequestOf<TFields, TRelations>,
  options: PaginateOptions<TSelection> = {},
): Promise<Page<SelectResultFields<TSelection>>> {
  checkSelection(options.select);
  const plan = await keyset.plan(request, { context: options.context });
  const context: RenderContext = { schema, table: plan.table };
  const from = table(context, plan.table);
  const filter =
    plan.filter === null ? undefined : renderPredicate(plan.filter, context);
  const seek =
    plan.seek === null ? undefined : renderPredicate(plan.seek, context);
  const total =
    options.total === true
      ? await countTotal(
          db,
          from,
          conjunction([options.where, filter]),
          options.onQuery,
        )
      : undefined;
  const selection: SelectedFields = {
    ...(options.select ?? getTableColumns(from)),
    ...keySelection(plan, context),
  };
  const query = db
    .select(selection)
    .from(from)
    .where(conjunction([options.where, filter, seek]))
    .orderBy(...plan.keys.map((key) => orderOf(key, context)))
    .limit(plan.limit);
  const fetched: Array<Record<string, unknown>> = await run(
    query,
    'page',
    options.onQuery,
  );
  const split = fetched.map((item) => splitRow(item, plan));
  const valuesByRow = new Map(split.map(({ row, values }) => [row, values]));
  // Without the aliases, a row is what Drizzle selected for the caller's
  // selection, or for the table's columns when there is none, which is
  // the type `TSelection` defaults to.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the plan's aliases are the only members paginate added to the selection the rows are typed by
  const rows = split.map(({ row }) => row) as Array<
    SelectResultFields<TSelection>
  >;
  return keyset.page(plan, rows, (row) => valuesByRow.get(row) ?? [], {
    total,
  });
}
