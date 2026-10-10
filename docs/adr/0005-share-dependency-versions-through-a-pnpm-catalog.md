# ADR 0005: Share dependency versions through a pnpm catalog

- Status: accepted
- Date: 2026-10-10

## Context

Twenty-two development dependencies are declared by two or more of the ten workspace packages: `zod`
by six, `hono` by four plus two peer ranges, and `vitest`, `typescript`, `tsdown`, and `@types/node`
by the root and every e2e package. Each declaration was an exact pin, so one version lived in up to
six files and could drift between them, as `pg` once did between `e2e/ban` and `e2e/keyset`.

A pnpm catalog defines a version once in `pnpm-workspace.yaml`. A package references it as
`catalog:`, and `pnpm publish` and `pnpm pack` replace the reference with the version
([pnpm catalogs](https://pnpm.io/catalogs)). Dependabot reads and updates catalog entries since
February 2025
([changelog](https://github.blog/changelog/2025-02-04-dependabot-now-supports-pnpm-workspace-catalogs-ga/)),
with one open defect: the lockfile it commits can drop a catalog entry
([dependabot-core#14339](https://github.com/dependabot/dependabot-core/issues/14339)).

## Decision

- A dependency that two or more workspace packages declare in `dependencies`, `devDependencies`, or
  `optionalDependencies` takes its version from the default catalog: `"zod": "catalog:"` in the
  package, `zod: 4.6.5` in `pnpm-workspace.yaml`.
- A dependency that one package declares stays pinned in that package's `package.json`. It moves
  into the catalog when a second package needs it.
- Peer dependency ranges never come from the catalog. A peer range is the published contract of one
  package, chosen for its users, not a development pin.
- There are no named catalogs. A CI job that tests another version, such as the Kysely 0.28 floor
  job, overrides the reference with `pnpm add` without committing it.

## Consequences

- One line changes a shared version, and every package that uses it moves with it.
- `pnpm install --frozen-lockfile` in CI catches a Dependabot lockfile that lost a catalog entry.
  The fix is to run `pnpm install` on the Dependabot branch and push the regenerated lockfile.
- Review has to check that a new shared dependency went into the catalog instead of into two pins;
  nothing enforces it mechanically yet.
