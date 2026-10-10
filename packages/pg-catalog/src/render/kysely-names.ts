/**
 * TypeScript names for the Kysely types (SPEC 9.2): type names in
 * PascalCase from reference names, and member names written as identifiers
 * when they are identifiers and as string literals otherwise.
 * @packageDocumentation
 */

const WORD_BREAK = /[^A-Za-z0-9]+/u;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const LEADING_DIGIT = /^\d/u;
const HEX = 16;
const ESCAPE_WIDTH = 4;
/** The first code point that needs no escape in a string literal. */
const PRINTABLE = 0x20;
/** U+2028 and U+2029, which ended a line inside a string literal before ES2019. */
const LINE_SEPARATOR = String.fromCodePoint(0x20_28);
const PARAGRAPH_SEPARATOR = String.fromCodePoint(0x20_29);
const BACKSLASH = '\\';
/** Escapes beyond the other control characters, which become `\uXXXX`. */
const ESCAPES: ReadonlyMap<string, string> = new Map([
  [BACKSLASH, `${BACKSLASH}${BACKSLASH}`],
  ["'", `${BACKSLASH}'`],
  ['\n', `${BACKSLASH}n`],
  ['\r', `${BACKSLASH}r`],
  [LINE_SEPARATOR, `${BACKSLASH}u2028`],
  [PARAGRAPH_SEPARATOR, `${BACKSLASH}u2029`],
]);

/**
 * The reference name in PascalCase: split at every character outside
 * `[A-Za-z0-9]`, each part's first character upper-cased, joined, and
 * prefixed with `_` when the result is empty or starts with a digit.
 * `contact_phones` is `ContactPhones` and `audit.events` is `AuditEvents`.
 */
export function pascalCase(name: string): string {
  const joined = name
    .split(WORD_BREAK)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('');
  return joined === '' || LEADING_DIGIT.test(joined) ? `_${joined}` : joined;
}

function escape(character: string): string {
  const known = ESCAPES.get(character);
  if (known !== undefined) {
    return known;
  }
  const code = character.codePointAt(0) ?? PRINTABLE;
  return code < PRINTABLE
    ? `${BACKSLASH}u${code.toString(HEX).padStart(ESCAPE_WIDTH, '0')}`
    : character;
}

/** A single-quoted TypeScript string literal of `text`. */
export function stringLiteral(text: string): string {
  return `'${Array.from(text, escape).join('')}'`;
}

/** A member name: the name itself when it is an identifier, a string literal otherwise. */
export function memberName(name: string): string {
  return IDENTIFIER.test(name) ? name : stringLiteral(name);
}
