# ADR 0015: Resource links by convention, opt-in, with a configured definer

- Status: accepted
- Date: 2026-10-08

## Context

A resource object's `links.self` and a relationship object's `links.self` and `links.related` are
optional in JSON:API, and the specification does not define URL structure; its recommendations page
describes one design (`/articles/1`, `/articles/1/relationships/author`, `/articles/1/author`) and
says so. Every definition in this package spelled its link templates by hand, repeating the type and
a base URL per resource, and an application with twenty resources wrote the same three templates
twenty times. A link is a URI-reference, so a root-relative path is as valid as an absolute URL.
@ref https://jsonapi.org/recommendations/#urls @ref
https://jsonapi.org/format/1.1/#document-resource-object-links @ref
https://jsonapi.org/format/1.1/#document-links-link @ref
https://www.rfc-editor.org/rfc/rfc3986#section-4.1

## Decision

- A definition's `links` accepts `base` next to the `self` and `relationship` builders. With `base`,
  `self` is `<base>/<type>/<id>` and each relationship's links are
  `<base>/<type>/<id>/relationships/<name>` and `<base>/<type>/<id>/<name>`, every segment
  percent-encoded. A builder the definition gives wins over the derived one. `base` is `''` for
  root-relative links, a path starting with `/`, or an absolute URL; a trailing slash, a query, a
  fragment, or a relative path is a `TypeError` at definition time (ADR 0012).
- Nothing is derived without `base`: the recommendations are not normative, and a link that names a
  route the application does not serve is worse than no link, since clients follow it and `respond`
  derives the 201 `Location` from `self` (ADR 0005). Opting in is one member; the choice stays
  visible in the definition.
- `createDefineResource(defaults)` returns a `defineResource` that merges `defaults.links` under
  every definition's own `links`, member by member, so an application states its base once. A member
  the definition sets, even to `undefined`, replaces the default. The defaults live in the module
  that exports the configured definer, never in module-level state of the package: two applications
  in one process cannot collide, and nothing depends on import order (ADR 0003).

## Consequences

An application following the recommended design writes no link templates and gets `self`,
relationship `self`, and `related` on every resource, with the 201 `Location` for free. A definition
made with the raw `defineResource` instead of the configured one silently has no links; the READMEs
recommend exporting the configured definer from one module and banning the raw import with a lint
rule. Derived links promise routes: an application that does not serve `/<type>/<id>/<name>`
overrides `relationship` to omit `related`. Percent-encoding makes derived links differ from
hand-written templates for ids containing `/`, space, or `%`.
