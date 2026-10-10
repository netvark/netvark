/**
 * What every text wire form refuses (SPEC 5.2): U+0000, which every
 * PostgreSQL text type rejects with 22021, and an unpaired surrogate, which
 * the driver's UTF-8 encoding turns into U+FFFD, so the database would
 * store another string. Length limits count code points, as `char_length`
 * and `varchar(n)` do; Zod's `.max()` counts them since 4.5.0.
 * @ref https://www.postgresql.org/docs/18/datatype-character.html
 * @ref https://tc39.es/ecma262/#sec-string.prototype.iswellformed
 * @packageDocumentation
 */
import type { Violation } from '../schema/issue-kinds';

const NUL = '\u0000';
/**
 * In a Unicode-mode pattern a surrogate pair is one code point, so the
 * class matches only an unpaired surrogate: `String.prototype.isWellFormed`
 * without the ES2024 library.
 * @ref https://tc39.es/ecma262/#sec-pattern-semantics
 */
const UNPAIRED_SURROGATE = /[\uD800-\uDFFF]/u;

/** The violation every text type shares. */
export const TEXT_FORMAT: Violation = Object.freeze({
  kind: 'format',
  expected: 'text',
});

/** Whether PostgreSQL stores this string as it is. */
export function isStorableText(value: string): boolean {
  return !value.includes(NUL) && !UNPAIRED_SURROGATE.test(value);
}
