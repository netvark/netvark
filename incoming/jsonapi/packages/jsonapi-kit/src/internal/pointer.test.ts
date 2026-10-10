import { describe, expect, it } from 'vitest';

import {
  escapePointerToken,
  pathFromPointer,
  pointer,
  unescapePointerToken,
} from './pointer';

describe('pointer', () => {
  it('escapes ~ before / per RFC 6901 section 3', () => {
    expect(escapePointerToken('a/b')).toBe('a~1b');
    expect(escapePointerToken('a~b')).toBe('a~0b');
    expect(escapePointerToken('a~1b')).toBe('a~01b');
  });

  it('joins segments and stringifies indexes', () => {
    expect(pointer(['data', 'attributes', 'title'])).toBe(
      '/data/attributes/title',
    );
    expect(pointer(['atomic:operations', 3, 'ref', 'type'])).toBe(
      '/atomic:operations/3/ref/type',
    );
    expect(pointer([])).toBe('');
    expect(pointer([''])).toBe('/');
  });
});

describe('pathFromPointer', () => {
  it('unescapes ~1 before ~0 per RFC 6901 section 4', () => {
    expect(unescapePointerToken('a~1b')).toBe('a/b');
    expect(unescapePointerToken('a~0b')).toBe('a~b');
    // `~01` is the escape of `~1`, never `/`.
    expect(unescapePointerToken('a~01b')).toBe('a~1b');
  });

  it('inverts pointer() for every path, the whole document included', () => {
    for (const path of [
      [],
      [''],
      ['data', 'attributes', 'title'],
      ['atomic:operations', '3', 'ref', 'type'],
      ['a/b', 'c~d', 'e~1f', ' '],
    ]) {
      expect(pathFromPointer(pointer(path))).toEqual(path);
    }
    expect(pathFromPointer('/data//x')).toEqual(['data', '', 'x']);
  });

  it('rejects text that is not a pointer', () => {
    expect(() => pathFromPointer('data/id')).toThrow(TypeError);
    expect(() => pathFromPointer('#/data')).toThrow(/must be empty or start/u);
  });
});
