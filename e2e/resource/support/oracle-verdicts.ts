/**
 * The two verdicts the oracle compares (resource SPEC 15.3): PostgreSQL's,
 * from writing a value into its column inside a rolled-back transaction,
 * so the column's type, modifier, domains, and CHECKs all judge it with
 * assignment semantics; and whether the two disagree.
 * @ref https://www.postgresql.org/docs/18/sql-insert.html
 */
import type { ColumnType } from './column-type.ts';
import type { OracleDatabase } from './oracle-database.ts';

import { readForm, UNREPRESENTABLE } from './read-form.ts';
import { sameValue } from './same-value.ts';

/** PostgreSQL's verdict: the stored value as text, `null` for SQL `NULL`, or the error's SQLSTATE. */
export type DatabaseVerdict =
  | { readonly accepted: true; readonly stored: string | null }
  | { readonly accepted: false; readonly code: string };

function identifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function sqlState(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'unknown';
}

/** Writes `text`, or SQL `NULL` for `null`, into `table.column` and rolls back. */
export async function databaseVerdict(
  database: OracleDatabase,
  table: string,
  column: string,
  text: string | null,
): Promise<DatabaseVerdict> {
  const target = identifier(column);
  await database.query('begin');
  try {
    const [row] = await database.query(
      `insert into ${identifier(table)} (${target}) values ($1) returning ${target}::text as stored`,
      [text],
    );
    const stored = row?.['stored'];
    if (typeof stored !== 'string' && stored !== null) {
      throw new Error(
        `${table}.${column}: the stored value did not come back as text`,
      );
    }
    return { accepted: true, stored };
  } catch (error) {
    return { accepted: false, code: sqlState(error) };
  } finally {
    await database.query('rollback');
  }
}

/**
 * How the verdicts disagree, or `undefined` when they agree: a value the
 * schema accepts must be stored as the same value, and a value it refuses
 * must be refused by the database, or stored as a value whose read form
 * does not give back what was sent (resource SPEC 5.2). `givesBack` says
 * whether a read form gives back exactly what was sent, spelling included.
 * `null` is stored as SQL `NULL` or refused, never changed.
 */
export function disagreement(
  sent: unknown,
  accepted: boolean,
  verdict: DatabaseVerdict,
  type: ColumnType,
  givesBack: (read: unknown) => boolean,
): string | undefined {
  if (!verdict.accepted) {
    return accepted
      ? `the schema accepts it; the database refuses it (${verdict.code})`
      : undefined;
  }
  if (verdict.stored === null) {
    const asSent = sent === null;
    return asSent === accepted
      ? undefined
      : `the schema ${accepted ? 'accepts' : 'refuses'} it; the database stores NULL`;
  }
  const read = readForm(verdict.stored, type);
  if (accepted) {
    return read !== UNREPRESENTABLE && sameValue(read, sent, type)
      ? undefined
      : `the schema accepts it; the database stores ${verdict.stored}`;
  }
  return read !== UNREPRESENTABLE && givesBack(read)
    ? 'the schema refuses it; the database stores it as sent'
    : undefined;
}
