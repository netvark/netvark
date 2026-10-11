# keyset: keyset pagination for PostgreSQL

Keyset pagination for PostgreSQL in TypeScript, as two packages:

| Package                                                  | What it is                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@netvark/keyset-core`](../../packages/keyset-core)     | The database-free core: a definition of what a collection can sort, filter, and search on; a planner that turns a request into a query plan; HMAC-signed cursors bound to the request; page assembly with `prev` and `next`. Functions over plain values, web standards only; runs on Node, Bun, Deno, and Cloudflare Workers. No dependencies. |
| [`@netvark/kysely-keyset`](../../packages/kysely-keyset) | The [Kysely](https://kysely.dev) adapter: `createDefineKeyset<DB>()` checks every table and column name of a definition against your `DB` interface, and `paginate` renders the plan onto your own select query and runs it. Re-exports the core in full, so a Kysely application imports from one package.                                     |

Declare once what a collection can sort, filter, and search on; the request type, the validation,
the seek predicate, the cursors, and the SQL all follow from the definition. The page semantics are
those of the JSON:API
[Cursor Pagination profile](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/)
(`page[size]`, `page[after]`, `page[before]`, `prev` and `next` that are `null` when there is no
page, range requests, `rangeTruncated`), and every choice the profile leaves open is written down in
[`docs/keyset/SPEC.md`](SPEC.md).

## Install

```bash
pnpm add @netvark/kysely-keyset kysely   # Kysely applications (pulls in @netvark/keyset-core)
pnpm add @netvark/keyset-core             # another query builder, a driver, a client
```

Node 22.12+, Bun, Deno, and Cloudflare Workers are supported. `@netvark/kysely-keyset` has
`kysely >= 0.28` as its peer dependency and targets PostgreSQL 14+ (and PGlite). CI runs the unit
suites on Node 22 and 24, the adapter's tests on Kysely 0.28, the end-to-end suite on PGlite, on
node-postgres, and on PostgreSQL 14 and 18 servers, and a smoke test of both packages on Bun, Deno,
and workerd.

## Quick start with Kysely

```ts
import type { DB } from './db'; // your Kysely database interface

import { createDefineKeyset } from '@netvark/kysely-keyset';

// keysets/define.ts: one definer for the whole application, holding what every keyset shares.
export const defineKeyset = createDefineKeyset<DB>({
  cursor: { secret: env.CURSOR_SECRET }, // at least 32 bytes; see Best practices
  page: { default: 20, max: 100 },
});

export const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text', collation: 'insensitive' },
    age: { column: 'age', type: 'integer', nullable: true },
    status: { column: 'status', type: 'enum', values: ['lead', 'customer'] },
    createdAt: { column: 'created_at', type: 'timestamptz' },
    emailCount: { aggregate: { relation: 'emails', fn: 'count' }, type: 'bigint' },
  },
  relations: {
    emails: {
      table: 'contact_emails',
      on: { contact_id: 'id' },
      fields: { email: { column: 'email', type: 'text' } },
    },
  },
  search: { columns: ['name', 'bio'] },
  sort: { default: ['-createdAt'] },
});
```

```ts
const page = await contacts.paginate(
  db.selectFrom('contacts').select(['id', 'name', 'created_at']),
  {
    sort: ['-createdAt'],
    filter: {
      and: [
        { field: 'status', op: 'eq', value: 'customer' },
        { field: 'emails.email', op: 'endsWith', value: '@example.com' },
      ],
    },
    search: 'ada',
    page: { size: 25, after: query.page.after },
  },
  { total: true },
);

page.rows; // Array<{ id: string; name: string; created_at: Date }>: your selection, untouched
page.next; // the page[after] cursor of the next page, or null
page.prev; // the page[before] cursor of the previous page, or null
page.total; // the rows the filter and search select, when asked for
page.cursor(row); // the cursor that falls on a row of this page
```

The SQL it ran, with the cursor's values bound as parameters:

```sql
select "id", "name", "created_at",
  cast("contacts"."created_at" as text) as "keyset0",
  cast("contacts"."id" as text) as "keyset1"
from "contacts"
where (("contacts"."status" = $1
    and exists (select 1 as "one" from "contact_emails"
                where "contact_emails"."contact_id" = "contacts"."id"
                  and "contact_emails"."email" like $2))
    and to_tsvector('simple', concat_ws(' ', "contacts"."name", "contacts"."bio"))
        @@ websearch_to_tsquery('simple', $3))
  and ("contacts"."created_at" <= $4
    and ("contacts"."created_at" < $5
      or ("contacts"."created_at" = $6 and "contacts"."id" > $7)))
