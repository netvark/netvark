/**
 * Ending a node-postgres pool once its connections have closed.
 * `pool.end()` resolves once it has asked each idle connection to end,
 * before the server has closed them, so a `drop database ... with (force)`
 * right after it terminates them, and each reports the termination (57P01)
 * as an error the ended pool emits to no listener. pg-pool emits `remove`
 * once a connection's `end()` completes, so counting those finds the
 * moment every connection is gone.
 * @ref https://node-postgres.com/apis/pool#events
 * @packageDocumentation
 */
import type pg from 'pg';

/** Resolves once every connection `pool` holds now has closed; take it before the pool ends. */
async function connectionsClosed(pool: pg.Pool): Promise<void> {
  let open = pool.totalCount;
  if (open === 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    pool.on('remove', () => {
      open -= 1;
      if (open === 0) {
        resolve();
      }
    });
  });
}

/** Ends `pool` and resolves once each of its connections has closed. */
export async function endPool(pool: pg.Pool): Promise<void> {
  const closed = connectionsClosed(pool);
  await pool.end();
  await closed;
}
