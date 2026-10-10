# @netvark/kysely-keyset

## 0.1.0

### Minor Changes

- [#65](https://github.com/netvark/netvark/pull/65) [`2485317`](https://github.com/netvark/netvark/commit/2485317ff47933f84f7c41557700dd4b9d358461) Thanks [@ali-issa](https://github.com/ali-issa)! - `createDefineKeyset(defaults)` sets the cursor options, the page bounds, and the text-search
  configuration once for every keyset an application defines.
  
  - `@netvark/keyset-core` gains `createDefineKeyset(defaults)`. It returns a `defineKeyset` that
    merges `defaults.cursor` and `defaults.page` under each definition option by option, and gives a
    full-text search that names no configuration `defaults.search.config`. The defaults are validated
    when the definer is created, and every definition must still end up with a cursor secret.
  - `@netvark/kysely-keyset`'s `createDefineKeyset<DB>(defaults)` takes the same defaults and keeps
    every compile-time name check. With a cursor default, `cursor` becomes optional in a definition.

- First release: keyset pagination for Kysely on PostgreSQL.
  
  - `createDefineKeyset<DB>()` returns a `defineKeyset` that checks every table, column, relation, and
    search name of a definition against the application's Kysely `DB` interface and whose keysets
    carry `paginate`.
  - `paginate(query, request, options)` plans the request with @netvark/keyset-core, renders the
    filter, seek, key selections, ordering, and limit onto the caller's own select query, runs it, and
    returns the page with the caller's rows untouched. `total: true` runs the count query; `onQuery`
    reports each statement with its SQL, parameters, and timing.
  - Column references are `table.column`, so a `CamelCasePlugin` maps them like the application's own
    queries; aggregates are correlated scalar subqueries; relation filters are `exists`; search is
    `ILIKE` over `concat_ws` or `tsvector @@ tsquery`.
  - Everything @netvark/keyset-core exports is re-exported, so an application imports from one
    package.

### Patch Changes

- Updated dependencies [[`2485317`](https://github.com/netvark/netvark/commit/2485317ff47933f84f7c41557700dd4b9d358461)]:
  - @netvark/keyset-core@0.1.0
