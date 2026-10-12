# @netvark/jsonapi-client

A typed client for [JSON:API 1.1](https://jsonapi.org/format/1.1/) servers built with
[`@netvark/jsonapi-core`](../jsonapi-core#readme). The queries it sends are typed by the definitions
the server is built from, so an include path, sort, filter, or fieldset the server would refuse with
a 400 fails `tsc` first. Nothing is generated: the client imports the definitions. It uses web
standards only (`URL`, `URLSearchParams`), so one build runs in browsers, workers, Node, Bun, and
Deno. The contract is section 15 of
[`docs/jsonapi/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/jsonapi/SPEC.md).

## Install

```bash
pnpm add @netvark/jsonapi-client
```

`@netvark/jsonapi-core` is the one dependency. The definitions are the server's: see
[What a client sees](../jsonapi-core#what-a-client-sees) for what they carry and how to share them.

## Queries

`serializeQuery(definition, query)` writes the query string `parseQuery` reads on the server.
`ListQuery` and `GetQuery` type the query from the definitions:

```ts
import { Articles, People, Tags } from '@acme/api/definitions';

import { serializeQuery, type ListQuery } from '@netvark/jsonapi-client';

const definitions = { articles: Articles, people: People, tags: Tags };
type ArticleQuery = ListQuery<typeof definitions, typeof Articles>;

const query: ArticleQuery = {
  include: ['author'],
  fields: { articles: ['title', 'author'], people: ['name'] },
  sort: ['-createdAt', 'title'],
  filter: { title: { like: 'JSON%' }, author: { in: ['9', '12'] } },
  page: { size: 20 },
};

const response = await fetch(
  `https://api.example.com/articles?${serializeQuery(Articles, query)}`,
  {
    headers: { Accept: 'application/vnd.api+json' },
  },
);
// include=author&fields[articles]=title,author&fields[people]=name&sort=-createdAt,title
// &page[size]=20&filter[title][like]=JSON%&filter[author][in]=9&filter[author][in]=12
// (brackets, commas, and % percent-encoded on the wire)
```

| Member    | Takes                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------- |
| `include` | the declared include paths                                                                                |
| `fields`  | by type, the fields a client reads, for the definition's type and each type its include paths reach       |
| `sort`    | the declared sort names, `-` for descending, applied in the order given                                   |
| `page`    | `size`, `after`, and `before` of the Cursor Pagination profile, on a definition that paginates            |
| `filter`  | by field, a bare value (`eq`) or values by declared operator, and `or` groups                             |
| `search`  | a string, on a definition with a search parameter, sent in that parameter                                 |
| `custom`  | the declared custom parameters by name, and a name with members (`highlight[fields]`), each value or list |

`GetQuery`, for one resource, takes `include` and `fields`. One query always gives one URL: the
members in the order above, each list in the order given.

### Filters

A field takes a bare value when it declares `eq`, otherwise values by operator. The conditions
outside `or` all hold; each group in `or` holds when any of its conditions does, and every group
must hold:

```ts
const recent: ArticleQuery = {
  filter: {
    createdAt: { gte: '2026-01-01' },
    or: [{ title: { like: 'JSON%' }, author: '9' }],
  },
};
// createdAt >= 2026-01-01 AND (title LIKE 'JSON%' OR author = 9)
```

A value is a string as it is, a number or a bigint by `String`, a boolean as `true` or `false`. A
list sends the parameter once per value, never joined, so a comma stays part of the value:
`{ name: 'Lovelace, Ada' }` matches that one name.

### What is checked where

The types restrict names: the include paths, sorts, filter fields and operators, fieldsets, and
custom parameters a definition declares; `page` only where it paginates, `search` only where it has
a search parameter, and `fields` only where it accepts them. `serializeQuery` throws `TypeError` for
what no parameter can carry: a `page.size` that is not a positive safe integer, a number that is not
finite, an empty list, and `page` or `search` on a definition without them. Values are the server's
to judge: a date it cannot read or a page size above its maximum is a 400 that names the parameter.

## Pagination

`pageCursors(document)` reads the cursors of a page's links: `next` is `page[after]` of `links.next`
and `prev` is `page[before]` of `links.prev`, each `undefined` when the link is `null` or absent,
which ends the list in that direction. A link may be a string or a link object.

```ts
import { pageCursors, serializeQuery } from '@netvark/jsonapi-client';

const page = await response.json();
const { next } = pageCursors(page);
if (next !== undefined) {
  const following = serializeQuery(Articles, { ...query, page: { size: 20, after: next } });
}
```

`cursorOf(record)` reads a record's item cursor, the profile's `meta.page.cursor`, which a record
carries as `$meta.page.cursor`; list with `page: { after }` set to it to start after that record.

## Best practices

- **Import the server's definitions; generate nothing.** A renamed attribute or a dropped sort then
  fails the client's `tsc`, not a request in production.
- **Pass every definition a response can hold.** The fields of an included type are typed by its
  definition; a type the client was not given takes any name.
- **Name each sort field once.** The server refuses a field sorted twice in one `sort`.
- **Keep cursors opaque.** Read them with `pageCursors` and `cursorOf` and send them back with the
  same `sort` and `filter`; never decode or build one.
- **Leave `page.size` out for the server's default,** and stay within the definition's `max`
  otherwise.
- **Use the URL as a cache key.** One query always serializes to one URL.

## Documentation

- [`docs/jsonapi/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/jsonapi/SPEC.md),
  section 15: the client's contract, with the tests that prove it
- [ADR 0017](https://github.com/netvark/netvark/blob/main/docs/jsonapi/adr/0017-a-typed-client-on-fetch-over-the-servers-definitions.md):
  a typed client on fetch over the server's definitions
- [ADR 0018](https://github.com/netvark/netvark/blob/main/docs/jsonapi/adr/0018-definitions-carry-the-types-a-client-reads-and-writes.md):
  definitions carry the types a client reads and writes

## License

MIT
