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

Status: in development and unreleased. This first slice is the storage adapter's transaction
protocol and scopes; reads and writes, `list`, failure mapping, the domain (`runtime.as(actor)`),
boot checks, and the outbox relay follow in the 0.x line.

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

**Index each scoped table by its scope column first.** Every statement filters on it, so an index on
`(organization_id, ...)` serves both the predicate and the policy.

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
