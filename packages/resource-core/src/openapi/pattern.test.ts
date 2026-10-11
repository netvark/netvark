import { describe, expect, it } from 'vitest';

import { dotAllSource } from './pattern';

/** Strings that tell `.` under `su` from `.` under `u` alone. */
const PROBES = ['', 'a', '\n', 'a\nb', '\u2028', '😀', 'a.b', '[x]', '\\', ']'];

describe('dotAllSource', () => {
  it.each([
    ['^a.b$', '^a[\\s\\S]b$'],
    ['a\\.b', 'a\\.b'],
    ['[.]', '[.]'],
    ['[\\].]x.', '[\\].]x[\\s\\S]'],
    ['\\\\.', '\\\\[\\s\\S]'],
    ['^[0-9]{14}$', '^[0-9]{14}$'],
    ['\\p{L}.', '\\p{L}[\\s\\S]'],
    ['(?:.)+', '(?:[\\s\\S])+'],
  ])('rewrites %s as %s', (source, expected) => {
    expect(dotAllSource(source)).toBe(expected);
  });

  it.each([
    '^a.b$',
    'a\\.b',
    '[.]',
    '[\\].]x.',
    '\\\\.',
    '^.$',
    '.\\n.',
    '^[^.]+$',
  ])('matches what %s matches with su', (source) => {
    const original = new RegExp(source, 'su');
    const rewritten = new RegExp(dotAllSource(source), 'u');
    for (const probe of PROBES) {
      expect(rewritten.test(probe), JSON.stringify(probe)).toBe(
        original.test(probe),
      );
    }
  });
});
