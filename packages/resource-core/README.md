# @netvark/resource-core

One declaration per PostgreSQL table, keyed by its database names and typed by the public catalog
[`@netvark/pg-catalog`](https://www.npmjs.com/package/@netvark/pg-catalog) extracts from your
migrations. A wrong table, column, foreign key, constraint, codec, validator, or scope name fails
`tsc` at the option that holds it, with the reason; the same mistake made from JavaScript throws a
`TypeError` naming its path. Every rule is specified in
[`docs/resource/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/resource/SPEC.md).

Status: in development and unreleased. This line implements the definer, the declaration, the public
names and codes derived from it, the wire forms and Zod schemas, `defineCodec` and
`defineValidator`, and the boundary fixtures of the `testing` entry (SPEC sections 2 to 7). Field
metadata, the error catalog, messages, the `server` subpath, and OpenAPI follow;
[`docs/resource/README.md`](https://github.com/netvark/netvark/blob/main/docs/resource/README.md)
shows where the family is going.

## Install

```bash
pnpm add @netvark/resource-core zod
pnpm add -D @netvark/pg-catalog @electric-sql/pglite
```

`zod` 4.5 or later is a peer dependency: the first 4.x release whose `.max()` counts code points, as
PostgreSQL's `char_length` does. Schemas from `zod` and `zod/mini` both work.

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

Configure the definer once, in the module the declarations import, with the codecs and validators of
[Codecs and validators](#codecs-and-validators):

```ts
// resources/declare-resource.ts
import { createDeclareResource } from '@netvark/resource-core';

import { publicCatalog } from '../public-catalog';
import { codecs } from './codecs';
import { validators } from './validators';

export const declareResource = createDeclareResource({
  catalog: publicCatalog,
  codecs,
  validators,
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
Contacts.names.fields.get('createdAt'); // 'created_at'
```

## What `tsc` checks

| Option                 | Rule                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `catalog`              | the public catalog (`toPublicCatalog`), never the full one                                                                                                                     |
| `table`                | a table of the public catalog, with a single-column primary key whose type can carry a resource id (not `json` or `jsonb`)                                                     |
| `fields`               | columns of the table, other than the primary key, a foreign-key column, the scope column, and a `tsvector`                                                                     |
| `access`               | what the column allows (a generated column and an identity `ALWAYS` column are `read`, an identity `BY DEFAULT` column is `read` or `immutable`) and what the operations write |
| `codec`                | a codec of the definer that accepts the column's type; a column without a wire form, such as `tstzrange` or `bytea`, needs one                                                 |
| `relationships`        | single-column foreign keys to the primary key of a public table, of a type that can carry a resource id; the scope column is `read` only                                       |
| `operations`           | non-empty, without repeats; `update` needs a member writable on update                                                                                                         |
| `scope`                | a scope of the definer whose column the table has                                                                                                                              |
| `clientIds`            | a primary key that accepts a client value: not a generated column and not an identity `ALWAYS` column                                                                          |
| `search`               | a `tsvector` column; `config` equals the one the column is generated with, or is given                                                                                         |
| `sort.default`         | fields declared with `sort: true`                                                                                                                                              |
| `rules`                | constraint names and NOT NULL keys (`contacts_name_not_null`); a validator only on a CHECK without a translated rule, and required on every such CHECK over a written column   |
| `domains`              | a validator for each domain CHECK without a rule that a written field reaches, once, in the definer                                                                            |
| `codecs`, `validators` | values `defineCodec` and `defineValidator` made, never objects written by hand; each fixture typed by its schema's input                                                       |

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

## Codecs and validators

A column whose type has no wire form, such as `tstzrange`, `bytea`, or pgvector's `vector`, names a
codec: the public schema of its values. A CHECK the catalog cannot translate into a rule names a
validator: its twin in Zod. Both carry fixtures, examples their schema must accept (and, for a
validator, reject), checked when the module loads; without them the call does not compile (SPEC 7,
ADR 0006).

```ts
// resources/codecs.ts

import { z } from 'zod';

import { defineCodec } from '@netvark/resource-core';

const instant = z.iso.datetime({ offset: true });

export const codecs = {
  timeRange: defineCodec({
    types: ['tstzrange'],
    schema: z
      .object({ start: instant, end: instant })
      .refine(({ start, end }) => Date.parse(start) < Date.parse(end)),
    fixtures: [{ start: '2026-03-02T09:00:00Z', end: '2026-03-02T10:30:00Z' }],
  }),
};
```

```ts
// resources/validators.ts: twins of CHECK (room = lower(room))
// and CHECK (contact_id IS NOT NULL OR notes IS NOT NULL)

import { z } from 'zod';

import { defineValidator } from '@netvark/resource-core';

export const validators = {
  lowercase: defineValidator({
    schema: z
      .string()
      .refine((value) => value === value.toLowerCase())
      .nullable(),
    fixtures: { accept: ['lobby-2', null], reject: ['Lobby-2'] },
  }),
  contactOrNotes: defineValidator({
    schema: z
      .object({ contact: z.uuid().nullable(), notes: z.string().nullable() })
      .refine(({ contact, notes }) => contact !== null || notes !== null),
    fixtures: {
      accept: [{ contact: null, notes: 'Bring the signed contract.' }],
      reject: [{ contact: null, notes: null }],
    },
  }),
};
```

A validator's input is what its CHECK sees: the field's value, `null` included when the column is
nullable, or for a CHECK over several columns an object of them by public name, each relationship as
its id. `tsc` checks it where a rule names the validator; had `contactOrNotes` taken the contact as
a linkage, `{ type, id }`, the rule would fail with
`validator: "contactOrNotes" does not accept every object of contact, notes`.

The storage adapter implements the other facet of each codec, typed by
`StorageCodecs<typeof codecs>`: `read` and `write` between the parsed wire value and what the driver
handles.

## Public names

Declarations take database names, and the API speaks public names derived from them (SPEC 4):

| Public name  | Derived from                              | Override                 | Example                                            |
| ------------ | ----------------------------------------- | ------------------------ | -------------------------------------------------- |
| type         | the table's name                          | `as` on the declaration  | `contact_phones`                                   |
| field        | camelCase of the column                   | `as` on the field        | `created_at` is `createdAt`                        |
| relationship | camelCase of the column without its `_id` | `as` on the relationship | `organization_id` is `organization`                |
| error code   | the rule key, upper-cased                 | `code` on the rule       | `contacts_email_unique` is `CONTACTS_EMAIL_UNIQUE` |

camelCase is the conversion of Kysely's `CamelCasePlugin` with its default options, so a field's
public name is the key a camelCase Kysely row already has. Each declared resource holds both
directions in `names`, as `ReadonlyMap`s, so a name from a request never reaches `Object.prototype`:

```ts
Notes.names.fields.get('kind'); // 'type': public name to column
Notes.names.columns.get('contact_id'); // 'contact': column to public name
Notes.names.codes.get('NOTE_PRIORITY_OUT_OF_RANGE'); // 'notes_priorität_check'
```

A derived name JSON:API refuses or two members share needs `as`, and a derived code outside A-Z,
0-9, and `_` needs `code`:

```ts
export const Notes = declareResource('notes', {
  operations: ['list', 'get', 'create', 'update'],
  scope: 'organization',
  fields: {
    type: { access: 'immutable', as: 'kind' }, // every resource object has a type
    contact: { access: 'readWrite', as: 'contactName' }, // contact_id derives contact
    body: { access: 'readWrite' },
    priorität: { access: 'readWrite' },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
    author: { target: () => Contacts, access: 'immutable', as: 'author' }, // no _id to drop
    contact_id: { target: () => Contacts, access: 'readWrite' },
  },
  rules: { notes_priorität_check: { code: 'NOTE_PRIORITY_OUT_OF_RANGE' } }, // Ä is not A-Z
});
```

`tsc` checks the type, every member that gives `as` or whose column could derive a refused or shared
name, and every given code. The other cases cost more to check in types than they catch, so only the
declaration's runtime check, which runs when the module loads, reports them: a derived code outside
the pattern or repeated, a column only a quoted identifier can name (`"suite-"`), and two columns a
Unicode case mapping gives one name (`a_ß` and `a_s_s` both give `aSS`). SPEC 4.2 lists both sides.

## Schemas

Every declared resource carries Zod schemas built from the catalog and the declaration, keyed by
public names (SPEC 5 and 6). A field's schema is its column's wire form, narrowed by its domain, the
CHECKs the catalog translates, its nullability, and its validators:

| Member                                             | Validates                                                                               | Issues           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------- |
| `schema.read`, `schema.create`, `schema.update`    | the attributes of a response, a create, or an update                                    | Zod's            |
| `linkage.read`, `linkage.create`, `linkage.update` | the relationships, each `{ type, id }`, or `null` where the foreign key is nullable     | Zod's            |
| `validate.create`, `validate.update`               | the attributes, as Standard Schema validators                                           | `ResourceIssue`s |
| `write.create`, `write.update`                     | a resource object as `@netvark/jsonapi-core` parses it, `{ attributes, relationships }` | `ResourceIssue`s |

`create` requires exactly the columns PostgreSQL requires on insert, `update` requires none, and
both reject unknown keys. `read` strips unknown keys, so a client that validates responses keeps
working when the server adds a field. No schema fills in a default: defaults stay in the database.

The wire forms refuse what PostgreSQL would refuse or store differently from what was sent: a
decimal with more fraction digits than `numeric(p, s)` keeps, trailing spaces past `varchar(n)`, a
date-time with nonzero digits past its column's precision, U+0000, and an unpaired surrogate. `int8`
and `numeric` values travel as decimal strings, since they exceed JavaScript's exact integers (SPEC
5.2).

Only `write` sees attributes and relationships together, so a CHECK over a field and a foreign key
runs there. With the validators of [Codecs and validators](#codecs-and-validators):

```ts
export const Meetings = declareResource('meetings', {
  operations: ['get', 'create', 'update'],
  scope: 'organization',
  clientIds: true,
  fields: {
    room: { access: 'readWrite' },
    during: { access: 'readWrite', codec: 'timeRange' },
    notes: { access: 'readWrite' },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
    contact_id: { target: () => Contacts, access: 'readWrite' },
  },
  rules: {
    meetings_room_lowercase: {
      validator: 'lowercase',
      code: 'MEETING_ROOM_NOT_LOWERCASE',
    },
    meetings_contact_or_notes: {
      validator: 'contactOrNotes',
      code: 'MEETING_NEEDS_CONTACT_OR_NOTES',
    },
  },
});

const result = await Meetings.write.create['~standard'].validate({
  attributes: { room: 'Lobby-2', notes: null },
  relationships: { contact: null },
});
// result.issues, each with message 'The value violates a constraint.' or
// 'A value is required.':
// { path: ['attributes', 'room'], code: 'MEETING_ROOM_NOT_LOWERCASE' }
// { path: ['attributes', 'during'], code: 'required' }
// { path: ['relationships', 'contact'], code: 'MEETING_NEEDS_CONTACT_OR_NOTES' }
// { path: ['attributes', 'notes'], code: 'MEETING_NEEDS_CONTACT_OR_NOTES' }
```

A `ResourceIssue` names a JSON Schema keyword (`required`, `maxLength`, `enum`, ...) or a
constraint's code, carries the limit in `expected`, and has a constant English message that never
repeats request data (SPEC 6.4). `Infer` gives the types of all six schemas:

```ts
import type { Infer } from '@netvark/resource-core';

type NewContact = Infer<typeof Contacts>['create'];
// kind?: 'person' | 'company', the enum's labels; name: string, required on insert

type MeetingLinks = Infer<typeof Meetings>['linkage']['create'];
// { contact?: { type: 'contacts'; id: string } | null }
```

## Testing at the limits

`boundaryFixtures(resource)`, from `@netvark/resource-core/testing`, lists for each field and
relationship the wire values at and next to each of its limits, each with a label: the empty string,
`maxLength 200, plus one`, `upper bound 5`, an unpaired surrogate, a seventh fraction digit. They
are what this package's oracle writes into PostgreSQL 14 and 18, whose verdicts the schemas match
(SPEC 15.3). Snapshot the verdicts, so a migration that changes a limit shows up in review as the
verdicts it flips:

```ts
import { expect, it } from 'vitest';

import { boundaryFixtures } from '@netvark/resource-core/testing';

import { Contacts } from './contacts';

it('keeps the limits of contacts', () => {
  const updatable = Contacts.schema.update.shape;
  const limits = Object.entries(boundaryFixtures(Contacts).fields)
    .filter(([field]) => Object.hasOwn(updatable, field))
    .flatMap(([field, fixtures]) =>
      fixtures.map(({ value, label }) => {
        const { success } = Contacts.schema.update.safeParse({ [field]: value });
        return `${field}: ${success ? 'accepts' : 'refuses'} ${label}`;
      }),
    );
  expect(limits).toMatchSnapshot(); // 'name: refuses maxLength 200, plus one', ...
});
```

In an integration test, write the accepted values through your storage adapter and read them back:
each must come back as the same value, compared per type as SPEC 15.3 does, so a driver that changes
a value fails at the fixture that shows it, such as a `timestamptz` parsed into a `Date`, which
keeps only milliseconds.

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
- **Name foreign keys `<thing>_id`.** The relationship is then `<thing>` without `as`. Keep `type`,
  `id`, and `lid` for the members JSON:API gives them, and rename such a column with `as` (`kind`).
- **Give codes to the errors clients handle.** A derived code follows the constraint's name, which
  PostgreSQL generates from the columns unless the migration names it; `code: 'CONTACT_EMAIL_TAKEN'`
  stays put when a migration renames the constraint. Name constraints in ASCII, or give `code`: a
  CHECK on `größe` is named `notes_größe_check`, whose code is not A-Z.
- **Review names as API changes.** Snapshot `names` in a test, so a migration that renames a column
  shows up in review as the public name it changes.
- **Write fixtures at the edges.** A fixture is an example and a test: give the boundary values, the
  empty string, and `null` where the column allows it. A CHECK passes `NULL`, so the validator of a
  nullable column must accept `null`. `pg-catalog rules --check` will run every fixture through the
  database, so a regular expression or a case rule that disagrees with PostgreSQL shows up there.
- **Keep validators to what PostgreSQL agrees on.** `lower()` beyond ASCII follows the database's
  `LC_CTYPE`, and a regular expression's dialect differs in places; choose fixtures inside the
  shared ground, and prefer a CHECK the catalog translates.
- **Type a validator's input as what its CHECK sees.** The field's value, with `null` when the
  column is nullable; for a CHECK over several columns, an object of them by public name, each
  relationship as its id. One CHECK over different columns needs its own validator.
- **Keep schemas synchronous.** A check that needs the database or another service belongs in server
  code, not in a validator.
- **Validate a whole write with `write`.** On the server, pass the resource object
  `@netvark/jsonapi-core` parsed to `write.create` or `write.update`: only they run the CHECKs over
  a field and a relationship, and their issue paths start at `attributes` or `relationships`.
- **Validate responses with `read`.** It strips members it does not know, so a deployed client keeps
  working when the server adds one. For a sparse fieldset, validate with `schema.read.pick(...)` of
  the requested members.
- **Send date-times at the column's precision.** A `timestamp(3)` column refuses a fourth nonzero
  fraction digit rather than let PostgreSQL round it, possibly into the next day; zeros past the
  precision are accepted. `toISOString()` writes milliseconds, so clear them for a `timestamptz(0)`
  column.
- **Keep `int8` and `numeric` values as strings.** Parse them with `BigInt` or a decimal library
  only to compute, and send the canonical spelling: `0.5`, not `.5`, `+0.5`, or `5e-1`.
- **Cover every CHECK without a rule.** Name the validator in the declaration's `rules`, and a
  domain's once in the definer's `domains`; prefer CHECKs `@netvark/pg-catalog` translates (length,
  range, `IN`, `IS NOT NULL`, simple patterns), which need no code at all.

## Performance

Measured with TypeScript 7.0.2 on declarations generated for every declarable table of two real
schemas, each exposing every column it can, against the packed package (SPEC 15.5). Times and peak
memory are medians of at least five runs:

| Catalog            | Declarations | Fields | Relationships | Check time | Peak memory, 1 checker | Peak memory, 4 checkers |
| ------------------ | ------------ | ------ | ------------- | ---------- | ---------------------- | ----------------------- |
| stern              | 111          | 1,183  | 184           | 0.18 s     | 135 MB                 | 223 MB                  |
| GitLab 17.11 slice | 60           | 1,461  | 26            | 0.25 s     | 156 MB                 | 280 MB                  |

The names checks account for about 15 percent of the stern check time and 11 percent of the GitLab
one. Codecs, validators, and schemas add 1.4 and 4.8 percent instantiations and about 10 MB of peak
memory, most of it to parse Zod's own declarations.

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
  created by about three quarters. Compute what depends on the catalog alone per table, so
  TypeScript caches it: the names check examines only the members a table's name risk holds, which
  took its first version from 3 and 6.5 times the cost of the other checks to 15 and 9.5 percent
  more instantiations. Name every union of template literal types with an alias: TypeScript 7
  instantiates an inline union in a conditional's `extends` clause again on every evaluation, at 4
  to 7 times the cost. Re-run the real-catalog measurement when a check changes shape.

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
