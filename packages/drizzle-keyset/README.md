# @netvark/drizzle-keyset

Keyset pagination for [Drizzle ORM](https://orm.drizzle.team) on PostgreSQL. The page semantics are
those of the JSON:API
[Cursor Pagination profile](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/); every
rule is a cited clause of the profile or the PostgreSQL manual, and every choice the profile leaves
open is written down in
[`docs/keyset/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/keyset/SPEC.md).

This is the Drizzle adapter of
[`@netvark/keyset-core`](https://github.com/netvark/netvark/tree/main/packages/keyset-core#readme),
the database-free core. Everything the core exports is re-exported here, so an application imports
from one package. What this package adds is the two render functions that turn the core's plan into
Drizzle `sql` over your schema's tables and columns.

## Install

```bash
pnpm add @netvark/drizzle-keyset drizzle-orm
```

`drizzle-orm >=0.45.2 <1.0.0` is the peer dependency. 0.45.2 is the release that escapes quotes
inside identifiers (CVE-2026-39356), and 1.0 is still a release candidate. The adapter targets
PostgreSQL 14+ and PGlite through any Drizzle PostgreSQL driver. Node 22.12+, Bun, Deno, and
Cloudflare Workers are supported.

## Rendering the plan

`renderTarget(target, context)` and `renderPredicate(node, context)` return Drizzle `SQL` for the
targets and predicates of a plan the core made (`keyset.plan(request)`). The context names your
schema object and the definition's table. A definition names tables by their keys in the schema and
columns by their properties, as your code does:

```ts
import { defineKeyset, renderPredicate } from '@netvark/drizzle-keyset';

import * as schema from './schema'; // your Drizzle tables: contacts.lastName is text('last_name')

const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    lastName: { column: 'lastName', type: 'text', collation: 'insensitive', nullable: true },
  },
  cursor: { secret: env.CURSOR_SECRET },
});

const plan = await contacts.plan({
  filter: { field: 'lastName', op: 'startsWithi', value: 'Love' },
});
const where = plan.filter && renderPredicate(plan.filter, { schema, table: 'contacts' });
// "contacts"."last_name" ilike $1, binding 'Love%'
```

Drizzle prints the names: a column declared without one (`lastName: text()`) gets the database's
`casing`, and a table of a `pgSchema` prints with its schema. Every value is a bound parameter, an
array one parameter of its own. The text search configuration is the one literal, checked against
PostgreSQL's name syntax when it is printed.

Every column reference is its own nested `sql` chunk. In a query over one table, Drizzle prints a
column directly inside a selected expression without its table; nested one level deeper, it keeps
it. So a correlated aggregate stays correct where you select it:

```sql
select "id", (select count(*) as "value" from "contact_emails"
  where "contact_emails"."contact_id" = "contacts"."id") from "contacts"
```

A name the schema does not hold is a `TypeError`. A plan made from a definition over the same schema
never has one.

## Documentation

- [`docs/keyset/DESIGN.md`](https://github.com/netvark/netvark/blob/main/docs/keyset/DESIGN.md):
  what the packages are, the principles, and the API by example
- [`docs/keyset/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/keyset/SPEC.md): the
  normative contract, section by section, with the tests that prove it; section 14 is this adapter
- [`docs/keyset/adr/`](https://github.com/netvark/netvark/tree/main/docs/keyset/adr): the decisions,
  ADR 0017 among them for this adapter

## License

MIT