order by "contacts"."created_at" desc, "contacts"."id" asc
limit $8
-- ["customer", "%@example.com", "ada", "2024-01-09 10:00:00+00", "2024-01-09 10:00:00+00", "2024-01-09 10:00:00+00", "2a1b…", 26]
```

A request that sorts on `bio`, filters `age` with `contains`, asks for 500 rows, or sends a cursor
issued under another sort is rejected before any query runs, with a typed error that says what was
wrong.

## Quick start anywhere else

The core is the same library without the SQL: it plans, you render, it assembles the page.

```ts
import { defineKeyset } from '@netvark/keyset-core';

const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    createdAt: { column: 'created_at', type: 'timestamptz' },
  },
  cursor: { secret: env.CURSOR_SECRET },
});

const plan = await contacts.plan({ sort: ['-createdAt'], page: { size: 25, after } });
// plan.keys: [{ alias: 'keyset0', target: { kind: 'column', column: 'created_at', ... }, direction: 'desc', nulls: null, nullable: false }, ...]
// plan.filter, plan.seek: predicate trees to render; plan.limit: 26

const rows = await runYourQuery(plan); // select ..., cast(created_at as text) as keyset0, cast(id as text) as keyset1
const page = await contacts.page(plan, rows, (row) => [row.keyset0, row.keyset1]);
```

Both quick starts answer with the same `Page`, and the cursors they issue are interchangeable.

## What you get

- **One definition per collection.** `defineKeyset` fixes the fields and their types, the relations,
  the aggregates, the search, the key, the default sort, the page bounds, and the cursor secret.
  Planning, cursors, and SQL all read from it; a mistake in it is a `TypeError` at startup. With
  `createDefineKeyset<DB>()`, every table and column name is checked against your Kysely interface.
- **Shared options in one place.** `createDefineKeyset(defaults)` holds the cursor secret, the page
  bounds, and the search configuration your keysets share, merged under every definition option by
  option, so a secret rotation is one edit.
- **Keyset pagination that survives the hard cases.** Equal sort values, `NULL`s in sort columns,
  backward pages, microsecond timestamps, and sorts over aggregates of related rows all walk forward
  and backward without skipping or repeating a row. The end-to-end suite proves it on PGlite,
  node-postgres, and PostgreSQL servers.
- **Cursors a client cannot forge or misuse.** Signed with HMAC-SHA256, bound to the sort, filter,
  and search they were issued for and, when you pass one, to a context such as the tenant;
  versioned, with optional expiry and secret rotation.
- **Typed requests, typed errors.** `sort` accepts only sortable fields, `filter` only declared
  fields and relation paths with the operators their types allow; values are checked by type; every
  problem is a `KeysetError` with a stable `code` and the detail in fields, never in the message.
- **Nothing reaches SQL that the definition did not declare.** Identifiers come from the definition,
  values are bound parameters, and the one literal (the text search configuration) is validated
  against PostgreSQL's name syntax.

The package READMEs walk through each area:
[`@netvark/keyset-core`](../../packages/keyset-core/README.md) for the definition, the request, the
plan, the page, the cursors, and the errors;
[`@netvark/kysely-keyset`](../../packages/kysely-keyset/README.md) for the typed definer and its
shared defaults, `paginate`, the SQL it renders, and the best practices for secrets, indexes,
totals, and `CamelCasePlugin`.

## Documentation

- [`docs/keyset/DESIGN.md`](DESIGN.md): what the packages are, the principles, and the API by
  example
- [`docs/keyset/SPEC.md`](SPEC.md): the normative contract, section by section, with the tests that
  prove it
- [`docs/keyset/adr/`](adr): the decisions, including every choice the profile leaves to the server
- [`CONTRIBUTING.md`](CONTRIBUTING.md): the family's contribution guide; setup, gates, and releases
  are in the root [`CONTRIBUTING.md`](../../CONTRIBUTING.md)

## Why

Offset pagination drifts under writes and gets slower with every page. Hand-written keyset
pagination is usually right on the happy path and wrong on ties, nulls, backward pages, and
precision, and its cursors are usually base64 of whatever the last row had, which a client can edit
or replay under another sort. @netvark/keyset-core takes the position that the definition is the
contract and the profile and the PostgreSQL manual are the test plan: every rule is cited where it
is implemented and pinned by a test, the adapter's tests assert the exact SQL, and the e2e suite
walks real tables with ties and nulls in both directions on three databases.

## License

MIT
