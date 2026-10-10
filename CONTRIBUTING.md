# Contributing

Thanks for helping. This repository holds every `@netvark` package, grouped in families: ban
(`@netvark/ban-core`, `@netvark/hono-ban`), jsonapi (`@netvark/jsonapi-core`,
`@netvark/hono-jsonapi`), and keyset (`@netvark/keyset-core`, `@netvark/kysely-keyset`). This guide
covers what every family shares: setup, the quality gates, the conventions, commits, changesets, and
releases. Each family adds its own guide with its layout, extension points, constraints, and
checklist:

- [`docs/ban/CONTRIBUTING.md`](docs/ban/CONTRIBUTING.md)
- [`docs/jsonapi/CONTRIBUTING.md`](docs/jsonapi/CONTRIBUTING.md)
- [`docs/keyset/CONTRIBUTING.md`](docs/keyset/CONTRIBUTING.md)

Design intent lives in each family's `DESIGN.md`, the normative contract in its `SPEC.md`, and
decisions in its `adr/`; read those before proposing API changes. Decisions about the repository
itself are in [`docs/adr/`](docs/adr).

## Prerequisites

- Node.js 24 (see `.node-version`; Node 22.12+ is supported at runtime and in CI)
- pnpm 12 (`corepack enable` or `npm install -g pnpm@12`; the exact version is pinned in
  `package.json` `packageManager`)
- `bun` and `deno` for `pnpm test:runtimes` (optional locally; CI installs both)
- a PostgreSQL server for `e2e/keyset/postgres.e2e.test.ts` (optional locally; the file skips itself
  without `KEYSET_PG_URL`, and CI runs it against PostgreSQL 14 and 18)

## Setup

```bash
git clone https://github.com/netvark/netvark.git
cd netvark
pnpm install
```

`pnpm install` also installs the git hooks (lefthook): formatting and linting run on commit, types
and tests run on push. Run `pnpm build` once before `pnpm check`: the type-aware lint of `e2e/*` and
the package checks (`publint`, `attw`) read `dist/`. The packages themselves need no build between
edits: a binding resolves its core from source through the `source` condition of the core's
`exports` map, enabled only in the binding's `tsconfig.json` and its Vitest project; everything
else, `e2e/*` included, resolves `dist/`.

## Scripts

| Script                     | What it does                                                           |
| -------------------------- | ---------------------------------------------------------------------- |
| `pnpm check`               | Runs every `check:*` script below, in order                            |
| `pnpm check:deps`          | `knip`: unused files, exports, dependencies                            |
| `pnpm check:format`        | `oxfmt --check`                                                        |
| `pnpm check:lint`          | `oxlint` with type-aware rules                                         |
| `pnpm check:pkg`           | `publint` and `arethetypeswrong` against each built package            |
| `pnpm check:types`         | `tsc --noEmit` for the root configs and each package                   |
| `pnpm test`                | Vitest over every package, including type tests in `*.test-d.ts`       |
| `pnpm test:coverage`       | Vitest with V8 coverage over every package; thresholds are enforced    |
| `pnpm test:e2e`            | Build, then type-check and run each `e2e/*` package against the builds |
| `pnpm test:runtimes`       | Build, then run each family's smoke test on Bun, Deno, and workerd     |
| `pnpm build`               | tsdown for each package: ESM, declarations, updates its `exports`      |
| `pnpm format` / `lint:fix` | Apply formatting / autofixable lint fixes                              |

CI runs the same commands, plus `@netvark/kysely-keyset`'s unit tests on Kysely 0.28.17 (the floor
of its peer range) and the keyset e2e file for a PostgreSQL server. A pull request must be green on
all of them: the last CI job, `CI passed`, needs every other job and is the one check `main`
requires ([ADR 0004](docs/adr/0004-protect-main-with-one-aggregate-check.md)), so a new CI job goes
into its `needs` list. To work on one package or family, filter by name:

```bash
pnpm --filter @netvark/keyset-core test
pnpm --filter @netvark/kysely-keyset exec vitest run paginate
pnpm --filter @netvark/keyset-e2e exec vitest run cursors        # after pnpm build
KEYSET_PG_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm --filter @netvark/keyset-e2e exec vitest run postgres
```

## Conventions

- **Every behavior traces to a source.** The specification a family implements (JSON:API 1.1 and its
  profiles and extensions, RFC 9457, the Cursor Pagination profile), the PostgreSQL manual, the host
  library's documentation, and the RFCs they lean on are the sources. Add an `@ref <url>` comment
  next to the decision it justifies, and name the clause in the test. Where a source leaves a choice
  to the implementation, the choice is recorded in the family's `SPEC.md` and an ADR, never only in
  code.
- **A core knows no host.** Nothing under `packages/<thing>-core/` imports a framework, a query
  builder, or a driver; what needs one lives in the binding (`packages/<host>-<thing>/`) and calls
  the core. The core types a host's objects structurally or as a type parameter, never as a concrete
  framework type.
