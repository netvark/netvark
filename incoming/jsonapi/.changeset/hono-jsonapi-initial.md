---
'hono-jsonapi': minor
---

First release: JSON:API 1.1 for Hono, on top of `jsonapi-kit` (re-exported in full).

- `jsonApi()` middleware negotiates `Content-Type` and `Accept` and adds `Vary: Accept`; `respond`
  derives `ext` and `profile` on `Content-Type` from the document and `Location` on a 201.
- `queryValidator`, `bodyValidator`, and `relationshipValidator` are Hono validators typed for
  `c.req.valid()`; `readDocument` reads a request document.
- `errorHandler` is a [hono-ban](https://github.com/ali-issa/ban-kit) handler over the catalog:
  every failure, including Hono's `HTTPException` and the validators' and middleware's rejections,
  is an error document with an error id in the header and the body; `notFoundHandler` gives
  unmatched routes the same shape. `hono-ban` is a peer dependency next to `hono`.
- `hono-jsonapi/atomic` exposes `atomicOperations()`, the Atomic Operations endpoint as a Hono
  handler; handlers receive the Hono `Context` as `ctx`.
