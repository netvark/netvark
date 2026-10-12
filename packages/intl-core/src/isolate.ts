/**
 * Bidi isolation of interpolated values (SPEC 2, ADR 0006). A value
 * inserted into a sentence takes part in the sentence's bidirectional
 * resolution: a right-to-left name pulls the count after it to its left.
 * Between U+2068 and U+2069 the value counts as one neutral character
 * outside, and takes its own direction inside from its first strong
 * character.
 * @ref https://www.unicode.org/reports/tr9/#Explicit_Directional_Isolates (UAX #9 revision 52, 2.4)
 * @ref https://www.unicode.org/reports/tr9/#X5c (FSI: the direction of the first strong character)
 * @ref https://www.unicode.org/reports/tr9/#Formatting (6.3: wrap each unknown-direction insert in FSI and PDI)
 * @packageDocumentation
 */

/**
 * U+2068 FIRST STRONG ISOLATE. Typed `string`: a literal type would print
 * the invisible character itself in declarations and editor hovers.
 */
export const FIRST_STRONG_ISOLATE: string = '\u2068';

/** U+2069 POP DIRECTIONAL ISOLATE. */
export const POP_DIRECTIONAL_ISOLATE: string = '\u2069';

/**
 * Returns `value` between U+2068 and U+2069. Every string is wrapped, the
 * empty string and an already isolated one included, and the value is
 * never rewritten: one whose own isolate controls are unbalanced escapes,
 * so text accepted from users has `\p{Bidi_Control}` removed where it is
 * accepted.
 * @ref https://www.unicode.org/reports/tr9/#BD9 (an unmatched PDI or initiator pairs with the wrapper's)
 */
export function isolate(value: string): string {
  return FIRST_STRONG_ISOLATE + value + POP_DIRECTIONAL_ISOLATE;
}
