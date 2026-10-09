# Contributing to jsonapi-kit

Thanks for helping. This repository holds two packages, `jsonapi-kit` (the framework-free core) and
`hono-jsonapi` (the Hono adapter); this document covers setup, the quality gates, and how changes
are released. Design intent lives in `docs/DESIGN.md`, the normative contract in `docs/SPEC.md`, and
decisions in `docs/adr/`; read those before proposing API changes.

The repository tooling (build, lint, format, tests, CI, release automation, issue templates) mirrors
[hono-ban](https://github.com/ali-issa/hono-ban) at commit `dd1a1b1`. When the template changes,
port the change here in a `chore(repo)` commit that names the hono-ban commit.

## Prerequisites

- Node.js 24 (see `.node-version`; Node 22.12+ is supported at runtime and in CI)
- pnpm 12 (`corepack enable` or `npm install -g pnpm@12`; the exact version is pinned in
  `package.json` `packageManager`)
- `bun` and `deno` for `pnpm test:runtimes` (optional locally; CI installs both)

## Setup

```bash
git clone https://github.com/ali-issa/jsonapi-kit.git
cd jsonapi-kit
pnpm install
```

`pnpm install` also installs the git hooks (lefthook): formatting and linting run on commit, types
and tests run on push. Run `pnpm build` once before `pnpm check`: the type-aware lint of `e2e/` and
the package checks (`publint`, `attw`) read `dist/`. The packages themselves need no build between
edits: `hono-jsonapi` resolves `jsonapi-kit` from source through the `source` condition of the
core's `exports` map (enabled only in `packages/hono-jsonapi/tsconfig.json` and its Vitest project;
everything else, `e2e/` included, resolves `dist/`).

## Scripts

| Script                     | What it does                                                      |
| -------------------------- | ----------------------------------------------------------------- |
| `pnpm check`               | Runs every `check:*` script below, in order                       |
| `pnpm check:format`        | `oxfmt --check`                                                   |
| `pnpm check:lint`          | `oxlint` with type-aware rules                                    |
| `pnpm check:types`         | `tsc --noEmit` for the root configs and each package              |
| `pnpm check:deps`          | `knip`: unused files, exports, dependencies                       |
| `pnpm check:pkg`           | `publint` and `arethetypeswrong` against each built package       |
| `pnpm test`                | Vitest over both packages, including type tests in `*.test-d.ts`  |
| `pnpm test:coverage`       | Vitest with V8 coverage; thresholds are enforced                  |
| `pnpm test:e2e`            | Build, then type-check and run `e2e/` against the built packages  |
| `pnpm test:runtimes`       | Build, then run the smoke test on Bun, Deno, and workerd          |
| `pnpm build`               | tsdown for each package: ESM, declarations, updates its `exports` |
| `pnpm format` / `lint:fix` | Apply formatting / autofixable lint fixes                         |

CI runs the same commands. A pull request must be green on all of them. To work on one package,
filter: `pnpm --filter jsonapi-kit test`, `pnpm --filter hono-jsonapi exec vitest run respond`.

## Conventions

- **Every behavior traces to a clause.** JSON:API 1.1, the Cursor Pagination profile, the Atomic
  Operations extension, RFC 9110, RFC 6901, and Standard Schema are the sources. Add an `@ref <url>`
  comment next to the decision it justifies, and name the clause in the test. Where the
  specification leaves a choice to the server (the filter grammar, page size bounds, the error
  catalog), the choice is recorded in `docs/SPEC.md` and an ADR, never only in code.
- **The core knows no framework.** Everything under `packages/jsonapi-kit/` is functions over plain
  values; what needs a request, a response, or a framework context goes in `packages/hono-jsonapi/`
  and calls the core (ADR 0013). A handler context is the `TContext` type parameter in the core.
- **Tests are colocated.** `foo.ts` has `foo.test.ts` next to it, and `foo.test-d.ts` when the types
  are part of the contract. New behavior ships with tests; bug fixes ship with a failing test first.
  Every document a builder produces is checked against the JSON Schema in
  `packages/jsonapi-kit/src/test-support/` by `document/conformance.test.ts`; extend that fixture
  when you add a builder.
- **End-to-end tests live in `e2e/`.** That directory is a private pnpm workspace package that
  depends on `jsonapi-kit` and `hono-jsonapi` through `workspace:*`, so its imports resolve through
  the published `exports` maps into `dist/` and its `tsc` run checks the emitted declarations. Each
  `*.e2e.test.ts` file starts the blog API in `e2e/support/` on `@hono/node-server` and asserts over
  `fetch`. Never import from `src/` there. Run one file with
  `pnpm --filter jsonapi-kit-e2e exec vitest run <name>` after `pnpm build`.
- **Runtime smoke tests live in `e2e/smoke/`.** One app imports both packages; `run.ts` drives it
  in-process on Bun and Deno and `workerd.ts` bundles it with tsdown and runs it in Miniflare's
  workerd. `pnpm test:runtimes` needs `bun` and `deno` on your `PATH`; CI installs both.
- **Nothing reads `process.env` at module scope.** Behavior is configured through options so the
  package runs on workerd, Deno, Bun, and Node. See ADR 0003.
- **Client input is hostile.** Names from a request become object keys only through
  `internal/object.ts` or after a `PROTO_KEYS` check; reads of client-shaped objects use
  `Object.hasOwn`. See `SECURITY.md` for what counts as a vulnerability.
