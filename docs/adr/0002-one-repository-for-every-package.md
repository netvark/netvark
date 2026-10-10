# ADR 0002: One repository for every package

- Status: accepted
- Date: 2026-10-10

## Context

The three families started as three repositories under one maintainer, each a copy of the same
template: `ali-issa/ban-kit` (`ban-kit`, `hono-ban`), `ali-issa/jsonapi-kit` (`jsonapi-kit`,
`hono-jsonapi`), and `ali-issa/keyset-kit` (`keyset-kit`, `kysely-keyset`). The template drifted
between them within a week (coverage excludes, CI jobs, the contributing guide each named the commit
it was copied from), and a package that depends on a sibling family (`jsonapi-kit` on `ban-kit`)
could only be developed against a packed tarball of an unpublished version. Planned packages
(resource declarations, a catalog extractor, further host bindings) depend on all three families.

## Decision

Every published package lives in this repository, a single pnpm workspace with one set of tooling
(`oxlint`, `oxfmt`, `tsdown`, Vitest projects, knip, lefthook, Changesets) and one CI. Each package
is a directory under `packages/`; each family keeps a private end-to-end package under
`e2e/<family>` and its documentation and decisions under `docs/<family>`. Packages are versioned
independently through Changesets and depend on each other through `workspace:` ranges, which pnpm
rewrites to published versions on release. The three repositories' histories were imported with
`git subtree add`, so `git log --follow` reaches every file's past.

## Consequences

A change to the template is one change. A package can be built against a sibling's working copy and
tested in the same run. The cost is a wider CI matrix per change and one issue tracker for every
family, which labels per package keep navigable. Family-specific rules stay close to their code in
`docs/<family>/CONTRIBUTING.md` and `AGENTS.md` so that the shared guide does not grow with each
family.
