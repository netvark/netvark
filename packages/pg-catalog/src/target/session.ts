/**
 * The session both replay targets implement (SPEC 6), and the settings
 * pinned before every migration and every read (SPEC 7.1).
 * @ref https://www.postgresql.org/docs/18/runtime-config-client.html
 * @packageDocumentation
 */

/** One connection to a database extraction replays into or reads from. */
export interface SqlSession {
  /** Runs text through the simple query protocol: several statements, no parameters. */
  exec(sql: string): Promise<void>;
  /** Runs one statement with bound parameters. */
  query<TRow extends Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<ReadonlyArray<TRow>>;
  /** Closes the connection and releases what the target created. */
  close(): Promise<void>;
}

/**
 * The settings that change what PostgreSQL stores or how it prints
 * constants: `timestamptz` constants are converted in `TimeZone`, date and
 * interval constants are parsed and printed in `DateStyle` and
 * `IntervalStyle`, floats print in their shortest exact form with
 * `extra_float_digits = 1`, `bytea` prints in hex, and string constants
 * with backslashes parse and print without `E'...'` under
 * `standard_conforming_strings`.
 */
export const SESSION_SETTINGS: string = [
  "SET TimeZone = 'UTC';",
  "SET DateStyle = 'ISO, YMD';",
  "SET IntervalStyle = 'postgres';",
  'SET extra_float_digits = 1;',
  "SET bytea_output = 'hex';",
  'SET standard_conforming_strings = on;',
].join(' ');

function ignoreCloseFailure(): void {
  // The error of the work is the one worth reporting.
}

/**
 * Runs `work` on a session and closes it. When `work` fails, its error is
 * the one reported and a failure to close is ignored; when `work`
 * succeeds, a failure to close (such as a database that could not be
 * dropped) fails the call (SPEC 6.2).
 */
export async function useSession<TResult>(
  session: SqlSession,
  work: (session: SqlSession) => Promise<TResult>,
): Promise<TResult> {
  let result: TResult;
  try {
    result = await work(session);
  } catch (error) {
    await session.close().catch(ignoreCloseFailure);
    throw error;
  }
  await session.close();
  return result;
}
