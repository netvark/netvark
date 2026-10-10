# @netvark/resource-core

One declaration per PostgreSQL table, keyed by its database names and typed by the public catalog
[`@netvark/pg-catalog`](https://www.npmjs.com/package/@netvark/pg-catalog) extracts from your
migrations. A wrong table, column, foreign key, constraint, codec, validator, or scope name fails
`tsc` at the option that holds it, with the reason; the same mistake made from JavaScript throws a
`TypeError` naming its path. Every rule is specified in
[`docs/resource/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/resource/SPEC.md).

Status: in development and unreleased. This line implements the definer and the declaration (SPEC
sections 2 and 3). Derived names, Zod schemas, error codes, `defineCodec` and `defineValidator`,
messages, the `server` subpath, and OpenAPI follow;
[`docs/resource/README.md`](https://github.com/netvark/netvark/blob/main/docs/resource/README.md)
shows where the family is going.

## Install

```bash
pnpm add @netvark/resource-core
pnpm add -D @netvark/pg-catalog @electric-sql/pglite
```

Node 22.12+, Bun, Deno, Cloudflare Workers, and browsers are supported. Nothing in the package
imports a framework, a query builder, a driver, or a Node.js module, and declarations reach browsers
safely because they only ever see the public catalog.

## Quick start

List the tables your API serves in the extraction configuration, and run `pg-catalog extract`:

```ts
// netvark.config.mjs
import { defineExtraction } from '@netvark/pg-catalog';

export default defineExtraction({
  migrations: 'migrations',
  out: {
    catalog: 'catalog.ts',
    public: {
      file: 'public-catalog.ts',
      tables: ['contacts', 'meetings', 'organizations'],
    },
  },
});
```

Configure the definer once, in the module the declarations import:

```ts
// resources/declare-resource.ts
import { createDeclareResource } from '@netvark/resource-core';

import { publicCatalog } from '../public-catalog';

export const declareResource = createDeclareResource({
  catalog: publicCatalog,
  codecs: { timeRange: { types: ['tstzrange'] } },
  validators: { email: {}, lowercase: {}, contactOrNotes: {} },
  scopes: { organization: { column: 'organization_id' } },
  domains: { email: { email_check: { validator: 'email' } } },
  links: { base: '/api' },
  page: { max: 50 },
});
```

Then declare each resource by its table:

```ts
// resources/contacts.ts
import { declareResource } from './declare-resource';
import { Organizations } from './organizations';

export const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  scope: 'organization',
  fields: {
    kind: { access: 'immutable', filter: ['eq', 'in'] },
    name: { access: 'readWrite', filter: ['eq', 'startsWithi'], sort: true },
    email: { access: 'readWrite', filter: ['eq'] },
    created_at: { access: 'read', filter: ['gte', 'lt'], sort: true },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read', include: true },
  },
  search: { column: 'search', config: 'simple', mode: 'websearch' },
  sort: { default: ['name', { field: 'created_at', direction: 'desc' }] },
  rules: { contacts_email_unique: { code: 'CONTACT_EMAIL_TAKEN' } },
});

