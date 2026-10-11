---
'@netvark/resource-core': minor
'@netvark/kysely-resource': patch
---

`@netvark/resource-core/server` now holds the runtime contract hosts and workers take:
`ResourceRuntime`, `RuntimeResources`, `Domain`, `ResourceOperations`, `ResourceInput`, and
`ListOptions`, so code given a runtime types it without Kysely or a driver.
`@netvark/kysely-resource` re-exports them, so its imports keep working, and its runtime now lists
the declared resource of each behavior as `runtime.resources`, in the order of `options.resources`.
