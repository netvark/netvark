/**
 * RFC 6901 JSON Pointer construction for `source.pointer` members.
 * @ref https://www.rfc-editor.org/rfc/rfc6901#section-3
 * @packageDocumentation
 */

/**
 * Escapes one reference token: `~` becomes `~0` before `/` becomes `~1`, the
 * order the RFC requires so `~1` in the input is not misread.
 */
export function escapePointerToken(token: string): string {
  return token.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** Builds a pointer from path segments; an empty path is the whole document. */
export function pointer(path: ReadonlyArray<string | number>): string {
  return path
    .map((segment) => `/${escapePointerToken(String(segment))}`)
    .join('');
}