Contacts.table; // 'contacts'
Contacts.declaration.fields.name.sort; // true, frozen as given
```

Until `defineCodec` and `defineValidator` land, a codec is `{ types }`, the catalog types it
accepts, and a validator is any object; only their names are checked against the declarations.

## What `tsc` checks

| Option          | Rule                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `catalog`       | the public catalog (`toPublicCatalog`), never the full one                                                                                                                     |
| `table`         | a table of the public catalog, with a single-column primary key whose type can carry a resource id (not `json` or `jsonb`)                                                     |
| `fields`        | columns of the table, other than the primary key, a foreign-key column, the scope column, and a `tsvector`                                                                     |
| `access`        | what the column allows (a generated column and an identity `ALWAYS` column are `read`, an identity `BY DEFAULT` column is `read` or `immutable`) and what the operations write |
| `codec`         | a codec of the definer that accepts the column's type; a column without a wire form, such as `tstzrange` or `bytea`, needs one                                                 |
| `relationships` | single-column foreign keys to the primary key of a public table, of a type that can carry a resource id; the scope column is `read` only                                       |
| `operations`    | non-empty, without repeats; `update` needs a member writable on update                                                                                                         |
| `scope`         | a scope of the definer whose column the table has                                                                                                                              |
| `clientIds`     | a primary key that accepts a client value: not a generated column and not an identity `ALWAYS` column                                                                          |
| `search`        | a `tsvector` column; `config` equals the one the column is generated with, or is given                                                                                         |
| `sort.default`  | fields declared with `sort: true`                                                                                                                                              |
| `rules`         | constraint names and NOT NULL keys (`contacts_name_not_null`); a validator only on a CHECK without a translated rule, and required on every such CHECK over a written column   |
| `domains`       | a validator for each domain CHECK without a rule that a written field reaches, once, in the definer                                                                            |

A member the grammar does not have is an error anywhere: `fields: { name: { sortable: true } }`
fails with `"sortable" is not a member of a field declaration`.

## Reading a compile error

The error sits at the offending option and states the reason, in one of two forms. A requirement is
a property no value has, whose name is the message:

```
Property '"access: immutable needs the create operation"' is missing in type '{ access: "immutable"; }'
```

A key that cannot be declared at all is checked against a message instead of a declaration:

```
Type '{ access: "read"; }' is not assignable to type '"\"fax\" is not a column of contacts"'
```

## JavaScript callers

The definer checks its configuration, and each declaration checks itself, when the module loads.
Every mistake throws a `TypeError` whose message starts with the path, in database names:

```
contacts.fields.nick: "nick" is not a column of contacts
meetings.fields.during: type tstzrange has no wire form; name a codec
people.relationships.team_slug: the foreign key references teams.slug, which is not its primary key
createDeclareResource.catalog: a full catalog; pass the public catalog (toPublicCatalog), since declarations reach browsers
```

Optional members follow JavaScript defaults: `undefined` means absent, and `null` is refused.

## Relationship targets

`target` is a function that returns the declared resource of the referenced table. It is read
lazily, never while modules load, so declarations may reference each other in either order and
across modules, as `Meetings` and `Contacts` do here:

```ts
export const Meetings = declareResource('meetings', {
  operations: ['get'],
  fields: { room: { access: 'read' } },
  relationships: { contact_id: { target: () => Contacts, access: 'read' } },
});
```

Its declared return type is `void` on purpose: TypeScript then infers each declaration without first
inferring its targets, which is what keeps mutual references free of TS7022 (SPEC 3.8).

## Best practices

- **One definer per application.** Create it in one module and export `declareResource` from there.
  The registries live in that call, never in module-level state, so two applications in one process
  cannot collide.
- **Keep the catalog current.** Run `pg-catalog extract --check` in CI: a migration that renames a
  column then fails the build at the declaration that names it, instead of at the first request.
- **Declare inline.** Write the declaration in the `declareResource` call, so each error lands on
  its option. A declaration held in a variable needs `as const`, since `'get'` otherwise widens to
  `string` and the call fails; its errors are then reported at the call.
- **Return targets from arrow functions.** `target: () => Organizations`, never `Organizations`
  itself, which throws `TypeError` at runtime and fails `tsc`.
- **Pick the narrowest access.** `immutable` for values fixed at creation, `read` for columns the
  database or the server sets, `write` only for values clients send but never read back.
- **Key resources by a scalar.** A `uuid`, `int8`, or `text` primary key carries an id; `json` and
  `jsonb` cannot, even though PostgreSQL accepts them as keys. Use `clientIds: true` with a key that
  accepts a client value, such as `uuid default gen_random_uuid()` or an identity `BY DEFAULT`.
- **Cover every CHECK without a rule.** Name the validator in the declaration's `rules`, and a
  domain's once in the definer's `domains`; prefer CHECKs `@netvark/pg-catalog` translates (length,
  range, `IN`, `IS NOT NULL`, simple patterns), which need no code at all.

## Performance

Measured with TypeScript 7.0.2 on declarations generated for every declarable table of two real
schemas, each exposing every column it can, against the packed package (SPEC 15.5). Peak memory is
the median of three runs:

| Catalog            | Declarations | Fields | Relationships | Check time | Peak memory, 1 checker | Peak memory, 4 checkers |
| ------------------ | ------------ | ------ | ------------- | ---------- | ---------------------- | ----------------------- |
| stern              | 111          | 1,183  | 184           | 0.14 s     | 112 MB                 | 188 MB                  |
| GitLab 17.11 slice | 60           | 1,461  | 26            | 0.20 s     | 140 MB                 | 233 MB                  |

- **Checkers.** TypeScript 7 runs 4 checkers by default, each with its own view of the program, and
  every checker recomputes the declarations its files reach, since a relationship's target pulls in
  the target's declaration. On these projects one checker was as fast as four and used about 40
  percent less memory, so a memory-constrained CI runner can pass `--checkers 1`. Pin the same count
  locally and in CI, as the TypeScript team advises, since a different count can in rare cases
  surface order-dependent results. Measure your own project with `tsc --extendedDiagnostics`.
- **For contributors.** Keep the valid path free of error types. A mapped type over unknown members
  is built only when a member is unknown (`KnownMembers`): built for every field, it made the stern
  check take 1.55 s and 874 MB. Messages for keys that cannot be declared come from a separate
  mapped type built only when there is one (`FieldsCheck`): an error branch inside the per-key
  template costs types for every key even when no key takes it, and splitting it out cut the types
  created by about three quarters. Re-run the real-catalog measurement when a check changes shape.

@ref https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/

## Documentation

- [`docs/resource/DESIGN.md`](https://github.com/netvark/netvark/blob/main/docs/resource/DESIGN.md):
  what the family is, the principles, and the API by example
- [`docs/resource/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/resource/SPEC.md): the
  normative contract, section by section, with the tests that prove it
- [`docs/resource/adr/`](https://github.com/netvark/netvark/tree/main/docs/resource/adr): the
  decisions

## License

MIT
