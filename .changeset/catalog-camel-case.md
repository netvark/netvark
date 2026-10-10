---
'@netvark/catalog-core': minor
'@netvark/pg-catalog': minor
---

`toCamelCase` and `toSnakeCase`, Kysely's `CamelCasePlugin` conversions with its options, move from
`@netvark/pg-catalog` into `@netvark/catalog-core`, together with the `CamelCaseOptions` type, so
the `camelCase` Kysely types and the public names of `@netvark/resource-core` come from one
implementation. `@netvark/pg-catalog` re-exports them with the rest of the core; its `camelCase`
keys do not change.
