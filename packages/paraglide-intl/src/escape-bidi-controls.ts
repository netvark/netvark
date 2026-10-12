/**
 * Every bidi control in the compiled code as a `\u` escape (SPEC 6.4): the
 * isolates the rewrite adds and any a catalog holds. Paraglide writes the
 * text of a pattern into the code as it is, where a raw control is
 * invisible in an editor and is what Trojan Source scanners flag. In
 * JavaScript, TypeScript, and JSON a control can stand only in a string, a
 * template, a regular expression, or a comment, and in the first three the
 * escape denotes the same character, so the compiled messages return the
 * same strings.
 * @ref https://tc39.es/ecma262/#prod-UnicodeEscapeSequence
 * @ref https://www.rfc-editor.org/rfc/rfc8259#section-7
 * @ref https://www.cve.org/CVERecord?id=CVE-2021-42574
 * @packageDocumentation
 */

const BIDI_CONTROL = /\p{Bidi_Control}/gu;
/** JavaScript, TypeScript (declarations included), and JSON files. */
const CODE_FILE = /\.(?:[cm]?[jt]s|json)$/u;
const HEX = 16;
const ESCAPE_DIGITS = 4;

/** `\u` and the four hex digits of `control`; every bidi control is in the BMP. */
function escaped(control: string): string {
  const code = control.codePointAt(0) ?? 0;
  return `\\u${code.toString(HEX).padStart(ESCAPE_DIGITS, '0')}`;
}

/** `output` with each bidi control of each code file written as an escape. */
export function escapeBidiControls(
  output: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(output).map(([path, text]) => [
      path,
      CODE_FILE.test(path) ? text.replace(BIDI_CONTROL, escaped) : text,
    ]),
  );
}
