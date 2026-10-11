/**
 * Names for generated objects: lower-case letters only after `_`, so each
 * derives a public name without `as` (SPEC 4.1), and distinct per index.
 * Not published with the package.
 * @packageDocumentation
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/** `a`, `b`, ..., `z`, `ba`, `bb`, ... for 0, 1, ..., 25, 26, 27, ... */
export function letters(index: number): string {
  let name = '';
  let rest = index;
  do {
    name = `${ALPHABET[rest % ALPHABET.length]!}${name}`;
    rest = Math.floor(rest / ALPHABET.length);
  } while (rest > 0);
  return name;
}
