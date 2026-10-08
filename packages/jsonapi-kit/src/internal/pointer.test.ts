import { describe, expect, it } from 'vitest';

import { escapePointerToken, pointer } from './pointer';

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