- **Files stay small and single-purpose.** One exported concept per file; split rather than add
  section dividers.
- **Type at boundaries, infer locally.** Exports carry explicit types (required by
  `isolatedDeclarations`); locals do not.
- **No `any`, no non-null assertions, `Array<T>` over `T[]`, `??` over `||`.** oxlint enforces
  these.
- **No emojis** in code, docs, or commit messages.
- **Lint disables carry a reason.** `// oxlint-disable-next-line rule -- reason: <why>`.

## Adding a capability

The package has one extension point today: a handler that implements an operation of the Atomic
Operations extension is application code (`ResourceHandlers`), not a contribution. New library
surface falls into one of these:

- **A specification clause not yet implemented.** Open an issue quoting the clause. The change ships
  with the clause cited in code and tests, a SPEC section, and a changeset.
- **A server choice the specification leaves open** (a filter operator, a pagination strategy, a
  query parameter family). Open a discussion first; the result is an ADR, then code.
- **Another JSON:API extension or profile.** It is a new subpath of the core
  (`packages/jsonapi-kit/src/<name>/index.ts`, an entry in its `tsdown.config.ts`, a row in SPEC
  section 1, an `e2e/package-surface.e2e.test.ts` entry, a smoke check, an ADR, and a `minor`
  changeset), following `atomic/` as the precedent; what needs the HTTP layer gets a matching
  subpath in `hono-jsonapi` that re-exports it and adds the handler.
- **An adapter for another framework.** A new package `packages/<framework>-jsonapi/` following
  `packages/hono-jsonapi/` as the precedent: depends on `jsonapi-kit` (`workspace:^`), re-exports it
  in full, adds the framework's middleware, validators, response helpers, and a handler around
  `operationsProcessor` with the framework's request context as `TContext`. Its own e2e coverage
  joins `e2e/`.

**Constraints every contribution inherits.**

- `jsonapi-kit` depends on `ban-kit` and on nothing else; `hono` and `hono-ban` are `hono-jsonapi`'s
  only peer dependencies (ADR 0014). Validators are consumed through the Standard Schema interface,
  whose types are vendored in `packages/jsonapi-kit/src/internal/standard-schema-types.ts`; the
  packages never import Zod, Valibot, or ArkType (ADR 0002). The real libraries used in tests are
  devDependencies.
- A definition is validated once, in `defineResource`, with a `TypeError` naming the option. A
  request-time check that a definition mistake could trigger belongs there, not in a parser.
- A parser reports every problem it finds in one `BanError` built with `jsonApiError`, each error
  item with a `source` (`pointer`, `parameter`, or `header`), and never drops input silently.
- Every `code` the packages emit is in `ERROR_CODES`; a new one is a catalog entry, a SPEC 4.1 row,
  and a `minor` changeset (ADR 0009, ADR 0014). Nothing in the adapter renders its own rejection; it
  throws, and `errorHandler()` renders.

**Checklist.** Every item below is checked by CI or by a reviewer.

1. Source file in the right directory (see the repository map in `AGENTS.md`), with a
   `@packageDocumentation` header naming the SPEC section it implements and `@ref` links to the
   specification.
2. Unit tests beside the file; a `*.test-d.ts` when inference is part of the contract.
3. `docs/SPEC.md`: the section for the behavior, and section 1 or 12 when the public surface
   changes; `docs/DESIGN.md` when the intent changes; the README when a user would look for it.
4. `e2e/package-surface.e2e.test.ts` lists every export of all four subpaths; a new export goes
   there, and into an e2e file that drives it over HTTP.
5. An ADR for a public API change, a wire shape, a server choice, or a dependency.
6. A changeset: an additive export or option is `minor`; anything that changes an existing wire
   shape, parse result, or exported type is `major`.

## Commits and pull requests

- Use conventional commit subjects: `feat(query): accept filter groups`,
  `fix(negotiate): ignore q=0 instances`. Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`,
  `chore`, `build`, `ci`.
- Keep pull requests focused. Describe the why in the body; link the issue.
- Every user-visible change needs a changeset (next section). CI fails without one on `src/`
  changes.

## Changesets and releases

Releases are automated with [Changesets](https://github.com/changesets/changesets).

1. In your branch run `pnpm changeset`, pick the package or packages that change, and pick `patch`,
   `minor`, or `major` for each. Write the entry for users, not for maintainers: what changed and
   what they have to do. The packages are versioned independently; a `jsonapi-kit` change that
   `hono-jsonapi` only passes through needs no entry for the adapter (Changesets bumps its
   dependency range on its own).
2. Commit the generated file under `.changeset/`.
3. When your PR merges, the release workflow opens or updates a "Version Packages" PR that bumps
   each affected package's `package.json` and `CHANGELOG.md`.
4. Merging that PR publishes the bumped packages to npm through trusted publishing (OIDC, with
   provenance) and creates a GitHub release per package.

For a prerelease line, run `pnpm changeset pre enter <tag>` on `main` and commit the resulting
`.changeset/pre.json`; releases then publish under that npm dist-tag instead of `latest` until
`pnpm changeset pre exit` is committed.

## Architecture decisions

Anything that changes the public API, the wire shape, a server choice the specification leaves open,
the runtime support matrix, or a dependency gets an ADR in `docs/adr/`. Copy
`docs/adr/0000-template.md`, number it, and link it from the PR.

## Reporting bugs and requesting features

Use the issue templates. For security issues follow `SECURITY.md`; do not open a public issue.
