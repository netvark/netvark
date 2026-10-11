# @netvark/kysely-resource

The [Kysely](https://kysely.dev) runtime for
[`@netvark/resource-core`](https://github.com/netvark/netvark/tree/main/packages/resource-core)
declarations on PostgreSQL. It runs every operation in one transaction that sets the actor's tenant
for that transaction only, so row security policies and the runtime's own scope predicate both see
it, on a pooled connection, without anything leaking into the next transaction. Every choice is
written down in
[`docs/resource/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/resource/SPEC.md),
section 18, and the decisions behind it in
[ADR 0012](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0012-the-runtime-runs-declarations-over-the-storage-contract.md).

Status: in development and unreleased. The storage adapter has its transaction protocol, scopes,
reads and writes, keyset pages with totals, `many` for includes, quotas, row locks, and the outbox
insert, and the runtime maps what an operation throws to the client's error (a rule's rejection, a
keyset refusal, a PostgreSQL integrity violation through its declared code, partitions included).
`relayOutbox` delivers the events operations recorded. The domain (`runtime.as(actor)`) and its boot
checks follow in the 0.x line.

## Install

```bash
pnpm add @netvark/kysely-resource @netvark/resource-core @netvark/keyset-core kysely zod
```

`kysely >= 0.28` is the peer dependency. The adapter runs on PostgreSQL 14 or later and on PGlite,
through any Kysely PostgreSQL dialect (`PostgresDialect` over `pg`, `PGliteDialect`, or your own),
on Node 22.12+, Bun, Deno, and Cloudflare Workers.

## Quick start

```ts
// src/server/storage.ts
import { createDefineKeyset } from '@netvark/keyset-core';
import { createKyselyStorage } from '@netvark/kysely-resource';

import { publicCatalog } from '../generated/public-catalog'; // what your declarations are built from
import { db } from './db'; // your Kysely<DB>

export const storage = createKyselyStorage({
  db,
  catalog: publicCatalog,
  defineKeyset: createDefineKeyset({ cursor: { secret: env.CURSOR_SECRET } }),
  outbox: { table: 'outbox' }, // once a behavior has effects; in `public` unless `schema` says otherwise
});
```

Creating the storage runs no query. It checks its options and throws a `TypeError` naming the first
one it cannot use, a key that is not an option included, so a misspelled `outbox` fails at startup
instead of when the first event is written.

The adapter runs on `db.withoutPlugins()`: your `CamelCasePlugin` or any other plugin keeps working
for your own queries and never renames the adapter's identifiers or result keys.

## What a transaction runs

```sql
start transaction isolation level read committed;
select set_config('TimeZone', 'UTC', true), set_config('DateStyle', 'ISO, YMD', true),
       set_config('IntervalStyle', 'postgres', true), set_config('extra_float_digits', '1', true),
       set_config('bytea_output', 'hex', true),
       set_config($1::text, $2::text, true);  -- 'app.organization_id', '7': one pair per scope
-- the operation's statements; each one on a scoped table carries
--   "organization_id" = $n::text::"int8"
commit;
```

- **READ COMMITTED, always.** The runtime's row locks assume it, so the level is stated, not
  inherited from `default_transaction_isolation`.
- **One opening statement.** It fixes how values print, so reads come back in one form whatever the
  role's or the database's settings, and it sets each scope's session parameter.
  `set_config(..., true)` is `SET LOCAL` with parameters: both end with the transaction, committed
  or rolled back.
- **Two layers of tenancy.** Your row security policy reads the parameter; the adapter adds the
  scope predicate to every statement on a scoped table. Either one alone keeps a tenant's rows to
  that tenant; together, a policy mistake or a missing policy does not leak rows through the API,
  and the policy still covers every other path to the table.
- **A failed statement fails the transaction.** PostgreSQL turns the `COMMIT` of a transaction in
  which a statement failed into a rollback that reports no error. The adapter keeps the first error
  one of its statements raised and rejects with it, unchanged, when the operation went on and
  resolved; an error the operation throws itself is rethrown unchanged.

## Reads and writes

The storage implements the storage contract of
[resource SPEC 12.8](https://github.com/netvark/netvark/blob/main/docs/resource/SPEC.md); the
runtime calls it, and you rarely do. What it does to your rows:

- **Only what the input holds.** `create` inserts exactly the members present, plus the client id,
  the server values, and the scope column, so your column defaults fill the rest; `update` sets
  exactly the members present, and `null` clears a member. An absent member is never written as
  `NULL`.
- **Text both ways.** Every value goes out as a text parameter cast to its column's type,
  `$1::text::"int8"`, so PostgreSQL parses it as it parses a literal, and every value comes back
  cast to text, so no driver type parser changes it.
- **Exact read forms.** `int8` and `numeric` read as strings, timestamps as ISO 8601 text, `json`
  and `jsonb` as parsed values. A stored value no read form holds, such as `'infinity'`, `NaN`, a BC
  date, or an array with a `NULL` element, fails the read instead of turning into something else.
- **Codecs.** A codec field is stored through its storage codec over PostgreSQL's text, the same
  object `resources.storage` names in `netvark.config`:

  ```ts
  createKyselyStorage({
    // ...
    codecs: {
      point: {
        read: (stored) => parsePoint(stored), // '(1.5,2)'
        write: (point: Point) => `(${point.x},${point.y})`,
      },
    },
  });
  ```

- **Keyset pages, bound to the tenant.** `list` plans the request with the resource's keyset
  definition from `@netvark/keyset-core` and pages with signed cursors bound to the transaction's
  scope values: two tenants asking for the same page send the same request, and a cursor of one is
  refused in the other with `INVALID_CURSOR`, reason `context`. `{ total: true }` adds a count of
  the rows the filter selects, the same on every page. A page never counts rows to find its place,
  so removing a row never shifts the next page.

  ```ts
  const page = await storage.transaction(scopes, async (tx) =>
    storage.list(tx, Contacts, { sort: ['name'], page: { size: 50, after } }, { total: true }),
  );
  ```

- **Includes in one statement.** `many(tx, resource, ids)` reads the rows of the given ids in the
  scope, each once, with `= any($1::text::<key type>[])`; an id of another tenant is left out, as a
  `get` of it finds no row.
- **Row locks before writes.** `lock` takes `FOR NO KEY UPDATE` before an update and `FOR UPDATE`
  before a remove, which also keeps another transaction from adding a reference to the row being
  removed.
- **Quotas per tenant.** `count` takes a transaction-scoped advisory lock keyed by the resource, the
  quota, and the scope's value, so two requests of one tenant cannot both take the last slot, and
  one tenant's count never waits for another tenant's.
- **Events with the write.** `record` inserts each event into the outbox table in the operation's
  transaction, so an event exists exactly when its write committed.

## Delivering events

Effects write their events into the outbox in the operation's transaction. `relayOutbox` delivers
them once the transaction has committed:

```ts
// src/server/relay.ts
import { relayOutbox } from '@netvark/kysely-resource';

import { db } from './db';
import { queue } from './queue';

const BATCH = 100;

/** Delivers until a run finds fewer than a batch; call it on a timer. */
export async function drainOutbox(): Promise<void> {
  let delivered = BATCH;
  while (delivered === BATCH) {
    delivered = await relayOutbox({
      db,
      outbox: { table: 'outbox' },
      limit: BATCH,
      deliver: async (events) => {
        await queue.sendBatch(events); // throw to keep the events for the next run
      },
    });
  }
}
```

- **One run, one transaction.** A run claims the oldest `limit` rows (100 by default) with
  `FOR UPDATE SKIP LOCKED`, calls `deliver` once with them in `position` order, deletes them, and
  commits. It resolves to how many it delivered; an empty outbox resolves to 0 without calling
  `deliver`.
- **A failed delivery keeps the events.** When `deliver` throws or rejects, the run rolls back and
  rejects with that error, so the next run delivers the same events.
- **Relays run side by side.** A run skips the rows another run holds, without waiting for it, so
  several workers can drain one outbox. Each run is READ COMMITTED whatever the role's or the
  database's default says: under SERIALIZABLE, two runs over one page fail each other.
- **Events as text and JSON.** `position` is text, since an `int8` may exceed 2^53; `version` is a
  number; `payload` is the parsed JSON.

## Best practices

**Write policies that read the parameter, and survive its absence.** Once a connection has run a
scoped transaction, the parameter reads as an empty string outside one, not `NULL`, so a policy that
casts it fails with `invalid input syntax` instead of matching nothing. Compare the column with the
cast parameter, wrapped in `nullif`:

```sql
alter table contacts enable row level security;

create policy contacts_organization on contacts
  using (organization_id = nullif(current_setting('app.organization_id', true), '')::bigint)
  with check (organization_id = nullif(current_setting('app.organization_id', true), '')::bigint);
```

The column stays bare, so an index that starts with it serves the policy: PostgreSQL 14 plans the
policy above as a bitmap index scan, while `organization_id::text = current_setting(...)` on the
same `bigint` column scans the whole table. Without a parameter, the policy above matches no row.

**Connect as a role that row security applies to.** A superuser and a role with `BYPASSRLS` skip
every policy, and so does a table's owner unless the table has `FORCE ROW LEVEL SECURITY`. Run the
API as its own role that owns nothing, and run migrations as the owner.

**Keep stored values inside the read forms.** A CHECK constraint keeps out what the API cannot read
back, so rows written by other paths stay readable:

```sql
alter table events add check (starts_at <> 'infinity' and starts_at <> '-infinity');
alter table prices add check (amount <> 'NaN');
```

**Take your own advisory locks with two keys.** The quota lock uses the one-key form,
`pg_advisory_xact_lock(bigint)`, on a hash of its key. PostgreSQL keeps the two-key form,
`pg_advisory_xact_lock(int, int)`, in a key space of its own, so your locks never collide with a
quota's.

**Index each scoped table by its scope column first.** Every statement filters on it, so an index on
`(organization_id, ...)` serves both the predicate and the policy.

**Index the sorts you page by behind the scope column.** A page orders by its sort keys and then by
the key, and its seek leads with a range on the first sort key (keyset ADR 0016), so an index of the
scope column, the sort keys in their directions, and the key lets PostgreSQL start at the cursor,
read one page in order, and stop, however deep the page:

```sql
create index contacts_organization_name on contacts (organization_id, name, id);
create index contacts_organization_created on contacts (organization_id, created_at desc, id);
```

On PostgreSQL 14, with 20 000 contacts in one organization, the page 10 000 rows down by `name`
reads 102 index entries of the first index in 0.13 ms; `-name` reads it backward with an incremental
sort of each tie, 103 entries. Without an index the page sorts every row of the organization. A
column the catalog reports nullable keeps `nulls last` in the order, so a descending index on it
needs the same placement, `(organization_id, title desc nulls last, id)`, and after a value it has
no range: sort by `NOT NULL` columns with few ties where lists grow long. A first key with many
equal values still reads the entries of its tie before the cursor: `-createdAt` over 20 000 equal
timestamps reads 10 101 at the same depth.

**Deduplicate by `position`.** Delivery is at least once: a run whose delivery succeeded but whose
commit did not (a lost connection, a stopped process) delivers the same events again. Key the
consumer by `position`, such as a table of handled positions or a queue's deduplication id.

**Grant the outbox per role.** The outbox holds every tenant's events and has no row security, so
the API's role gets `insert` only, which an identity column needs no sequence grant for, and never
reads an event. The relay's role gets `select`, `update`, and `delete`: `FOR UPDATE` needs the
`update` privilege.

```sql
grant insert on outbox to api;
grant select, update, delete on outbox to relay;
```

**Pool freely.** Settings and parameters are local to their transaction, so a pooled connection
carries nothing into the next one: CI checks it on four connections of a node-postgres pool on
PostgreSQL 14 and 18, whose sessions default to other settings.

**On PGlite**, transactions run one at a time, and Kysely's PGlite dialect passes no isolation level
on; with nothing running beside a transaction, its level has nothing to change.

## Documentation

- [SPEC section 18](https://github.com/netvark/netvark/blob/main/docs/resource/SPEC.md): the
  runtime's contract, its boot checks, its failures, and the outbox
- [DESIGN](https://github.com/netvark/netvark/blob/main/docs/resource/DESIGN.md): what the resource
  family builds and why
- [ADR 0012](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0012-the-runtime-runs-declarations-over-the-storage-contract.md):
  the runtime's decisions

## License

[MIT](./LICENSE)
