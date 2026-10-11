# @netvark/resource-core

One declaration per PostgreSQL table, keyed by its database names and typed by the public catalog
[`@netvark/pg-catalog`](https://www.npmjs.com/package/@netvark/pg-catalog) extracts from your
migrations. A wrong table, column, foreign key, constraint, codec, validator, or scope name fails
`tsc` at the option that holds it, with the reason; the same mistake made from JavaScript throws a
`TypeError` naming its path. Every rule is specified in
[`docs/resource/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/resource/SPEC.md).

Status: in development and unreleased. This line implements the definer, the declaration, the public
names and codes derived from it, the wire forms and Zod schemas, `defineCodec` and
`defineValidator`, the boundary fixtures of the `testing` entry (SPEC sections 2 to 7), and the
derived error codes with `errorCatalog` (SPEC 9.1 and 9.2), field metadata (SPEC 8), and messages
with their localization (SPEC 10). `forbiddenMembers`, the `server` subpath, and OpenAPI follow;
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
| `rules`                | constraint names and NOT NULL keys (`contacts_name_not_null`); a validator only on an enforced CHECK without a rule, and required on every such CHECK over a written column    |
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

## Field metadata

`fields` describes each public field and relationship for forms, documentation, and clients (SPEC
8). It is keyed by public name, the fields and then the relationships, frozen, and read from the
specs the schemas are built from, so what it states is what the schemas enforce:

```ts
const { name, kind, createdAt, organization } = Contacts.fields;

name.required; // true: NOT NULL without a default, so a create carries it
name.limits; // { minLength: 1, maxLength: 200, minimum: null, ..., patterns: [] }
name.filter; // ['eq', 'startsWithi'], typed as that tuple
kind.options; // ['person', 'company'], typed ReadonlyArray<'person' | 'company'>
kind.default; // { literal: 'person' }: a create may leave it out
createdAt.format; // 'date-time', with fractionDigits 6 and access 'read'
organization.wire; // 'string': a relationship describes its id, here an int8 key's
organization.limits.maximum; // '9223372036854775807', a decimal string
```

An array states its elements in `items`; a `json` column or a codec's value is `wire: 'any'`,
described by the JSON value or by the codec's schema; a relationship to a `bool` key lists the ids
`['true', 'false']` as its options. A validator states nothing here, and neither does a CHECK over
several columns, a unique constraint, or a foreign key: a value the metadata admits can still be
refused, so the server stays the authority. Over the oracle's columns and two real schemas, a client
that follows `fields` alone sent only what PostgreSQL stores as sent, and every value one step past
a stated limit was refused or changed (SPEC 15.4, 15.5).

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

## Errors

Each declared resource carries the error codes clients can cause, derived from its constraints (SPEC
9.1): one per constraint over a member, per NOT NULL member an operation writes, per CHECK of a
domain a member passes, and for the primary key with `clientIds`. An entry holds the status and
title the error renders with, the constraint's kind, and the public members it points at:

```ts
Contacts.errors.CONTACT_EMAIL_TAKEN;
// { status: 409, title: 'Conflict', kind: 'unique', fields: ['email'] }
Contacts.errors.CONTACTS_NAME_NOT_NULL;
// { status: 422, title: 'Invalid Attribute', kind: 'notNull', fields: ['name'] }
Contacts.errors.EMAIL_CHECK; // the email domain's CHECK
// { status: 422, title: 'Invalid Attribute', kind: 'check', fields: ['email'] }
```

The scope column is never a member. `contacts_email_unique` covers `(organization_id, email)` and
the server writes `organization_id`, so the code points at `email`, and the scope's foreign key has
no code at all.

A unique index counts as a constraint. PostgreSQL reports its violation under the index's name, and
the public catalog lists each unique index that no constraint backs among the constraints, partial
or not, so its code follows the same rules and takes `code` like any rule key:

```ts
// create unique index contacts_active_name_unique on contacts (organization_id, name)
//   where status = 'active';
rules: { contacts_active_name_unique: { code: 'CONTACT_NAME_TAKEN' } },

Contacts.errors.CONTACT_NAME_TAKEN;
// { status: 409, title: 'Conflict', kind: 'unique', fields: ['name'] }
```

An index over an expression, such as `lower(email)`, is not in the public catalog and has no code.
Neither has a NOT ENFORCED CHECK or foreign key, which PostgreSQL never raises; `code` on its key
fails `tsc`, and the foreign key still declares a relationship.

`errorCatalog` assembles the codes of the resources the application serves, resource-core's
`QUOTA_EXCEEDED`, and the application's own codes into one `@netvark/ban-core` catalog fragment. It
checks the list as a registry (SPEC 4.2): each type once, each code from one constraint and taken by
neither `@netvark/ban-core`, `@netvark/jsonapi-core`, nor the application, and each relationship's
target in the list.

```ts
// errors.ts
import { createBan } from '@netvark/ban-core';
import { ERROR_CATALOG } from '@netvark/jsonapi-core';
import { errorCatalog } from '@netvark/resource-core';

import { Contacts } from './resources/contacts';
import { Meetings } from './resources/meetings';
import { Organizations } from './resources/organizations';

const catalog = errorCatalog([Organizations, Contacts, Meetings], {
  SEAT_LIMIT: { status: 402, title: 'Seat Limit' },
});
export const ban = createBan({ errors: { ...ERROR_CATALOG, ...catalog } });

ban.error('CONTACT_EMAIL_TAKEN'); // every derived code is a key
```

A conflict throws one `TypeError` that lists them all. A duplicate code names each constraint behind
it, so the message says where `code` goes:

```
errorCatalog: code SHORT_TEXT_CHECK is derived by organizations from domain short_text.short_text_check and by contacts from contacts.contacts_name_check, so all but one need a code
```

`tsc` reports a relationship whose target the list leaves out at that resource in the list, with the
same message as the runtime.

## Messages and localization

resource-core decides which message an error object needs and with which inputs; your i18n library
holds the texts and picks the locale (ADR 0009). Every message is a function: a title or a label
takes no inputs, a detail takes its kind's inputs. [Paraglide JS](https://paraglidejs.com) message
functions fit as the compiler emits them:

```ts
// messages.ts
import { defineMessages } from '@netvark/resource-core';

import { APP_ERRORS } from './errors';
import { m } from './paraglide/messages.js';
import { Contacts } from './resources/contacts';
import { Organizations } from './resources/organizations';

export const messages = defineMessages([Organizations, Contacts], APP_ERRORS, {
  errors: {
    NOT_FOUND: { title: m.not_found_title, detail: m.not_found_detail },
    // every code of @netvark/jsonapi-core, QUOTA_EXCEEDED, and every code of APP_ERRORS
  },
  constraints: {
    unique: { title: m.conflict, detail: m.unique_detail }, // ({ field, fields })
    // every constraint kind the resources have
  },
  validation: {
    maxLength: m.max_length, // ({ field, limit })
    enum: m.one_of, // ({ field, values })
    // all thirteen issue kinds
  },
  fields: { contacts: { name: m.contact_name, createdAt: m.created_at /* every member */ } },
  options: { contacts: { kind: { person: m.kind_person, company: m.kind_company } } },
});
```

A missing code, constraint kind, issue kind, member label, or option label fails `tsc`, and so does
an unknown key. Paraglide types each message with its variables across all locales, so a translation
that uses a variable its kind does not receive fails the build too, in any locale. A derived code
needs no entry, since its constraint kind's texts cover it; add one to `errors` only to override
them. A detail receives:

| Detail                                                                                               | Inputs                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| every detail                                                                                         | `field`: the label of the member the item points at, `id`, or empty |
| a constraint kind's, a derived code's                                                                | `fields`: the labels of the constraint's members, joined with `, `  |
| `minLength`, `maxLength`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` | `limit`: the limit                                                  |
| `enum`                                                                                               | `values`: the labels of the allowed options, joined with `, `       |
| `format`, `type`                                                                                     | `format`, `type`: the expected format or type                       |

`field` never holds a member name the request invented: a member the type does not have has no
label. `localizeErrors` turns the messages into the `transform` of the ban handler. With Paraglide,
run `paraglideMiddleware` around `next()`, so the error handler renders in the locale it resolved,
and name that locale in the response:

```ts
// app.ts
import type { Context } from 'hono';

import { Hono } from 'hono';

import { localizeErrors } from '@netvark/resource-core';

import { ban } from './errors'; // createBan from @netvark/hono-ban
import { messages } from './messages';
import { getLocale } from './paraglide/runtime.js';
import { paraglideMiddleware } from './paraglide/server.js';

export const app = new Hono();

app.use('*', async (c, next) =>
  paraglideMiddleware(c.req.raw, async () => {
    await next();
    return c.res;
  }),
);

const handle = ban.onError({
  // The type whose labels name the members; annotate `c` when written inline.
  transform: localizeErrors(messages, {
    resource: (c: Context) => c.req.path.split('/')[1],
  }),
});

app.onError(async (error, c) => {
  const response = await handle(error, c);
  response.headers.set('Content-Language', getLocale());
  response.headers.append('Vary', 'Accept-Language');
  return response;
});
```

```jsonc
// POST /contacts with Accept-Language: de and "kind": "robot": one object of the 422 response,
// which carries Content-Language: de
{
  "status": "422",
  "code": "VALIDATION_FAILED",
  "title": "Validierung fehlgeschlagen",
  "detail": "Art muss einer dieser Werte sein: Person, Firma.",
  "source": { "pointer": "/data/attributes/kind" },
  "meta": { "code": "enum", "expected": "[\"person\",\"company\"]" },
}
```

`localizeErrors` replaces titles and details only; codes, statuses, pointers, and `meta` stay, so
clients keep matching on codes. An object whose code has no texts passes through, and a message that
throws makes the handler answer 500 and report it. Without an i18n library,
`defaultMessages(resources, appErrors)` gives complete English messages, whose issue messages are
the ones the schemas already produce.

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
- **Express uniqueness over columns.** A unique index derives its code from its name, as a
  constraint does, so name it like one. An index over an expression has no code: prefer a `citext`
  column with a plain UNIQUE to a unique index on `lower(email)`, or map the index by name with
  `postgresMapper`'s `constraints`.
- **Pass `errorCatalog` the registry you serve.** Give it the same list of resources the server and
  the OpenAPI document take, so its checks cover every code and relationship a client can reach.
- **Keep derived codes unique.** A code is the constraint's name upper-cased, without its table, so
  two tables that share a CHECK name, as tables copied from one another do, derive one code twice.
  `errorCatalog` names both constraints; give `code` on one, or name constraints after their table.
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
- **Build forms from `fields`, validate with the schemas.** Mark a member required by `required`,
  never by `nullable`: a NOT NULL column with a default may be left out. Render `options` as a
  choice, cap input at `maxLength`, and offer date-times at `fractionDigits`. Then validate the
  whole write with `write.create` or `write.update`, which also run the validators and the CHECKs
  over several members that `fields` does not describe.
- **Compare numeric bounds as decimals.** `minimum`, `maximum`, and `multipleOf` are decimal strings
  for every number type, since an `int8` or `numeric` bound exceeds JavaScript's numbers. Compare
  with `BigInt` or a decimal library, not `Number(...)`.
- **Test every pattern in script.** A value must contain a match of each entry of `patterns`, read
  as `new RegExp(source, 'su')`. Do not copy one into an HTML `pattern` attribute, which the browser
  anchors to the whole value and compiles with the `v` flag and without `s`, so it can accept or
  refuse otherwise
  ([HTML](https://html.spec.whatwg.org/multipage/input.html#the-pattern-attribute)).
- **Show `default`, never send it.** It is the value PostgreSQL applies when a create leaves the
  member out: show `literal` as a placeholder, and leave the member out to get it. An expression
  default such as `now()` has `literal: null`.
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
- **Localize with your i18n library, by kind first.** One message per issue kind and per constraint
  kind covers every resource; override a derived code in `errors` only where the generic sentence is
  not good enough. Reference each Paraglide message directly (`maxLength: m.max_length`), never as
  `m[key]`, so unused ones are tree-shaken and `inlang check` sees which are used; write plurals as
  variants on `limit`, never as two messages. Run `inlang check` in CI next to `tsc`.
- **Name the locale and what chose it.** Set `Content-Language` from `getLocale()` on every error
  response and add `Vary` for the request fields Paraglide's strategies read (`Accept-Language` for
  `preferredLanguage`, `Cookie` for `cookie`), so caches keep one response per language.
- **Pass `resource` to `localizeErrors`.** Member labels belong to a type, so without it no detail
  can name the member. Return the type the request addresses; a type the messages do not label, such
  as a path segment no resource has, names nothing.
- **Enforce in the database what the API enforces.** A NOT ENFORCED CHECK or foreign key
  (PostgreSQL 18) is one the database records but never checks, so the schemas skip it, it takes no
  validator, and it has no error code; rows that break it can be read and saved again unchanged. To
  have clients held to it, enforce it: `ALTER TABLE ... ALTER CONSTRAINT ... ENFORCED` for a foreign
  key, which first checks the existing rows, and for a CHECK, drop it and add it again without
  `NOT ENFORCED`. A rule too costly for the database belongs in server code, with an error of your
  own.

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
memory, most of it to parse Zod's own declarations. A resource's codes are typed only where code
reads them: `errorCatalog` over all of stern's declarations, spread into `createBan`, took the check
from 0.17 s and 129 MB to 0.36 s and 143 MB. `fields` is typed the same way: reading every
declaration's `fields` took stern's check from 0.18 s to 0.35 s, about what reading each one's
`schema.create` output costs. A full `defineMessages` mapping, one function per code, kind, member,
and option, took stern's check from 0.19 s and 124 MB to 0.35 s and 161 MB, and the GitLab slice's,
with 1,302 derived codes, from 0.28 s and 157 MB to 0.67 s and 198 MB.

- **Checkers.** TypeScript 7 runs 4 checkers by default, each with its own view of the program, and
  every checker recomputes the declarations its files reach, since a relationship's target pulls in
  the target's declaration. On these projects one checker was as fast as four and used about 40
  percent less memory, so a memory-constrained CI runner can pass `--checkers 1`. Pin the same count
  locally and in CI, as the TypeScript team advises, since a different count can in rare cases
  surface order-dependent results. Measure your own project with `tsc --extendedDiagnostics`.
- **Type helpers.** Constrain a type parameter that takes a resource by `AnyDeclaredResource`, as
  `Infer` and `ErrorCatalog` do, never by the wide `DeclaredResource`. TypeScript checks a type
  argument's constraint with error reporting on, and against the wide type it recomputes a failed
  check of the definer context on every reference: 20 `Infer<typeof X>` aliases cost 1.05 s and 577
  MB on stern that way, against 0.19 s and 130 MB. Annotating a value with `DeclaredResource` stays
  cheap.
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
