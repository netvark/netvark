# ADR 0007: Isolation rewrites the message patterns before Paraglide compiles them

- Status: accepted
- Date: 2026-10-12

## Context

Paraglide 2.27 compiles an expression part of a pattern to an interpolation in a template literal
(`` `Shared by ${i?.name}` ``) and has no option to wrap it
([`compile-pattern.ts`](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/compile-pattern.ts)).
There are three places to add the isolates:

1. The catalogs. The two characters are invisible, translators' editors strip them, and every
   locale's file would need them on every value.
2. Paraglide's emitted JavaScript, after `compile()`: rewrite each interpolation of each locale
   function. This works, and the application package this family generalizes does it, but it couples
   the build to the shape of generated code, which changed within Paraglide 2 (the JSDoc casts, the
   locale branches), so it needs a gate that fails on any shape it does not recognize.
3. The message patterns, between loading the project and compiling it. A pattern is the inlang SDK's
   documented data model, an array of `text`, `expression`, and markup parts, and Paraglide's own
   `compile()` is exactly `loadProjectFromDirectory()`, `compileProject()`, `writeOutput()`
   ([`compile.ts`](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/compile.ts#L58-L69)),
   all three exported. The SDK's `selectBundleNested()` and `upsertBundleNested()` read and write a
   bundle with its messages and variants across the SDK's table renames.

Measured on Paraglide 2.27.0 with inlang SDK 4.0.0 (2026-10-12): wrapping each expression of a
loaded project in two text parts and compiling it emits
`` `Shared by \u2068${i?.name}\u2069 (\u2068${i?.count}\u2069)` ``, the catalogs on disk are
byte-identical afterwards, and `loadProjectFromDirectory()` without a `syncInterval` writes nothing
back after the load.

## Decision

`@netvark/paraglide-intl`'s `compile()` is Paraglide's `compile()` with one step between the load
and the compile: for each message of an isolated locale, each variant's pattern with more than one
part has each `expression` part replaced by a text part U+2068, the part, and a text part U+2069,
written back with `upsertBundleNested()`. It takes Paraglide's compiler options and returns what
Paraglide's `compile()` returns.

## Consequences

The isolation follows the message model, so a change in Paraglide's code generation does not touch
it, and the output is Paraglide's own for the rewritten patterns. A change in the SDK's nested
bundle API does, which the peer range on `@inlang/sdk` and its floor test surface. An application
that runs Paraglide through its bundler plugin calls this `compile()` from its build script instead,
as one already does to compile ahead of the bundler; the binding offers no bundler plugin.
