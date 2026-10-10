# @netvark/catalog-core

The PostgreSQL catalog model as TypeScript types, and the pure functions over it. A catalog
describes every table, column, constraint, index, row security policy, enum, and domain of the
schemas you configure, as PostgreSQL itself built them.
[`@netvark/pg-catalog`](https://www.npmjs.com/package/@netvark/pg-catalog) writes one from your
migrations as an `as const` module; this package is what reads it: the types, `toPublicCatalog` for
the browser-safe slice, and `diffCatalogs` to compare two catalogs. Every member and rule is
specified in
[`docs/catalog/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/catalog/SPEC.md).

## Install

```bash
pnpm add @netvark/catalog-core
```

No dependencies. Node 22.12+, Bun, Deno, Cloudflare Workers, and browsers are supported; the package
is plain functions over JSON data and never reads the environment. Install it in libraries and
applications that read a catalog; the extractor, `@netvark/pg-catalog`, re-exports all of it.

## Usage

```ts
import type { Catalog } from '@netvark/catalog-core';

import { diffCatalogs, toPublicCatalog } from '@netvark/catalog-core';

import { catalog } from './generated/catalog'; // written by @netvark/pg-catalog

const model: Catalog = catalog; // a generated literal is assignable to the model

catalog.tables.contacts.columns.email.nullable; // typed as the literal `true`
catalog.enums.contact_kind; // readonly ['person', 'company']

const browserSafe = toPublicCatalog(catalog, ['contacts', 'organizations']);
const { changes } = diffCatalogs(catalog, liveCatalog);
```

Because the generated module is JSON under `as const`, every name, type, and bound is a literal type
that declaration libraries can infer from, and the module imports nothing at runtime.

## The model

| Type            | What it holds                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Catalog`       | `format`, the configured `schemas`, the `extensions` installed into them, and `enums`, `domains`, and `tables` keyed by reference name                                                                  |
| `CatalogTable`  | `schema`, `name`, `comment`, `primaryKey`, and `columns` (in column order), `constraints`, `indexes`, and `rowSecurity`                                                                                 |
| `CatalogColumn` | `type` (`int4`, `varchar`, an enum or domain name), `typeKind`, `array`, `sqlType` (`character varying(320)`), length, precision, scale, collation, nullability, default, identity, generation, comment |
| `Constraint`    | a primary key, unique, foreign key, check, or exclusion constraint, with its columns and PostgreSQL's own `definition`                                                                                  |
| `CatalogIndex`  | the access method, uniqueness, key and `INCLUDE` columns, the partial index predicate, and the definition                                                                                               |
| `RowSecurity`   | whether row security is enabled and forced, and every policy with its command, roles, `USING`, and `WITH CHECK`                                                                                         |
| `CatalogDomain` | the base type with its modifiers, nullability, default, and CHECK constraints                                                                                                                           |
| `Rule`          | what a CHECK constraint states, when it can be read exactly: a length, a numeric range, a set of values, not null, or a pattern                                                                         |

A **reference name** is the object's name in the default schema (the first configured one) and in
`pg_catalog`, and `<schema>.<name>` elsewhere: `contacts`, `int4`, `audit.changes`. Expressions,
definitions, and defaults are PostgreSQL's deparsed text, and a default whose constant a client can
send as text also carries it as `literal` (`'active'::text` has the literal `active`).

## `toPublicCatalog(catalog, tables)`

Returns the slice a browser may see: only the listed tables, and of them only what a form needs:
types, nullability, the default's `literal`, identity, generation kind, and constraints with their
columns and rules. Expressions, definitions, comments, collations, indexes, and row security are
dropped. `enums` and `domains` keep exactly the ones the kept columns use, through domains over
domains. A table the catalog does not hold, or a table listed twice, throws `TypeError` naming it.

## `diffCatalogs(expected, actual)`

Compares two catalogs member by member and returns `{ changes }`, depth first:

```ts
{ kind: 'added', path: ['tables', 'contacts', 'columns', 'notes'], actual: { ... } }
{ kind: 'removed', path: ['tables', 'contacts', 'rowSecurity', 'policies', 'tenant'], expected: { ... } }
{ kind: 'changed', path: ['enums', 'contact_kind'], expected: ['person', 'company'], actual: ['person', 'company', 'team'] }
```

Objects recurse; arrays and scalars compare as whole values. An empty list means the catalogs are
equal, whatever the order of their members. Catalogs of different `format` throw `TypeError`.

## Versioning

`CATALOG_FORMAT` is the shape of the model. A release that changes the shape increments it and is a
major release; a catalog of another format is not comparable, and `@netvark/pg-catalog` asks you to
extract again.

## License

MIT
