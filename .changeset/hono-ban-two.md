---
'hono-ban': major
---

hono-ban 2.0 is the Hono adapter for `ban-kit`, which now holds everything that does not need Hono.
Every subpath keeps its name and exports (`hono-ban/formats/json-api` is
`ban-kit/formats/json-api`), `createBan` keeps `ban.onError()` for `app.onError()`, and the
callbacks still receive the Hono `Context`. The root also exports `fromHttpException` and the core's
new members (`ban.handler`, `fromRequest`, `isErrorStatus`, `ban.fromStatus`,
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
