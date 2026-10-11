---
'@netvark/resource-core': minor
---

`@netvark/resource-core/openapi` exports `resourcePaths(definition)`, the paths the OpenAPI document
reads from a resource's links: the collection, the resource with its `{id}`, each relationship's,
and the origin of an absolute base. A host mounts its routes at the same paths, so the links, the
routes, and the document name the same URLs. Its `TypeError`s start with `resourcePaths:`.
