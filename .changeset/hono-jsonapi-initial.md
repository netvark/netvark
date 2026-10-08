---
'hono-jsonapi': minor
---

First release: JSON:API 1.1 for Hono, on top of `jsonapi-kit` (re-exported in full).

- `jsonApi()` middleware negotiates `Content-Type` and `Accept` and adds `Vary: Accept`; `respond`
  derives `ext` and `profile` on `Content-Type` from the document and `Location` on a 201.
- `queryValidator`, `bodyValidator`, and `relationshipValidator` are Hono validators typed for
  `c.req.valid()`; `readDocument` reads a request document.
- `errorHandler` and `notFoundHandler` render every failure as an error document.
- `hono-jsonapi/atomic` exposes `atomicOperations()`, the Atomic Operations endpoint as a Hono
  handler; handlers receive the Hono `Context` as `ctx`.
