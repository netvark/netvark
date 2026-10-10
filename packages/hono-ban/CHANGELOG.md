# @netvark/hono-ban

## 2.0.0

### Major Changes

- @netvark/hono-ban 2.0 is the Hono adapter for `@netvark/ban-core`, which now holds everything that
  does not need Hono. Every subpath keeps its name and exports (`@netvark/hono-ban/formats/json-api`
  is `@netvark/ban-core/formats/json-api`), `createBan` keeps `ban.onError()` for `app.onError()`, and
  the callbacks still receive the Hono `Context`. The root also exports `fromHttpException` and the
  core's new members (`ban.handler`, `fromRequest`, `isErrorStatus`, `ban.fromStatus`,
  `createBan({ adopt })`).
  
  Breaking changes:
  
  - `BanError` extends `Error`, not `HTTPException`. Hono middleware that throws `HTTPException` is
    still mapped into the catalog, now through the `adopt` hook (`fromHttpException`), with the same
    rules for status, message, `MALFORMED_JSON`, and response headers. A `BanError` that escapes
    without `app.onError(ban.onError())` is answered by Hono's default 500; code that relied on
    `instanceof HTTPException` must use `isBanError()`.
  - `status` fields are typed `ErrorStatusCode` (registered 4xx and 5xx) instead of
    `ContentfulStatusCode`; a non-standard status such as 499 needs an `ErrorStatusCode` cast.
  - `error.issues` is `error.errors`, a list of `ErrorItem` (`message` became `detail`, `code` became
    `reason`); every factory accepts `errors`, and `ban.validation()` defaults `detail` to
    `'Request validation failed'`.
  - Custom formats implement `renderErrors` and `errorsSchema` instead of `renderValidation` and
    `validationSchema`; `ValidationEntry` is `ErrorEntry` with `location` optional.
  - An `HTTPException` outside the 4xx and 5xx classes (a thrown redirect) is answered with its own
    response by `onError`, as Hono's default handler does, instead of being rendered as an error.
  - The catalog key `onError` is reserved, as before; `handler` and `fromStatus` are reserved too.
  
  Wire bodies for the built-in formats are unchanged for single errors and validation errors.
  
  This is the first release under the `@netvark` scope. Releases before 2.0.0 were published as
  `hono-ban`, without the scope; that name stays at 1.x and is deprecated in favor of
  `@netvark/hono-ban`.

### Patch Changes

- Updated dependencies []:
  - @netvark/ban-core@1.0.0

## 1.3.0

### Minor Changes

