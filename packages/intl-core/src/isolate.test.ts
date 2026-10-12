import { describe, expect, it } from 'vitest';

import {
  FIRST_STRONG_ISOLATE,
  isolate,
  POP_DIRECTIONAL_ISOLATE,
} from './isolate';

const codePoints = (text: string): Array<number | undefined> =>
  Array.from(text, (character) => character.codePointAt(0));

describe('isolate', () => {
  it('uses U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE', () => {
    expect(codePoints(FIRST_STRONG_ISOLATE)).toEqual([0x2068]);
    expect(codePoints(POP_DIRECTIONAL_ISOLATE)).toEqual([0x2069]);
  });

  it('puts the value between the two, unchanged', () => {
    expect(codePoints(isolate('محمد'))).toEqual([
      0x2068, 0x645, 0x62d, 0x645, 0x62f, 0x2069,
    ]);
    expect(isolate('Casey (Ops)')).toBe('\u2068Casey (Ops)\u2069');
  });

  it('wraps the empty string', () => {
    expect(isolate('')).toBe('\u2068\u2069');
  });

  it('wraps an isolated value again, so the result never depends on the content', () => {
    expect(isolate(isolate('v2'))).toBe('\u2068\u2068v2\u2069\u2069');
  });

  it('leaves the controls inside a value as they are', () => {
    expect(isolate('a\u2069\u202Exyz')).toBe('\u2068a\u2069\u202Exyz\u2069');
  });
});
