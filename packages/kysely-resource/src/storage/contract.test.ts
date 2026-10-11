import type { DomainEvent } from '@netvark/resource-core/server';
import type { ContractHarness } from '@netvark/resource-core/testing';

import type { KyselyTransaction } from './transaction';

import { sql } from 'kysely';
import { afterAll, describe, it } from 'vitest';

import {
  contractFixture,
  storageContract,
} from '@netvark/resource-core/testing';

import { contractDatabase, storageOptions } from '../test-support/database';
import { createKyselyStorage } from './create-storage';

/** The outbox the harness reads events from (resource SPEC 18.6). */
const OUTBOX = `create table contract_outbox (
  position int8 generated always as identity primary key,
  name text not null,
  version int4 not null,
  payload jsonb not null
)`;
const RESET = `${contractFixture.seed}truncate table contract_outbox restart identity;`;
/** The cases that page with `list`, which the adapter does not have yet. */
const NEEDS_LIST = /^obligation 5:|^obligation 2: every page of list/u;

const database = contractDatabase([OUTBOX]);
const storage = createKyselyStorage(storageOptions(database.db));

const harness: ContractHarness<KyselyTransaction> = {
  adapter: {
    ...storage,
    list: () => {
      throw new Error('list: not implemented yet');
    },
  },
  reset: async () => {
    await database.exec(RESET);
  },
  events: async () => {
    const { rows } = await sql<{
      name: string;
      version: number;
      payload: string;
    }>`select name, version, payload::text as payload from contract_outbox order by position`.execute(
      database.db,
    );
    return rows.map((row): DomainEvent => ({
      name: row.name,
      version: row.version,
      payload: JSON.parse(row.payload),
    }));
  },
};

afterAll(async () => {
  await database.close();
});

describe('the storage contract (resource SPEC 12.9) on PGlite', () => {
  for (const contractCase of storageContract(harness)) {
    it.skipIf(NEEDS_LIST.test(contractCase.name))(
      contractCase.name,
      contractCase.run,
    );
  }
});
