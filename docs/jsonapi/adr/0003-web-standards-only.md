# ADR 0003: Web standards only; no ambient environment reads

- Status: accepted
- Date: 2026-10-08

## Context

Hono targets Cloudflare Workers, Deno, Bun, and Node. The previous toolkit imported `crypto` and
`Buffer` from Node, which fails on workerd without `nodejs_compat` and on Deno without a shim.
Reading `process.env` at module scope throws on workerd, freezes behavior at import time, and cannot
be changed per app or per test. @ref https://hono.dev/docs/helpers/adapter#env @ref
https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Decision

Source under `src/` uses only APIs defined by web standards or ECMAScript: `URL`, `URLSearchParams`,
`Response`, `Headers`, `JSON`. Nothing reads `process`, `Deno`, `Bun`, or `navigator`. Behavior that
depends on the deployment is an explicit option. Type-checking uses the `dom` lib for the web types
rather than `@types/node`. The build is `platform: 'neutral'`. CI runs the unit and end-to-end
suites on Node 22 and 24 and the smoke app (`e2e/jsonapi/smoke/`) on Bun, Deno, and workerd through
Miniflare.

## Consequences

The package runs unchanged on every Hono target and has no runtime dependencies. Cursor encoding,
which needs bytes, stays in the application's pagination engine, where `btoa` or a base64url helper
is a one-liner.
