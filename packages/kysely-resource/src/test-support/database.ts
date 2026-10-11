/**
 * What the tests run against: the storage contract's schema (resource SPEC
 * 12.9) on PGlite through Kysely's PGlite dialect, whose single connection
 * Kysely serializes, so transactions run one at a time; the server's
 * keyset definer; and a storage codec for the fixture's `point`.
 * @ref https://kysely-org.github.io/kysely-apidoc/classes/PGliteDialect.html
 * @ref https://pglite.dev/docs/api
 */
import type { DefineDefaultedKeyset } from '@netvark/keyset-core';

import type { KyselyStorageOptions, TextCodec } from '../storage/types';

import { PGlite } from '@electric-sql/pglite';
import { Kysely, PGliteDialect } from 'kysely';

import { createDefineKeyset } from '@netvark/keyset-core';
import { contractFixture } from '@netvark/resource-core/testing';

/** The server's definer, holding the cursor secret the declarations leave out. */
const DEFINE_KEYSET: DefineDefaultedKeyset = createDefineKeyset({
  cursor: { secret: 'the adapter tests sign their cursors with this' },
});

const POINT = /^\(([^,]+),([^,]+)\)$/u;

/** The `point` codec's storage codec over PostgreSQL's text `(x,y)`. */
const POINT_TEXT: TextCodec = {
  read: (text) => {
    const [, x = '', y = ''] = POINT.exec(text) ?? [];
    return contractFixture.codecs.point.schema.parse({
      x: Number(x),
      y: Number(y),
    });
  },
  write: (value: unknown) => {
    const { x, y } = contractFixture.codecs.point.schema.parse(value);
    return `(${String(x)},${String(y)})`;
  },
};

/** A PGlite database holding the contract's schema. */
export interface TestDatabase {
  readonly db: Kysely<unknown>;
  /** Runs SQL text of one or more statements outside Kysely, as a migration does. */
  readonly exec: (script: string) => Promise<void>;
  /** Runs the contract's seed. */
  readonly reset: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** Opens a database holding the contract's migrations. */
export async function contractDatabase(): Promise<TestDatabase> {
  const pglite = await PGlite.create();
  for (const script of contractFixture.migrations) {
    await pglite.exec(script);
  }
  const db = new Kysely<unknown>({ dialect: new PGliteDialect({ pglite }) });
  return {
    db,
    exec: async (script) => {
      await pglite.exec(script);
    },
    reset: async () => {
      await pglite.exec(contractFixture.seed);
    },
    close: async () => {
      await db.destroy();
    },
  };
}

/** The adapter's options over `db`, as an application passes them. */
export function storageOptions<TDatabase>(
  db: Kysely<TDatabase>,
): KyselyStorageOptions<TDatabase> {
  return {
    db,
    catalog: contractFixture.catalog,
    codecs: { point: POINT_TEXT },
    defineKeyset: DEFINE_KEYSET,
    outbox: { table: 'contract_outbox' },
  };
}
