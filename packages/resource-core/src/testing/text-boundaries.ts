/**
 * Boundary fixtures of the text types and the options of an `enum` rule or
 * an enum type (SPEC 5.1, 5.2, 6.1): the empty string, an astral
 * character, U+0000, an unpaired surrogate, each length limit and its
 * neighbors in ASCII and in astral characters, and each option with a near
 * miss. `varchar(n)` and `bpchar(n)` drop trailing spaces past `n` instead
 * of failing, so a limit also gets a trailing space past it.
 * @ref https://www.postgresql.org/docs/18/datatype-character.html
 * @packageDocumentation
 */
import type { Limits } from '../schema/limits';
import type { BoundaryFixture } from './fixture';

import { fixture } from './fixture';

/** U+1F600, one code point and two UTF-16 code units. */
const ASTRAL = '\u{1F600}';

const BASICS: ReadonlyArray<BoundaryFixture> = [
  fixture('', 'the empty string'),
  fixture('a', 'one character'),
  fixture('a ', 'a trailing space'),
  fixture(ASTRAL, 'an astral character'),
  fixture('a\u0000b', 'U+0000'),
  fixture('a\uD800b', 'an unpaired surrogate'),
];

function maxLengthFixtures(max: number): ReadonlyArray<BoundaryFixture> {
  return [
    fixture('a'.repeat(max), `maxLength ${String(max)}`),
    fixture('a'.repeat(max + 1), `maxLength ${String(max)}, plus one`),
    fixture(
      ASTRAL.repeat(max),
      `maxLength ${String(max)} in astral characters`,
    ),
    fixture(
      ASTRAL.repeat(max + 1),
      `maxLength ${String(max)} in astral characters, plus one`,
    ),
    fixture(
      `${'a'.repeat(max)} `,
      `maxLength ${String(max)} and a trailing space`,
    ),
  ];
}

function minLengthFixtures(min: number): ReadonlyArray<BoundaryFixture> {
  if (min === 0) {
    return [];
  }
  const short = [
    fixture('a'.repeat(min), `minLength ${String(min)}`),
    fixture('a'.repeat(min - 1), `minLength ${String(min)}, minus one`),
  ];
  // Fewer code points but at least `min` UTF-16 units: a count of units would take it.
  return min > 1
    ? [
        ...short,
        fixture(
          ASTRAL.repeat(min - 1),
          `minLength ${String(min)} in astral characters, minus one`,
        ),
      ]
    : short;
}

/** Each option, and near misses: upper case, a trailing space, and a value that is no option. */
export function optionFixtures(
  options: ReadonlyArray<string>,
): ReadonlyArray<BoundaryFixture> {
  const misses = options.flatMap((option) => {
    const upper = option.toUpperCase();
    return [
      ...(upper === option || options.includes(upper)
        ? []
        : [fixture(upper, `option "${option}" in upper case`)]),
      fixture(`${option} `, `option "${option}" and a trailing space`),
    ];
  });
  return [
    ...options.map((option) => fixture(option, `option "${option}"`)),
    ...misses,
    fixture(`${options.join('')}_`, 'no option'),
  ];
}

/** The fixtures of a text value with these limits and options. */
export function textFixtures(
  limits: Limits,
  options: ReadonlyArray<string> | null,
): ReadonlyArray<BoundaryFixture> {
  return [
    ...BASICS,
    ...(limits.maxLength === null ? [] : maxLengthFixtures(limits.maxLength)),
    ...(limits.minLength === null ? [] : minLengthFixtures(limits.minLength)),
    ...(options === null ? [] : optionFixtures(options)),
  ];
}
