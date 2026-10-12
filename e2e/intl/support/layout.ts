/**
 * Lays out text as a renderer that implements the Unicode Bidirectional
 * Algorithm displays it, through bidi-js, which passes the algorithm's
 * conformance tests (UAX #9, C1). A layout is the characters from left to
 * right, mirrored where the algorithm mirrors them, without the invisible
 * bidi controls.
 * @ref https://www.unicode.org/reports/tr9/#C1
 * @ref https://github.com/lojjic/bidi-js#readme
 */
import bidiFactory from 'bidi-js';

/** A sentence: its text, and the values interpolated into it. */
export type Sentence = ReadonlyArray<string | { readonly value: string }>;

export type Direction = 'ltr' | 'rtl';

const bidi = bidiFactory();
const CONTROLS = /\p{Bidi_Control}/gu;
/** Outside an isolate, the isolate has "the effect of a neutral like U+FFFC" (UAX #9, 2.4). */
const OBJECT = '\uFFFC';

/** The layout of `text` in a paragraph of `direction`; `auto` takes its first strong character's. */
export function layout(text: string, direction: Direction | 'auto'): string {
  const levels = bidi.getEmbeddingLevels(text, direction);
  return bidi.getReorderedString(text, levels).replace(CONTROLS, '');
}

/** The sentence's text, with each value as `wrap` writes it. */
export function write(
  sentence: Sentence,
  wrap: (value: string) => string,
): string {
  return sentence
    .map((part) => (typeof part === 'string' ? part : wrap(part.value)))
    .join('');
}

/**
 * The layout UAX #9 prescribes for the sentence with every value isolated:
 * the sentence laid out with each value replaced by U+FFFC, and each U+FFFC
 * then replaced by its value laid out as a paragraph of its own (rule X5c).
 * @ref https://www.unicode.org/reports/tr9/#Explicit_Directional_Isolates
 * @ref https://www.unicode.org/reports/tr9/#X5c
 */
export function isolatedLayout(
  sentence: Sentence,
  direction: Direction,
): string {
  const text = write(sentence, () => OBJECT);
  const values = new Map<number, string>();
  let offset = 0;
  for (const part of sentence) {
    if (typeof part === 'string') {
      offset += part.length;
    } else {
      values.set(offset, part.value);
      offset += OBJECT.length;
    }
  }
  const levels = bidi.getEmbeddingLevels(text, direction);
  const mirrored = bidi.getMirroredCharactersMap(text, levels.levels);
  return bidi
    .getReorderedIndices(text, levels)
    .map((index) => {
      const value = values.get(index);
      return value === undefined
        ? (mirrored.get(index) ?? text.charAt(index))
        : layout(value, 'auto');
    })
    .join('');
}
