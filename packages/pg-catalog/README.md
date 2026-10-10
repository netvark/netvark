# @netvark/pg-catalog

Your PostgreSQL schema as committed TypeScript. It replays your SQL migrations into a fresh database
(PGlite in-process, or a throwaway database on a server), reads PostgreSQL's own catalog, and writes
it as an `as const` module: every table, column, constraint, index, row security policy, enum, and
domain, written deterministically so the file is reviewed with the migration that changed it. Every
choice is specified in
[`docs/catalog/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/catalog/SPEC.md).

## Install

```bash
pnpm add -D @netvark/pg-catalog @electric-sql/pglite
```

Node 22.12+, Bun, and Deno. It depends on [`pg`](https://node-postgres.com) and on
[`@netvark/catalog-core`](https://www.npmjs.com/package/@netvark/catalog-core), which it re-exports
in full. `@electric-sql/pglite` (0.5, PostgreSQL 18) is an optional peer dependency: leave it out
when you extract against a server. The generated files import nothing, so neither package reaches
your application bundle.

## Quick start

```ts
// scripts/catalog.ts: `node scripts/catalog.ts`, or `node scripts/catalog.ts --check` in CI
import { extract } from '@netvark/pg-catalog';

const report = await extract(
  {
    migrations: 'db/migrations',
    database: { pglite: { extensions: ['pg_trgm', 'citext'] } },
    schemas: ['public', 'audit'],
    out: {
      catalog: 'src/generated/catalog.ts',
      public: { file: 'src/generated/public-catalog.ts', tables: ['contacts', 'organizations'] },
    },
  },
  { check: process.argv.includes('--check') },
);

for (const file of report.files) {
  console.log(`${file.status.padEnd(9)} ${file.path}`);
}
if (report.files.some((file) => file.status === 'stale' || file.status === 'missing')) {
  process.exitCode = 1;
}
```

Node 22.18 and later run TypeScript files directly; Bun and Deno always do. Relative paths resolve
against the `cwd` option, which defaults to the working directory.

```ts
import { catalog } from './generated/catalog';

catalog.tables.contacts.columns.status.default;
// { expression: "'active'::text", literal: 'active' }
catalog.tables.contacts.constraints.contacts_organization_id_fkey.references;
// { table: 'organizations', columns: ['id'] }
```

## What it writes

- **`catalog.ts`**: `export const catalog = { ... } as const;`, the full catalog of the configured
  schemas (the model is described in `@netvark/catalog-core`). Expressions and definitions are
  PostgreSQL's own deparsed text; objects that belong to an extension, views, functions, sequences,
  and partitions are left out.
- **`public-catalog.ts`** (with `out.public`): `export const publicCatalog`, the slice of the tables
  you list that a browser may see, without expressions, policies, indexes, or comments.

Both are JSON under `as const`, with keys in a fixed order (code-unit order, columns in table
order), so the same migrations give the same bytes on every machine, and on PostgreSQL 14 to 18.

## Migrations

`migrations` is a directory, relative to `cwd`, or a function returning `{ name, sql }` entries in
the order to run. In a directory:

- When every `.sql` file follows Flyway's naming, `V<version>__<description>.sql` files run by
  version (`V1_10` after `V1_9`) and `R__<description>.sql` files after them; `U` undo files never
  run. Two files with the same version fail.
- Otherwise every `.sql` file runs in natural order of its path (`2_x.sql` before `10_x.sql`), which
  fits dbmate, golang-migrate, and timestamped files. `.down.sql` files are skipped.

Each file runs as one simple-protocol query, which PostgreSQL runs as one implicit transaction. A
failing file stops the extraction with its name, PostgreSQL's message and code, and the line and
column:

```text
migration V8__broken.sql failed at line 2, column 20: type "txt" does not exist (SQLSTATE 42704)
```

## Replay targets

**PGlite** is the default: PostgreSQL 18 in-process, nothing to install or start. Name the contrib
extensions your migrations create; your migrations still run `create extension` themselves:

```ts
database: { pglite: { extensions: ['pgcrypto', 'citext', 'uuid-ossp'] } },
```

A PGlite extension object, such as the export of `@electric-sql/pglite-pgvector`, goes in the same
list.

**A server** when your migrations need an extension PGlite lacks (PostGIS), or to replay on the
exact major you run in production:

```ts
database: { url: () => process.env['CATALOG_DATABASE_URL'] },
```

Extraction creates `netvark_catalog_<random>` from `template0` with UTF-8 encoding, replays into it,
reads it, and drops it, even when a migration fails, so the role needs `CREATEDB`. A function is
called only when the URL is needed.

## Errors

Every failure is a `PgCatalogError` (`isPgCatalogError` narrows it) with a `code`, a message naming
the object or file, and PostgreSQL's error as `cause` where there is one:

| `code`                 | When                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `config_invalid`       | a database URL function returned nothing, or a contrib extension name is malformed          |
| `pglite_missing`       | the PGlite target is used without `@electric-sql/pglite`, or a contrib extension is unknown |
| `migrations_invalid`   | the directory is missing or empty, or two Flyway migrations share a version                 |
| `migration_failed`     | a migration fails during replay                                                             |
| `connection_failed`    | connecting to the server, or creating or dropping the throwaway database, fails             |
| `unsupported_server`   | the server is older than PostgreSQL 14                                                      |
| `unsafe_name`          | an object to be written as a key is named `__proto__`                                       |
| `duplicate_key`        | two objects map to the same key, such as a table `"a.b"` and table `b` of schema `a`        |
| `public_table_unknown` | `out.public.tables` names a table the catalog does not hold                                 |
| `catalog_unreadable`   | `parseCatalogModule` was given a file that is not a catalog module                          |
| `catalog_format`       | `parseCatalogModule` was given a catalog written in another format                          |

## Best practices

- **Commit the generated files, and exclude them from formatters and linters.** Their bytes are what
  `check` compares; a formatter that rewrites their quotes makes every check fail.
- **Run the check in CI.** `extract(config, { check: true })` writes nothing and reports `stale` or
  `missing` when a migration changed and the files were not extracted again.
- **Name every constraint.** `constraint contacts_name_length check (...)` gives the catalog and its
  diffs a stable key; generated names change when a column is renamed.
- **Use `now()`, never `'now'`.** A `'now'` default becomes a constant when the migration runs, so
  every replay writes a different catalog.
- **Create roles idempotently.** Roles belong to the server, so a throwaway database on a shared
  server sees the roles of every earlier replay:
  `do $$ begin create role app_user nologin; exception when duplicate_object then null; end $$;`
- **Keep each file replayable as one transaction.** psql meta-commands and `COPY ... FROM stdin`
  cannot run, and `CREATE INDEX CONCURRENTLY` must be alone in its file.
- **Review the public catalog's diff.** Adding a table to `public.tables` shows its structure to
  every browser; the diff of `public-catalog.ts` is where reviewers see it.

## License

MIT
