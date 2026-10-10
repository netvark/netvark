# @netvark/keyset-core

## 0.1.0

### Minor Changes

- First release: keyset pagination for any JavaScript runtime, database-free.
  
  - `defineKeyset` declares once what a collection can sort, filter, and search on: column fields of
    twelve scalar types and arrays, aggregate fields over relations (`count`, `max`, `min`, `sum`,
    `avg`), relations with their own filterable fields, a `like` or full-text search, the key that
    breaks every tie, the default sort, the page size bounds, and the cursor secret. A mistake in the
    definition is a `TypeError` naming the option.
  - `plan` validates a request (sort, a typed filter tree with a per-type operator table, search, page
    size, cursors) and returns a query plan: the sort keys with their null placement, the filter and
    seek predicates as data, the limit, and the context cursors are bound to.
  - `page` assembles the result from the fetched rows: a cursor per row, `prev` and `next`, `hasPrev`
    and `hasNext`, the optional total, and `rangeTruncated`, as the Cursor Pagination profile
    prescribes.
  - Cursors are HMAC-SHA256 signed through Web Crypto, versioned, bound to the sort, filter, and
    search they were issued for, with optional expiry and secret rotation.
  - Every request-time problem is a typed `KeysetError` with a constant message and structured fields.

- [#65](https://github.com/netvark/netvark/pull/65) [`2485317`](https://github.com/netvark/netvark/commit/2485317ff47933f84f7c41557700dd4b9d358461) Thanks [@ali-issa](https://github.com/ali-issa)! - `createDefineKeyset(defaults)` sets the cursor options, the page bounds, and the text-search
  configuration once for every keyset an application defines.
  
  - `@netvark/keyset-core` gains `createDefineKeyset(defaults)`. It returns a `defineKeyset` that
    merges `defaults.cursor` and `defaults.page` under each definition option by option, and gives a
    full-text search that names no configuration `defaults.search.config`. The defaults are validated
    when the definer is created, and every definition must still end up with a cursor secret.
  - `@netvark/kysely-keyset`'s `createDefineKeyset<DB>(defaults)` takes the same defaults and keeps
    every compile-time name check. With a cursor default, `cursor` becomes optional in a definition.
