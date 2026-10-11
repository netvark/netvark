---
'@netvark/jsonapi-core': minor
'@netvark/hono-jsonapi': minor
---

New `validate.id` on `defineResource`: a Standard Schema for the client-generated id a create
carries, allowed only with `clientIds: true`. An id outside it is refused with 422
`VALIDATION_FAILED` at `/data/id`, reported before any issue of the attributes, in a `POST` and in
an atomic `add` alike, and the parsed id is the validator's output. An update's id is the URL's and
is never validated by the parser.
