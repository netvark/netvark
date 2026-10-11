import type { Kysely } from 'kysely';

/**
 * `relayOutbox(options)` (SPEC 18.6): the delivery of what operations
 * recorded, after they committed. One run is one transaction: it claims
 * the oldest rows of the outbox with `FOR UPDATE SKIP LOCKED`, hands them
 * to `deliver` in `position` order, deletes them, and commits. When
 * `deliver` rejects, the transaction rolls back and the rows stay for the
 * next run, so delivery is at least once and a consumer deduplicates by
 * `position`. Rows another run holds are skipped, so concurrent relays
 * never deliver one row at once. A run is READ COMMITTED whatever
 * `default_transaction_isolation` says, as the storage's transactions are:
 * under SERIALIZABLE, two runs that read and delete rows of one page form
 * a read/write dependency cycle, so one fails after its delivery and
 * delivers again on the next run. Values cross the driver as text, and the
 * statements run without the application's plugins, as the storage's do.
 * @ref https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE
 * @ref https://www.postgresql.org/docs/18/transaction-iso.html#XACT-SERIALIZABLE
 * @ref https://microservices.io/patterns/data/transactional-outbox.html
 * @packageDocumentation
 */
import type { OutboxTable } from '../storage/types';

import { sql } from 'kysely';

import {
  checkDb,
  checkKeys,
  outboxName,
  plain,
} from '../internal/kysely-options';
import { isRecord } from '../internal/object';
import { arrayLiteral } from '../storage/array-literal';

/** An event as the relay delivers it. */
export interface OutboxEvent {
  /** The row's position, as text, since an `int8` may exceed 2^53; consumers deduplicate by it. */
  readonly position: string;
  readonly name: string;
  readonly version: number;
  readonly payload: unknown;
}

/** What `relayOutbox` takes. */
export interface RelayOptions<TDatabase> {
  /** The application's Kysely; the relay runs without its plugins. */
  readonly db: Kysely<TDatabase>;
  /** The table the storage records events in. */
  readonly outbox: OutboxTable;
  /** Delivers the events in `position` order; rejects to leave them for the next run. */
  readonly deliver: (
    events: ReadonlyArray<OutboxEvent>,
  ) => void | Promise<void>;
  /** The most events one run delivers; default 100. */
  readonly limit?: number | undefined;
}

/** A claimed row, every value as text. */
interface OutboxRow {
  readonly position: string;
  readonly name: string;
  readonly version: string;
  readonly payload: string;
}

/** A claimed row as the event `deliver` receives: the version a number, the payload parsed from the JSON PostgreSQL printed. */
function outboxEvent(row: OutboxRow): OutboxEvent {
  const payload: unknown = JSON.parse(row.payload);
  return {
    position: row.position,
    name: row.name,
    version: Number(row.version),
    payload,
  };
}

const CALLER = 'relayOutbox';
const OPTIONS: ReadonlySet<string> = new Set([
  'db',
  'outbox',
  'deliver',
  'limit',
]);
const DEFAULT_LIMIT = 100;

/** The checked options; throws `TypeError` naming the first option the relay cannot use. */
function relayConfig<TDatabase>(options: RelayOptions<TDatabase>) {
  const value: unknown = options;
  if (!isRecord(value)) {
    throw new TypeError(`${CALLER}: options must be an object`);
  }
  checkKeys(CALLER, 'options', value, OPTIONS);
  checkDb(CALLER, value['db']);
  const outbox = outboxName(CALLER, value['outbox']);
  if (typeof value['deliver'] !== 'function') {
    throw new TypeError(`${CALLER}: options.deliver must be a function`);
  }
  const limit = value['limit'] ?? DEFAULT_LIMIT;
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError(`${CALLER}: options.limit must be a positive integer`);
  }
  return {
    db: plain(options.db),
    table: sql.id(outbox.schema, outbox.table),
    deliver: options.deliver,
    limit,
  };
}

/**
 * Delivers the oldest `limit` events no other run holds, then deletes
 * them, in one transaction; resolves to how many it delivered, without
 * calling `deliver` when there are none. Rejects with what `deliver`
 * rejected with, leaving every event of the run in the outbox.
 */
export async function relayOutbox<TDatabase>(
  options: RelayOptions<TDatabase>,
): Promise<number> {
  const { db, table, deliver, limit } = relayConfig(options);
  return db
    .transaction()
    .setIsolationLevel('read committed')
    .execute(async (trx) => {
      // The order names the table's column: a bare "position" would name
      // the text the select list casts it to, and sort '10' before '2'.
      // @ref https://www.postgresql.org/docs/18/sql-select.html#SQL-ORDERBY ("ORDER BY will interpret it as the output column name")
      const { rows } =
        await sql<OutboxRow>`select "position"::text as "position", "name"::text as "name", "version"::text as "version", "payload"::text as "payload" from ${table} as "outbox" order by "outbox"."position" limit ${String(limit)}::text::int8 for update skip locked`.execute(
          trx,
        );
      if (rows.length === 0) {
        return 0;
      }
      await deliver(rows.map((row) => outboxEvent(row)));
      const positions = arrayLiteral(rows.map((row) => row.position));
      await sql`delete from ${table} where "position" = any(${positions}::text::int8[])`.execute(
        trx,
      );
      return rows.length;
    });
}
