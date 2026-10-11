/**
 * A catalog pattern as a JSON Schema `pattern` (SPEC 8, 13.1). A pattern
 * rule is a JavaScript source read with the flags `su` (catalog SPEC 8.4),
 * while JSON Schema's `pattern` takes a source alone, which validators
 * compile with `u` and without `s`. The `s` flag only changes what `.`
 * matches outside a character class, so each such `.` becomes `[\s\S]`,
 * which matches every code point under `u` as `.` does under `su`.
 * @ref https://json-schema.org/draft/2020-12/json-schema-validation#section-6.3.3
 * @ref https://tc39.es/ecma262/#sec-compiledotall (dotAll: `.` matches every character)
 * @packageDocumentation
 */

const ANY_CODE_POINT = '[\\s\\S]';

/** `source` read with `su`, written for a reader that applies `u` alone. */
export function dotAllSource(source: string): string {
  let result = '';
  let inClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source.charAt(index);
    if (character === '\\') {
      result += source.slice(index, index + 2);
      index += 1;
    } else if (inClass) {
      inClass = character !== ']';
      result += character;
    } else if (character === '[') {
      inClass = true;
      result += character;
    } else {
      result += character === '.' ? ANY_CODE_POINT : character;
    }
  }
  return result;
}
