---
'@netvark/jsonapi-core': minor
'@netvark/hono-jsonapi': minor
---

Export `errorAtOperation(error, pointer)` from `@netvark/jsonapi-core/atomic`, re-exported by
`@netvark/hono-jsonapi/atomic`: the function the operations processor applies to an operation's
failure, so every error object without a source gets the operation's pointer. A host whose
transaction maps a failure once it ended, outside the processor, points that error at its operation
alike.
