# @netvark/paraglide-intl

[Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) messages whose interpolated
values display in place in left-to-right and right-to-left text. `compile()` is Paraglide's
`compile()` with one step added: before Paraglide compiles the project, every interpolated value of
every message is wrapped in Unicode isolates. It re-exports
[`@netvark/intl-core`](https://www.npmjs.com/package/@netvark/intl-core), which formats dates and
numbers and isolates values in your own strings. The rules are written down in
[`docs/intl/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/intl/SPEC.md), and the
decisions, with their measurements, in
[`docs/intl/adr`](https://github.com/netvark/netvark/tree/main/docs/intl/adr).

## Install

```bash
pnpm add -D @netvark/paraglide-intl @inlang/paraglide-js
```

A build-time tool for Node 22.12+, Bun, and Deno 2.6.10+, with `@inlang/paraglide-js` 2.11 or later
as its peer. It loads your project with the inlang SDK that your Paraglide itself depends on, so
there is no SDK to install or match: a Paraglide release that moves to a new SDK major works as it
is. Application code imports the formatters from `@netvark/intl-core`, because this package's entry
also loads Paraglide's compiler.

On an older Deno, a compile with inlang SDK 3.1 or 4 finishes but the process does not exit, as with
Paraglide's own compile: the SDK runs its database in a `node:worker_threads` worker, and Deno
before 2.6.10 did not unref a worker reliably
([denoland/deno#32161](https://github.com/denoland/deno/pull/32161)). Run a compile script on Deno
with `--allow-read --allow-write --allow-env`: it reads the project and its plugins, writes the
output, and Paraglide's logger reads `TERM` and the variables that name a CI provider.

## Compile

```ts
// scripts/compile-messages.ts
import { compile } from '@netvark/paraglide-intl';

const { warnings } = await compile({
  project: './project.inlang',
  outdir: './src/lib/paraglide',
  strategy: ['cookie', 'baseLocale'],
});
for (const warning of warnings) console.warn(warning);
```

```json
{
  "scripts": {
    "build": "node scripts/compile-messages.ts && vite build"
  }
}
```

`compile()` takes Paraglide's compiler options, the same ones its `compile()`, CLI, and bundler
plugins take, and returns `{ outputHashes, warnings }`: pass the result back as
`previousCompilation` and only the files whose content changed are written, the directory is not
cleaned first, and files the previous compile wrote and this one does not are deleted. `warnings`
are the project's errors that did not stop the compile, such as a plugin that failed to import.
Compiles run one at a time, as Paraglide's do.

With the message `"Shared by {name} ({count})"`, `m.shared_by({ name: 'محمد', count: 2 })` returns
`'Shared by \u2068محمد\u2069 (\u20682\u2069)'`. In a sentence, the name and the count are each a
neutral unit in place: without the isolates, `(2)` displays before the Arabic name, because the
digits take their direction from the strong character before them
([UAX #9, W2 and W7](https://www.unicode.org/reports/tr9/#W2)). What is isolated:

- Every expression of a pattern that has more than one part, in every locale: the direction of a
  value is the data's, not the locale's. A plural still selects on the raw count; the count is
  isolated where the message prints it. Markup keeps its place.
- Not a message that is only the value, such as `"{name}"`: there is no surrounding text.
- `isolate: false` turns it off, and `isolate: ['ar']` limits it to the locales listed, each of
  which the project must declare.

Your catalogs are never changed. As it loads the project, the inlang SDK writes its own files into
`project.inlang` (`.gitignore`, `.meta.json`, `README.md`, `.lix/README.md`), as it does for
Paraglide's own compile. The compiled code writes U+2068 and U+2069, and any other bidi control a
catalog holds, as `\u` escapes, so the generated files show them instead of hiding them; the
messages return the same strings.

### A message never formats

Paraglide formats a value annotated in a message, such as `{amount: number}` and `{when: datetime}`,
or `{amount, number}`, `{when, date}`, and `#` in an ICU catalog, with the message's bare locale
code and, for a date, the runtime's time zone: the digits and the calendar depend on the engine, and
a date can render one way on the server and another in the browser. `compile()` refuses such a
message before it writes anything, with a `MessageFormattingError` that lists each one and holds
them in `findings`:

```text
compile: 2 values are formatted inside messages, with the engine's defaults; format each with @netvark/intl-core and interpolate the string, or pass formatters: 'allow'
  total (ar): amount: number
  total (en): amount: number
```

Format the value with `@netvark/intl-core` and interpolate the string. A plural still selects its
variant on the raw count, so pass the count and its text:

```json
{
  "total": "Total: {amount}",
  "items": [
    {
      "declarations": ["input count", "input countText", "local countPlural = count: plural"],
      "selectors": ["countPlural"],
      "match": {
        "countPlural=one": "{countText} item",
        "countPlural=other": "{countText} items"
      }
    }
  ]
}
```

```ts
// intl: createIntl() from @netvark/intl-core, created once at module scope
m.total({ amount: intl.number(1234.5, { style: 'currency', currency: 'SAR' }) });
m.items({ count, countText: intl.number(count) });
```

In an ICU catalog, write `{countText}` where `#` was:
`{count, plural, one {{countText} item} other {{countText} items}}`. `formatters: 'allow'` turns the
refusal off, for a project that accepts the engine's defaults.

### In place of Paraglide's CLI and bundler plugin

Paraglide's bundler plugins and its CLI call Paraglide's own `compile()`, which writes the messages
without isolates: replace `paraglide-js compile` in your scripts with your compile script, and
remove `paraglideVitePlugin` (or the webpack, Rollup, Rolldown, esbuild, or Rspack plugin) from your
bundler configuration, since it would overwrite the output. Run the script before the bundler, in
`build` and before `dev`; after you edit a message, run it again.

## Best practices

- **Compile in the build, not by hand.** Paraglide's output directory ignores itself in git
  (`emitGitIgnore`), so every checkout compiles it, from the catalogs, with the isolates.
- **Expect the isolates in tests** that compare a message with a value: `isolate(name)` from this
  package, or `'\u2068'` and `'\u2069'` around the value. Text copied from the page carries them
  too, so strip U+2066 to U+2069 from text a user pastes into a search field.
- **Remove bidi controls from names and other text you accept from users**, where you accept it:
  `value.replace(/\p{Bidi_Control}/gu, '')`. A value with an unmatched U+2069 of its own closes the
  isolate early
  ([ADR 0006](https://github.com/netvark/netvark/blob/main/docs/intl/adr/0006-every-interpolated-value-is-isolated-in-every-locale.md)).
- **Format in code, not in the message**: dates and numbers through `@netvark/intl-core`, so a value
  reads the same in a sentence as in a table cell, and the plural on the raw count.
- **Never interpolate into a message that is not displayed as text**: a URL, an `href`, an
  identifier. The isolates are characters and travel with the string.
- **Check catalogs with `inlang check`** in CI: Paraglide renders the base locale for a missing
  translation and the message key for a missing plural form
  ([ADR 0009](https://github.com/netvark/netvark/blob/main/docs/intl/adr/0009-catalog-consistency-is-left-to-inlang-check.md)).

## License

MIT
