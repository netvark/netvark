# ADR 0009: Messages are functions; the i18n library owns the locale

- Status: accepted
- Date: 2026-10-10

## Context

ADR 0007 makes the ban handler's `transform` the localization point: titles and details are replaced
by code, item details by issue kind, and nothing else changes. Something has to hold the texts, pick
the language of a request, and fill in the member, the limit, and the options.

A first design held one object of template strings per locale
(`'{field} darf höchstens {limit} Zeichen lang sein.'`), with resource-core's own placeholder
syntax, and parsed `Accept-Language` itself (RFC 9110 12.5.4, RFC 4647 Lookup) to pick one. That is
a second message store and a second locale decision next to the application's i18n library. The
applications this family serves use Paraglide JS for every other text: messages live in
`messages/{locale}.json`, compile to typed functions (`m.max_length({ limit })`), plural and select
through variants, are checked by `inlang check`, and read the request's locale, which
`paraglideMiddleware` resolves with the application's strategies (URL, cookie, `Accept-Language`)
and keeps in `AsyncLocalStorage`. A template syntax of its own cannot express plurals, and an
`Accept-Language` parser of its own can disagree with the locale the rest of the response was
rendered in.

What only resource-core knows is which message and which inputs an error object needs: the code, its
constraint kind, the item's issue kind or validator code, the member its pointer leads to, the
labels of a constraint's members, the keyword's value, and the labels of the options an `enum` issue
lists. And only the declarations know the full set: every code, kind, member, and option a registry
can produce.

@ref https://paraglidejs.com/basics @ref https://paraglidejs.com/server-side-rendering @ref
https://paraglidejs.com/checking-translations @ref
https://www.rfc-editor.org/rfc/rfc9457#section-3.1.3

## Decision

- **Every message is a function**: a title or a label takes no inputs, a detail takes its kind's
  inputs (`{ field }`, `{ field, fields }`, `{ field, limit }`, `{ field, values }`, ...) and
  returns text. A compiled Paraglide message function fits a slot as it stands; plain closures fit
  too, so resource-core does not depend on Paraglide or any i18n library.
- **One messages object per application**, not one per locale: the functions read the locale
  themselves. resource-core neither parses `Accept-Language` nor sets `Content-Language`; the host
  sets the header to the locale its i18n layer chose and varies on what that choice read.
- **`MessagesFor` types the object over the registry**: a missing code, constraint kind, issue kind,
  member label, or option label fails `tsc`, and so does a message needing an input its kind does
  not receive. Paraglide types a message's inputs as the union of its variables across locales, so a
  typo in any locale fails the build. `defineMessages` repeats the key checks at runtime and
  requires a function in every slot.
- **The transform decides, the functions render.** `localizeErrors` picks the message and computes
  the inputs from the error object, its item, and the resources; a member the request's type does
  not have is never named, since its name came from the request.
- **`defaultMessages`** stays: English functions whose issue messages are the ones items carry
  before localization (SPEC 6.4), for applications without an i18n library and as the texts of codes
  an application has not translated yet.

## Consequences

Translators work in one store with one toolchain, plurals and grammatical variants come from the
i18n library, and the error response is in the same locale as everything else the request rendered.
The type check reaches into the translation files through the compiled declarations, which the
end-to-end suite verifies against the Paraglide compiler itself (SPEC 15.4).

A runtime check can no longer see a message's variables: a JavaScript caller learns of a mismatched
variable only from the rendered text. The locale must be in scope when the handler runs: with
Paraglide, the error handler has to run inside `paraglideMiddleware`, which Hono's `onError` does
when the middleware wraps `next()`. A host without request-scoped locale state passes functions that
close over the locale it chose.

Inside `ban.onError({ transform: localizeErrors(messages) })` the handler's context type is not
inferred yet when the transform's is, so `localizeErrors` takes its context type only from
`resource`, and a `resource` written there annotates its parameter.
