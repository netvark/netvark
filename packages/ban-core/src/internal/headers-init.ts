/**
 * A structural copy of the Fetch Standard's `HeadersInit`, what
 * `new Headers(init)` takes, as TypeScript's DOM library types it. Vendored
 * so the declarations never name the DOM library's alias: Node's types
 * declare `Headers` but not `HeadersInit`, so a consumer that compiles
 * without the DOM library would read an unresolved name, or `any` where it
 * skips checking declarations. Any value the DOM library's alias accepts,
 * this accepts, and the reverse.
 * @ref https://fetch.spec.whatwg.org/#typedefdef-headersinit
 * @ref https://github.com/microsoft/TypeScript-DOM-lib-generator (generates lib.dom.d.ts, whose `HeadersInit` is `[string, string][] | Record<string, string> | Headers`)
 * @packageDocumentation
 */
export type HeadersInit =
  | Array<[string, string]>
  | Record<string, string>
  | Headers;
