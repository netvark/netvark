/**
 * `relayOutbox` (resource SPEC 18.6) on PGlite: one transaction delivers
 * the oldest events in `position` order and deletes them; a delivery that
 * rejects leaves them all; values cross the driver as text, and the
 * application's plugins never touch the statements. Concurrent relays,
 * which `SKIP LOCKED` keeps apart, need a server: `e2e/resource`.
 */
import type { OutboxEvent } from './relay';

import { CamelCasePlugin, sql } from 'kysely';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { domainDatabase } from '../test-support/domain-database';
import { relayOutbox } from './relay';

const database = domainDatabase();
const outbox = { table: 'contract_outbox' };
/** Past 2^53, where a number would lose the last digit. */
const FAR = '9007199254740993';

beforeEach(async () => {
  await database.reset();
  await database.exec(
    `insert into contract_outbox (name, version, payload) values ('first', 1, '{"some_key": 1}'), ('second', 2, '[1, "two"]'), ('third', 1, 'null');`,
  );
});
afterAll(async () => {
  await database.close();
});

async function names(): Promise<ReadonlyArray<string>> {
  const { rows } = await sql<{
    name: string;
  }>`select name from contract_outbox order by position`.execute(database.db);
  return rows.map((row) => row.name);
}

describe('relayOutbox (resource SPEC 18.6)', () => {
  it('delivers the oldest events in position order as text and JSON, then deletes them', async () => {
    const deliver = vi.fn();
    expect(await relayOutbox({ db: database.db, outbox, deliver })).toBe(3);
    expect(deliver).toHaveBeenCalledExactlyOnceWith([
      { position: '1', name: 'first', version: 1, payload: { some_key: 1 } },
      { position: '2', name: 'second', version: 2, payload: [1, 'two'] },
      { position: '3', name: 'third', version: 1, payload: null },
    ] satisfies ReadonlyArray<OutboxEvent>);
    expect(await names()).toEqual([]);
  });

  it('delivers at most limit events a run, and calls nothing once the outbox is empty', async () => {
    const delivered: Array<string> = [];
    const deliver = vi.fn((events: ReadonlyArray<OutboxEvent>) => {
      delivered.push(...events.map((event) => event.name));
    });
    const run = async () =>
      relayOutbox({ db: database.db, outbox, deliver, limit: 2 });
    expect([await run(), await run(), await run()]).toEqual([2, 1, 0]);
    expect(delivered).toEqual(['first', 'second', 'third']);
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it('orders positions as numbers, not as the text they cross the driver as', async () => {
    await database.exec(
      `insert into contract_outbox (name, version, payload) select 'later', 1, 'null' from generate_series(4, 12);`,
    );
    const delivered: Array<string> = [];
    const deliver = (events: ReadonlyArray<OutboxEvent>) => {
      delivered.push(...events.map((event) => event.position));
    };
    expect(
      await relayOutbox({ db: database.db, outbox, deliver, limit: 10 }),
    ).toBe(10);
    expect(delivered).toEqual(
      Array.from({ length: 10 }, (_, index) => String(index + 1)),
    );
    expect(await names()).toEqual(['later', 'later']);
  });

  it('leaves every event of a run when deliver rejects, and rejects with what it threw', async () => {
    const failure = new Error('the queue is down');
    await expect(
      relayOutbox({
        db: database.db,
        outbox,
        deliver: () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(await names()).toEqual(['first', 'second', 'third']);
  });

  it("keeps a position past 2^53, and runs without the application's plugins", async () => {
    await database.exec(
      `truncate table contract_outbox; insert into contract_outbox (position, name, version, payload) overriding system value values (${FAR}, 'far', 1, '{"some_key": 2}');`,
    );
    const deliver = vi.fn();
    const camel = database.db.withPlugin(new CamelCasePlugin());
    expect(await relayOutbox({ db: camel, outbox, deliver })).toBe(1);
    expect(deliver).toHaveBeenCalledExactlyOnceWith([
      { position: FAR, name: 'far', version: 1, payload: { some_key: 2 } },
    ]);
  });

  it('reads an outbox table in another schema', async () => {
    await database.exec(
      `create schema if not exists relay; create table if not exists relay.events (position int8 generated always as identity primary key, name text not null, version int4 not null, payload jsonb not null); insert into relay.events (name, version, payload) values ('elsewhere', 1, '{}');`,
    );
    const deliver = vi.fn();
    const elsewhere = { schema: 'relay', table: 'events' };
    expect(
      await relayOutbox({ db: database.db, outbox: elsewhere, deliver }),
    ).toBe(1);
    expect(deliver.mock.calls[0]?.[0]).toMatchObject([{ name: 'elsewhere' }]);
  });
});

/** A delivery that takes every event. */
const takeAll = (): void => undefined;

describe('relayOutbox: what JavaScript passes', () => {
  it.each([
    [null, 'relayOutbox: options must be an object'],
    [
      { outbox, deliver: takeAll },
      'relayOutbox: options.db must be a Kysely instance',
    ],
    [
      { db: database.db, outbox, deliver: takeAll, batch: 5 },
      'relayOutbox: options.batch is not an option',
    ],
    [
      { db: database.db, outbox: 'contract_outbox', deliver: takeAll },
      'relayOutbox: options.outbox must be { table, schema? }',
    ],
    [
      { db: database.db, outbox: { table: '' }, deliver: takeAll },
      'relayOutbox: options.outbox.table must be a table name',
    ],
    [
      { db: database.db, outbox },
      'relayOutbox: options.deliver must be a function',
    ],
    [
      { db: database.db, outbox, deliver: takeAll, limit: 0 },
      'relayOutbox: options.limit must be a positive integer',
    ],
    [
      { db: database.db, outbox, deliver: takeAll, limit: 1.5 },
      'relayOutbox: options.limit must be a positive integer',
    ],
  ])('refuses what a mistake passes: %#', async (options, message) => {
    // @ts-expect-error -- what JavaScript may pass, which no type allows
    await expect(relayOutbox(options)).rejects.toThrow(new TypeError(message));
  });
});
