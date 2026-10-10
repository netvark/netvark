---
'@netvark/keyset-core': minor
'@netvark/kysely-keyset': minor
---

`createDefineKeyset(defaults)` sets the cursor options, the page bounds, and the text-search
configuration once for every keyset an application defines.

- `@netvark/keyset-core` gains `createDefineKeyset(defaults)`. It returns a `defineKeyset` that
  merges `defaults.cursor` and `defaults.page` under each definition option by option, and gives a
  full-text search that names no configuration `defaults.search.config`. The defaults are validated
  when the definer is created, and every definition must still end up with a cursor secret.
- `@netvark/kysely-keyset`'s `createDefineKeyset<DB>(defaults)` takes the same defaults and keeps
  every compile-time name check. With a cursor default, `cursor` becomes optional in a definition.
