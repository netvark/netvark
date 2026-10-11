import { describe, expect, it } from 'vitest';

import { isStorableText, paddedText } from './text';

describe('paddedText: bpchar(n) as PostgreSQL prints it (SPEC 3.4)', () => {
  it.each([
    ['ab', 4, 'ab  '],
    ['abcd', 4, 'abcd'],
    ['', 2, '  '],
    ['\u{1F44D}', 2, '\u{1F44D} '],
  ])('pads %j to %d code points as %j', (value, length, printed) => {
    expect(paddedText(value, length)).toBe(printed);
  });

  it('leaves a longer value as it is', () => {
    expect(paddedText('abcde', 4)).toBe('abcde');
  });
});

describe('isStorableText (SPEC 5.2)', () => {
  it('refuses U+0000 and an unpaired surrogate', () => {
    expect(isStorableText('a\u0000')).toBe(false);
    expect(isStorableText('\uD800')).toBe(false);
    expect(isStorableText('\u{1F44D}')).toBe(true);
  });
});
