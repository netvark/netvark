# ADR 0010: Watch mode compiles again when what the load read changes

- Status: accepted
- Date: 2026-10-12

## Context

Paraglide's bundler plugins and its `compile --watch` compile again when a message file changes, but
with Paraglide's own `compile()`, which writes the messages without isolates (ADR 0007). An
application that compiles with the binding needs another way to compile on a change in development.
Four were considered:

1. Node's `--watch-path`, running a compile script again on each change under a path: Node supports
   it only on macOS and Windows
   ([Node CLI](https://nodejs.org/docs/latest-v24.x/api/cli.html#--watch-path)), and each run
   removes and rewrites the output directory under the dev server.
2. A bundler plugin around `compile()`: it ties the binding to one bundler, where a function runs
   from any bundler's hook or from a script.
3. Watching the files the settings name, such as the message-format plugin's `pathPattern`: each
   plugin names its files its own way, and the SDK reads more than the catalogs.
4. Watching what loading the project read, as Paraglide 2.27's CLI does: it loads through a file
   system that records each file read, watches those files and their directories, and compiles one
   at a time
   ([`tracked-fs.ts`](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/services/file-watching/tracked-fs.ts),
   [`compile/command.ts`](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/cli/commands/compile/command.ts)).
   Neither is exported: the package exports `.` and `./urlpattern-polyfill` only.

Measured on 2026-10-12 with the SDKs of Paraglide 2.11.0, 2.26.0, and 2.27.0 (2.10.2, 3.1.0, and
4.0): a load reads `settings.json`, a plugin given as a path, each catalog, and every file under
`project.inlang`, which it lists. The first load of a project writes the SDK's own files there after
listing it, and the plugins it fetched from a URL under `cache/plugins`; the SDK's `.gitignore`
keeps all of them but `settings.json` out of git, so each checkout starts there. A later load writes
nothing outside the output directory. Paraglide's `compile --watch` compiles on an event for any
file in a watched directory, but for those in its output directory or a `cache` directory: on
2.27.0, writing an editor's swap file beside a catalog compiled the project again. On macOS, Node
24.20, Bun 1.4.2, and Deno 2.9.7 reported a save as one to eight events in the same millisecond, and
reported a write made just before the watcher started. Node documents that on Linux and macOS a
watcher follows the inode it started on, so it misses a directory deleted and created again
([Inodes](https://nodejs.org/docs/latest-v24.x/api/fs.html#inodes)), and that an event's file name
can be missing; on macOS, the three runtimes still reported a write in a directory created again.
Node on macOS serves all of a process's watchers with one FSEvents stream, which it replaces
whenever a watcher starts or stops with one that reports from its own creation
([libuv `uv__fsevents_reschedule`](https://github.com/libuv/libuv/blob/v1.52.1/src/unix/fsevents.c#L398-L468)):
a write made just after a second watcher started went unreported 3 times in 500 on Node 24.20, once
in 350 on Bun 1.4.2, and never in 350 on Deno 2.9.7.

## Decision

`watch(options)` takes `compile()`'s options and two callbacks, compiles in `compile()`'s queue, and
resolves once the first compile has finished, whether or not it threw; `close()` stops it. Each
compile loads the project through a file system that records the path each `readFile` and `readdir`
reads, in its callback, synchronous, and promise forms, with the path's state just before the first
read: device, inode, size, and birth, modification, and status change times. `fs.watch()` watches
the directory of each file read and each directory listed, or the nearest existing ancestor of a
missing one, and starts again on a directory whose device, inode, or birth time changed or whose
watcher failed; starting or stopping a watcher counts as an event. An event is only a cue: once
events stop for 100 ms, as in Paraglide's `compile --watch`, each recorded path is compared with its
recorded state, and only a change compiles. The comparison runs again after each compile, so a
change made while a compile ran compiles even if no watcher saw it. With `cleanOutdir`, the first
compile starts from the hashes of the files already in the output directory, as Paraglide's CLI and
plugins seed theirs, so the directory is never removed under a dev server. A compile that throws
goes to `onError` (`console.error` by default) and the watch goes on. The binding offers no bundler
plugin: its README shows `watch()` in Vite's `configureServer` and `buildEnd` hooks, and in a
script.

## Consequences

An application compiles with isolates in development as in its build, under any bundler or none, and
a save compiles once: an editor's swap file, a late event, or a watcher started or stopped costs a
`stat` of each file the load read. Each compile is a whole compile, since Paraglide has no
incremental one. Measured on 2026-10-12 with Paraglide 2.27.0 on mirrored copies of the catalogs of
stern (85 messages) and a second application (2,120), each with its own plugins from a URL and with
the plugin from a path, on Node 24.20, Bun 1.4.2, and Deno 2.9.7: an edit compiled in 0.4 to 0.8 s
and in 3.1 to 4.2 s; a swap file compiled nothing; two catalogs saved together compiled once; a
message that formats went to `onError`, and its fix compiled (the second application's own plugin,
4.4.4, parses no formatting); and a restart over a current output rewrote none of its 2,129 files. A
Vite 8.3.4 dev server with the README's plugin had the output before `createServer()` resolved,
served an edit 0.4 to 0.8 s after the save, and let the process exit once closed, on all three
runtimes.

The first watch after a checkout compiles twice, because the SDK writes into the directory it
listed. The comparison trusts file times: on Deno, which reports them to the millisecond, a
directory replaced within a millisecond under a reused inode number is not told apart. File events
come from the operating system, which a network file system or a container's bind mount may not
deliver. Revisit when Paraglide exports its tracked file system or a compile that reuses a loaded
project, or if an SDK writes into the project on every load: the comparison would then compile again
after every compile.