- **Tests are colocated.** `foo.ts` has `foo.test.ts` next to it, and `foo.test-d.ts` when the types
  are part of the contract. New behavior ships with tests; bug fixes ship with a failing test first.
  Coverage thresholds are enforced on the combined source of every package.
- **End-to-end tests live in `e2e/<family>/`.** Each is a private pnpm workspace package that
  depends on its family's packages through `workspace:*`, so its imports resolve through the
  published `exports` maps into `dist/` and its `tsc` run checks the emitted declarations. Never
  import from `src/` there. Run one file with
  `pnpm --filter @netvark/<family>-e2e exec vitest run <name>` after `pnpm build`.
- **Runtime smoke tests live in `e2e/<family>/smoke/`.** One module imports the family's packages;
  `run.ts` drives it in-process on Bun and Deno and `workerd.ts` bundles it with tsdown and runs it
  in Miniflare's workerd.
- **Nothing reads `process.env` at module scope.** Behavior is configured through options so every
  package runs on workerd, Deno, Bun, and Node.
- **Client input is hostile.** Names from a request become object keys only through a family's
  prototype-safe helpers or after a prototype-key check; reads of client-shaped objects use
  `Object.hasOwn`; error messages are constant. See `SECURITY.md` for what counts as a
  vulnerability.
- **Files stay small and single-purpose.** One exported concept per file; split rather than add
  section dividers.
- **Type at boundaries, infer locally.** Exports carry explicit types (required by
  `isolatedDeclarations`); locals do not.
- **No `any`, no non-null assertions, `Array<T>` over `T[]`, `??` over `||`.** oxlint enforces
  these.
- **No emojis** in code, docs, or commit messages.
- **Lint disables carry a reason.** `// oxlint-disable-next-line rule -- reason: <why>`.

## Adding a package

The name follows [ADR 0003](docs/adr/0003-package-naming.md): `<thing>-core` for a core,
`<host>-<thing>` for a binding, `<thing>-<facet>` for a companion. Open an issue labeled `epic`
first so the scope is settled before code exists, then:

1. Copy the closest sibling under `packages/` (`keyset-core` for a core, `kysely-keyset` for a
   binding) to `packages/<name>` and set `name`, `description`, `keywords`, `homepage`, and
   `repository.directory` in its `package.json`. A binding depends on its core through `workspace:^`
   and declares the host as a peer dependency.
2. Keep `tsdown.config.ts` as the one source of the subpaths: `pnpm build` writes the `exports` maps
   into `package.json`, and CI fails on a diff. Name the Vitest project after the package.
3. Add the package's re-export-only files, if any, to the coverage `exclude` list in the root
   `vitest.config.ts`.
4. Add it to the family's e2e package: a `package-surface` entry listing its exports, a feature file
   that drives it against a real host, and the smoke module. A new family gets a new `e2e/<family>`
   package and a `docs/<family>` directory, copied from a sibling.
5. Document it: the family `README.md`, `DESIGN.md`, `SPEC.md`, an ADR, the root `README.md` table,
   and the package dropdown in `.github/ISSUE_TEMPLATE/feature_request.yml`.
6. Add a `minor` changeset for its first release.

## Commits and pull requests

- Use conventional commit subjects with the family or package as the scope:
  `feat(keyset): add the overlaps operator`, `fix(hono-ban): preserve HTTPException headers`. Types:
  `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`.
- Keep pull requests focused. Describe the why in the body; link the issue.
- Every user-visible change needs a changeset (next section). CI fails without one on
  `packages/*/src` changes. A source change users cannot see, such as a comment, a lint directive,
  or a test, takes an empty one: `pnpm changeset add --empty`.

## Changesets and releases

Releases are automated with [Changesets](https://github.com/changesets/changesets).

1. In your branch run `pnpm changeset`, pick the package or packages that change, and pick `patch`,
   `minor`, or `major` for each. Write the entry for users, not for maintainers: what changed and
   what they have to do. The packages are versioned independently; a core change that a binding only
   passes through needs no entry for the binding (Changesets bumps its dependency range on its own).
2. Commit the generated file under `.changeset/`.
3. When your PR merges, the release workflow opens or updates a "Version Packages" PR that bumps
   each affected package's `package.json` and `CHANGELOG.md`.
4. Merging that PR publishes the bumped packages to npm through trusted publishing (OIDC, with
   provenance) and creates a GitHub release per package.

For a prerelease line, run `pnpm changeset pre enter <tag>` on `main` and commit the resulting
`.changeset/pre.json`; releases then publish under that npm dist-tag instead of `latest` until
`pnpm changeset pre exit` is committed.

## Architecture decisions

Anything that changes a package's public API, a wire or cursor format, a choice its specification
leaves open, the runtime or database support matrix, or a dependency gets an ADR in the family's
`docs/<family>/adr/`. Anything that changes the repository (layout, naming, shared tooling, the
release process) gets one in `docs/adr/`. Copy the directory's `0000-template.md`, number it, and
link it from the PR.

## Reporting bugs and requesting features

Use the issue templates. For security issues follow `SECURITY.md`; do not open a public issue.
