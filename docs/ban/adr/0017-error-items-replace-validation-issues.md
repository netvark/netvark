# ADR 0017: An error carries a list of error items, not a list of validation issues

- Status: accepted
- Date: 2026-10-08

## Context

hono-ban 1.x attached `issues: ValidationIssue[]` to a `BanError` only through `ban.validation()`,
and every format had a `renderValidation` / `validationSchema` pair for that one case. Three uses
did not fit:

- JSON:API lets one error document report several unrelated problems, each error object with its own
  `status`, `code`, and `title`, and tells the server to answer with "the most generally applicable
  HTTP error code". A validation issue has none of those members. @ref
  https://jsonapi.org/format/#errors-processing
- A batch of domain checks (three fields rejected by business rules, not by a schema) is a list of
  problems that is not validation, yet the only way to render a list was to pretend it was.
- Google's `BadRequest.fieldViolations` and Stripe's `param` render per-field problems whatever
  produced them. @ref https://google.aip.dev/193

`ValidationIssue` stays what validators produce: `path`, `message`, and the validator's `code`,
`expected`, `received`. The question was what the error itself should carry.

## Decision

`BanError` carries `errors?: ReadonlyArray<ErrorItem>`, settable through every factory
(`ban.badRequest({ errors })`), and `ban.validation(issues, { location })` becomes sugar that builds
the list with `itemsFromIssues`, sets `meta.location`, and defaults `detail` to
`'Request validation failed'`.

`ErrorItem` is the shape every list-bearing wire format shares. Only `detail` is required. An item
may name an input (`location`, `path`), carry the validator's `reason`, `expected`, and `received`,
hold per-item `meta`, and claim its own identity (`status`, `code`, `title`, `type`). `reason` holds
what `ValidationIssue.code` held, because `code` on an item means the catalog code, as it does on
the error.

The format interface renames the pair: `renderErrors(error, errors, ctx)` and
`errorsSchema(definition, ctx)`. Each built-in format decides what an item's members mean in its
shape:

- Problem Details and plain render `errors` entries (`location`, `pointer` or `name`, `detail`,
  `code` from `reason`, `expected`, `received`); an item's identity and `meta` are ignored because
  those documents describe one problem.
- JSON:API renders one error object per item with `source` and `meta` as before, and under
  `mixedEntries: true` honors per-item identity while `errorsSchema` loosens `status`, `code`, and
  `title` to strings (ADR 0011 forbids a body that contradicts a pinned schema, so the default keeps
  the error's identity on every object). `responseStatus(errors)` implements the specification's
  status rule for callers to pair with `ban.fromStatus()`.
- Google API renders one `fieldViolation` per item (`reason` upper-cased, else the item's `code`);
  Stripe renders the first item's `detail` and `path`.

`defineFormat` fills `renderErrors` and `errorsSchema` from `render` and `schema`, and the
conformance suite renders three lists per location (validator items, an empty list, mixed items) so
a format's schema is proven against whatever it chooses to render.

On the wire, Problem Details, plain, Google API, and Stripe validation bodies are unchanged; a
JSON:API validation document is unchanged with `mixedEntries` off.

## Consequences

- One shape serves validation, domain checks, and JSON:API multi-error documents; a JSON:API toolkit
  builds `ErrorItem`s and hands them to the catalog's factories.
- Breaking for 1.x code that read `error.issues` (now `error.errors`, with `message` as `detail` and
  `code` as `reason`), implemented `renderValidation` or `validationSchema` on a custom format, or
  used the `ValidationEntry` type (now `ErrorEntry`, with `location` optional).
- A format must decide what to do with members it cannot represent; the conformance suite makes that
  decision visible in its schema instead of leaving it to a consumer's first mixed document.
