import type { RawBuilder, SqlBool } from 'kysely';

/**
 * `list` (SPEC 18.2, obligations 5 and 12 of resource SPEC 12.8): the
 * request planned by the declared resource's keyset definition, with the
 * transaction's scope values as the cursor context, so a cursor issued in
 * one scope is refused in another. The plan is rendered with
 * `@netvark/kysely-keyset`'s `renderTarget` and `renderPredicate` onto one
 * statement over the schema-qualified table aliased as the plan's table,
 * where the scope predicate, the plan's filter, and its seek hold. Each
 * sort key is selected as text, under its plan alias behind a `.`, which no
 * public name holds (resource SPEC 4.2), so no member's alias meets it,
 * and ordered with its direction and, on a nullable key, its null
 * placement (keyset ADR 0016); the plan's limit is one row past the page.
 * With `total`, a second statement counts the rows of the scope the filter
 * selects. `list` never counts rows to find a page.
 * @ref https://github.com/netvark/netvark/blob/main/docs/keyset/SPEC.md (section 6, the query plan)
 * @ref https://www.postgresql.org/docs/18/queries-order.html (NULLS FIRST / LAST)
 * @packageDocumentation
 */
import type {
  CursorContext,
  CursorValue,
  Keyset,
  PlanKey,
} from '@netvark/keyset-core';
import type { AnyDatabase, RenderContext } from '@netvark/kysely-keyset';
import type { DeclaredResource } from '@netvark/resource-core';
import type {
  PublicRow,
  StorageListRequest,
  StoragePage,
} from '@netvark/resource-core/server';

import type { KyselyTransaction } from './transaction';
import type { ListOptions } from './types';
import type { Row, ValueContext } from './values';

import { expressionBuilder, sql } from 'kysely';

import { renderPredicate, renderTarget } from '@netvark/kysely-keyset';

import { scopePredicate } from './scope';
import { tableName, tableOf } from './sql';
import { selectList } from './statement';
import { readRow } from './values';

const DIRECTIONS: Readonly<Record<PlanKey['direction'], RawBuilder<unknown>>> =
  { asc: sql`asc`, desc: sql`desc` };
const NULLS: Readonly<
  Record<NonNullable<PlanKey['nulls']>, RawBuilder<unknown>>
> = {
  first: sql`nulls first`,
  last: sql`nulls last`,
};

/** The transaction's scope values as a cursor context: each scope's name mapped to its value. */
function cursorContext(tx: KyselyTransaction): CursorContext {
  return Object.fromEntries(
    tx.scopes.map(({ scope, value }) => [scope, value]),
  );
}

/** The alias a sort key is selected under. */
function keyAlias(key: PlanKey): string {
  return `.${key.alias}`;
}

/**
 * A sort key's value as selected, its text, or `null` for a null key. The
 * row's members were read as text first, so the driver returns text.
 */
function cursorValue(row: Row, key: PlanKey): CursorValue {
  const value = row[keyAlias(key)];
  return typeof value === 'string' ? value : null;
}

/** `conditions`, each in parentheses, joined by `and`. */
function conjunction(
  conditions: ReadonlyArray<
    RawBuilder<SqlBool> | ReturnType<typeof renderPredicate>
  >,
): RawBuilder<SqlBool> {
  return sql<SqlBool>`${sql.join(
    conditions.map((condition) => sql`(${condition})`),
    sql` and `,
  )}`;
}

/** A page of `request`, planned by `keyset` and read in the transaction's scope. */
export async function listRows(
  context: ValueContext,
  keyset: Keyset,
  tx: KyselyTransaction,
  resource: DeclaredResource,
  request: StorageListRequest,
  options: ListOptions = {},
): Promise<StoragePage> {
  const plan = await keyset.plan(request, { context: cursorContext(tx) });
  const table = tableOf(context.catalog, resource);
  const eb = expressionBuilder<AnyDatabase, string>();
  const render: RenderContext = { table: plan.table };
  const from = sql`${tableName(table)} as ${sql.id(plan.table)}`;
  const filtered = [
    scopePredicate(context.catalog, table, resource, tx),
    ...(plan.filter === null ? [] : [renderPredicate(eb, plan.filter, render)]),
  ];
  const sought =
    plan.seek === null
      ? filtered
      : [...filtered, renderPredicate(eb, plan.seek, render)];
  const keys = plan.keys.map(
    (key) =>
      sql`cast(${renderTarget(eb, key.target, render)} as text) as ${sql.id(keyAlias(key))}`,
  );
  const order = plan.keys.map((key) => {
    const directed = sql`${renderTarget(eb, key.target, render)} ${DIRECTIONS[key.direction]}`;
    return key.nulls === null ? directed : sql`${directed} ${NULLS[key.nulls]}`;
  });
  const fetched = await tx.execute((db) =>
    sql<Row>`select ${selectList(resource)}, ${sql.join(keys)} from ${from} where ${conjunction(sought)} order by ${sql.join(order)} limit ${plan.limit}`.compile(
      db,
    ),
  );
  const values = new Map<PublicRow, ReadonlyArray<CursorValue>>();
  const rows = fetched.map((row) => {
    const publicRow = readRow(context, table, resource, row);
    values.set(
      publicRow,
      plan.keys.map((key) => cursorValue(row, key)),
    );
    return publicRow;
  });
  const total =
    options.total === true
      ? await countFiltered(tx, from, conjunction(filtered))
      : undefined;
  return keyset.page(plan, rows, (row) => values.get(row) ?? [], { total });
}

/** The rows `where` selects from `from`, counted. */
async function countFiltered(
  tx: KyselyTransaction,
  from: RawBuilder<unknown>,
  where: RawBuilder<SqlBool>,
): Promise<number> {
  const [row] = await tx.execute((db) =>
    sql<{
      total: string;
    }>`select count(*)::text as "total" from ${from} where ${where}`.compile(
      db,
    ),
  );
  return Number(row?.total);
}
