---
'@netvark/jsonapi-core': patch
---

A module that exports a definition compiles with `declaration: true` again: `InferredTypes` and
`DefinitionOf`, which an inferred definition's type names, are exported, so the emitted declarations
import only `@netvark/jsonapi-core` instead of failing with TS2883.