- [`dd1a1b1`](https://github.com/netvark/netvark/commit/dd1a1b1188aa722d263ab8592c26e1f097b63a51) Thanks [@ali-issa](https://github.com/ali-issa)! - `ban.validation()` accepts `cause`, and `hono-ban/postgresql` keeps its reporting contract for every
  mapping kind.
  
  - `ValidationOptions` gains an optional `cause`, stored on the error like every other `cause` and
    never rendered, so a converted validator or driver failure reaches `ErrorReport.error.cause`.
  - `postgresMapper()` passes the driver error as `cause` for `{ issue }` mappings too. Previously an
    ordinary mapping put it on `report.error.cause` and an issue mapping left that member undefined.
  - `postgresMapper()` reads `codes` entries as own properties, like `constraints` and `columns`, and
    rejects a `retryAfter` above `Number.MAX_SAFE_INTEGER`, whose `String()` form is exponential and
    not RFC 9110 `delay-seconds`.

## 1.2.0

### Minor Changes

- [`4a17ce0`](https://github.com/netvark/netvark/commit/4a17ce0676177c9ceff6f877731ab8f7ce513e2b) Thanks [@ali-issa](https://github.com/ali-issa)! - Add `hono-ban/postgresql`: `postgresMapper(options?)` turns a Postgres driver error into a catalog
  entry by SQLSTATE with constant client-facing text, for `createBan({ map })` or
  `ban.onError({ map })`.
  
  - Recognizes the errors of node-postgres, PGlite, postgres.js, Neon, and Bun, directly or through
    the `cause` of an ORM wrapper such as Drizzle's `DrizzleQueryError` (also Sequelize 6 `original`
    and Objection `nativeError`). Nothing from the driver's `message`, `detail`, or `hint` reaches
    `detail`, `meta`, or `headers`; the driver error stays on the report.
  - Built-in table: unique, exclusion, foreign key, and restrict violations are 409; not-null, check,
    and data exceptions are 422; serialization failures, deadlocks, `NOWAIT` locks, read-only
    replicas, and the connection, resource, and operator classes are 503, with `Retry-After` when
    `retryAfter` is set. Codes with no row (syntax, privilege, `RAISE`, statement timeout, commit
    outcome unknown) fall through to the handler's constant 500 with `handled: false`.
  - `constraints`, `columns`, and `codes` override the entry, detail, meta, and headers per constraint
    name, `table.column`, SQLSTATE, or class; a constraint or column can instead map to a validation
    error with one issue at a path.
  - `findPostgresError(value)` and `readPostgresFields(error)` are exported for `onReport` sinks.

## 1.1.0

### Minor Changes

- [`95a62e1`](https://github.com/netvark/netvark/commit/95a62e17f663f5f30522eda7fb76d4ef63b3487c) Thanks [@ali-issa](https://github.com/ali-issa)! - Validate options at construction instead of producing broken responses.
  
  - `problemDetails()` throws `TypeError` when `traceIdMember` names a reserved member (`status`,
    `id`, `errors`, ...) or is not an RFC 9457 extension member name; `jsonApi()` rejects a
    `traceIdMetaKey` the format writes itself (`stack`, `location`, `code`, ...) or that is not a
    JSON:API member name; `googleApi()` rejects a `traceIdMetadataKey` outside the
    `ErrorInfo.metadata` key grammar. Previously `traceIdMember: 'status'` replaced the numeric status
    with the trace id.
  - `ban.onError()` throws `TypeError` when `errorIdHeader`, `requestIdHeader`, or `headers` holds a
    name or value `Headers` rejects. Previously the failure surfaced inside the handler's last-resort
    fallback and the handler rejected.
  - `googleApi()` drops `meta` keys that do not match `[a-z][a-zA-Z0-9-_]+` or exceed 64 characters,
    as `error_details.proto` requires for `ErrorInfo.metadata`, and the 2020-12 schema states the rule
    with `propertyNames`. Keys such as `order.id` or `UserId` were previously sent as-is.

### Patch Changes

- [`95a62e1`](https://github.com/netvark/netvark/commit/95a62e17f663f5f30522eda7fb76d4ef63b3487c) Thanks [@ali-issa](https://github.com/ali-issa)! - Keep every rendered validation body inside its own schema and the handler inside its guarantee.
  
  - `jsonApi()` renders one summary error object for `ban.validation([])` instead of an empty `errors`
    array its schema rejects; `googleApi()` omits `BadRequest` when there are no issues instead of
    sending an empty `fieldViolations`.
  - `assertFormatConformance` from `hono-ban/testing` now also renders a validation error with no
    issues per location.
  - `ban.onError()` gains a third fallback tier: when the header merge itself throws, the response
    still carries `Content-Type`, `Cache-Control: no-store`, and the error id header.

## 1.0.0

### Major Changes

- [`efcb0b6`](https://github.com/netvark/netvark/commit/efcb0b6bd24a598bf0e8868bff9942ec248a7868) Thanks [@ali-issa](https://github.com/ali-issa)! - First 1.0 release. `createBan()` builds a typed error catalog with a factory per IANA status and per
  custom entry, `ban.onError()` renders every thrown value once through a pluggable format (RFC 9457
  Problem Details by default; JSON:API, Google API (AIP-193), Stripe, and plain built in;
  `defineFormat()` for your own), validator hooks for Zod, Valibot, and Standard Schema throw into the
  handler, `hono-ban/openapi` derives response schemas from the active format, and `hono-ban/otel`
  adds trace ids. Error responses carry `Cache-Control: no-store` unless you set one, and
  `bearerChallenge()` builds RFC 6750 and RFC 9728 `WWW-Authenticate` values. `hono` is the only peer
  dependency.

## 1.0.0-alpha.1

### Major Changes

- First 1.0 release. `createBan()` builds a typed error catalog with a factory per IANA status and per
  custom entry, `ban.onError()` renders every thrown value once through a pluggable format (RFC 9457
  Problem Details by default; JSON:API, Google API (AIP-193), Stripe, and plain built in;
  `defineFormat()` for your own), validator hooks for Zod, Valibot, and Standard Schema throw into the
  handler, `hono-ban/openapi` derives response schemas from the active format, and `hono-ban/otel`
  adds trace ids. Error responses carry `Cache-Control: no-store` unless you set one, and
  `bearerChallenge()` builds RFC 6750 and RFC 9728 `WWW-Authenticate` values. `hono` is the only peer
  dependency.

Release notes are generated by [Changesets](https://github.com/changesets/changesets) from the
entries in `.changeset/` when a version PR is merged.
