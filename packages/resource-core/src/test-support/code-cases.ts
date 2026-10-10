/**
 * The code case table (SPEC 4.2, 17): a code and whether it matches
 * `CODE_PATTERN`, `^[A-Z][A-Z0-9_]*$`. `isCode` and the type-level
 * `IsCode` (`names/code.test.ts`, `names/code.test-d.ts`) are both held to
 * it; the lengths cover the four-character steps of `IsCode`.
 * Not published with the package.
 * @packageDocumentation
 */

export const CODE_CASES = [
  ['A', true],
  ['AB', true],
  ['A1', true],
  ['A_', true],
  ['ABCD', true],
  ['ABCDE', true],
  ['CONTACTS_EMAIL_UNIQUE', true],
  ['NOTES_BODY_TEXT_NOT_NULL', true],
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789', true],
  ['', false],
  ['_A', false],
  ['1A', false],
  ['a', false],
  ['Ab', false],
  ['ABCDe', false],
  ['ABCDEFGHi', false],
  ['NOTES_GRÖSSE_CHECK', false],
  ['A B', false],
  ['A-B', false],
  ['LEGACY$NOTES_PKEY', false],
  ['AÉ', false],
] as const;
