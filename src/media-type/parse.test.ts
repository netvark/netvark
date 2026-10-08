import { describe, expect, it } from 'vitest';

import {
  formatMediaType,
  formatParameterValue,
  quoteParameterValue,
} from './format';
import { isToken, parseAccept, parseMediaType } from './parse';

describe('parseMediaType', () => {
  it('lowercases type, subtype, and parameter names but not values', () => {
    expect(
      parseMediaType('Application/VND.API+JSON; EXT="https://X/Ext"'),
    ).toEqual({
      type: 'application',
      subtype: 'vnd.api+json',
      parameters: [{ name: 'ext', value: 'https://X/Ext' }],
    });
  });

  it('accepts token and quoted-string values with quoted-pairs', () => {
    const parsed = parseMediaType(
      'text/html;charset=utf-8; title="a \\"quoted\\" \\\\ value"',
    );
    expect(parsed?.parameters).toEqual([
      { name: 'charset', value: 'utf-8' },
      { name: 'title', value: 'a "quoted" \\ value' },
    ]);
  });

  it('tolerates optional whitespace and empty parameter slots', () => {
    expect(
      parseMediaType('  application/vnd.api+json ; ; ext="a b" ;  '),
    ).toEqual({
      type: 'application',
      subtype: 'vnd.api+json',
      parameters: [{ name: 'ext', value: 'a b' }],
    });
  });

  it('rejects values that do not match the grammar', () => {
    expect(parseMediaType('')).toBeUndefined();
    expect(parseMediaType('application')).toBeUndefined();
    expect(parseMediaType('application/')).toBeUndefined();
    expect(parseMediaType('application/json; charset')).toBeUndefined();
    expect(parseMediaType('application/json; charset=')).toBeUndefined();
    expect(parseMediaType('application/json; charset="open')).toBeUndefined();
    expect(parseMediaType('application/json; a=b c')).toBeUndefined();
    expect(parseMediaType('application/json, text/plain')).toBeUndefined();
    expect(parseMediaType('application/json; x="\u0001"')).toBeUndefined();
  });
});

describe('parseAccept', () => {
  it('returns ranges in field order with weight 1 by default', () => {
    expect(parseAccept('text/html, application/vnd.api+json')).toEqual([
      { type: 'text', subtype: 'html', parameters: [], weight: 1 },
      {
        type: 'application',
        subtype: 'vnd.api+json',
        parameters: [],
        weight: 1,
      },
    ]);
  });

  it('reads q as the weight regardless of its position', () => {
    const [first, second] = parseAccept(
      'a/b;q=0.5;x=1, c/d; x=2; q=0.1, */*;q=0',
    );
    expect(first).toEqual({
      type: 'a',
      subtype: 'b',
      parameters: [{ name: 'x', value: '1' }],
      weight: 0.5,
    });
    expect(second?.weight).toBe(0.1);
    expect(second?.parameters).toEqual([{ name: 'x', value: '2' }]);
    expect(parseAccept('*/*;q=0')[0]?.weight).toBe(0);
  });

  it('keeps commas inside quoted strings within one element', () => {
    const ranges = parseAccept(
      'application/vnd.api+json; profile="a,b c", text/plain',
    );
    expect(ranges).toHaveLength(2);
    expect(ranges[0]?.parameters).toEqual([
      { name: 'profile', value: 'a,b c' },
    ]);
  });

  it('skips empty and malformed elements without dropping the rest', () => {
    expect(
      parseAccept(', ,text/plain,, garbage, a/b;q=1.5, c/d;x="open, e/f'),
    ).toEqual([{ type: 'text', subtype: 'plain', parameters: [], weight: 1 }]);
    expect(parseAccept('')).toEqual([]);
    expect(parseAccept('   ')).toEqual([]);
  });

  it('accepts the three qvalue forms and rejects the rest', () => {
    expect(parseAccept('a/b;q=1.000')[0]?.weight).toBe(1);
    expect(parseAccept('a/b;q=0.123')[0]?.weight).toBe(0.123);
    expect(parseAccept('a/b;q=.5')).toEqual([]);
    expect(parseAccept('a/b;q=1.1')).toEqual([]);
    expect(parseAccept('a/b;q=0.1234')).toEqual([]);
  });
});

describe('formatting', () => {
  it('emits tokens bare and everything else quoted with escapes', () => {
    expect(isToken('utf-8')).toBe(true);
    expect(isToken('a b')).toBe(false);
    expect(formatParameterValue('utf-8')).toBe('utf-8');
    expect(formatParameterValue('')).toBe('""');
    expect(formatParameterValue('https://a/b c')).toBe('"https://a/b c"');
    expect(quoteParameterValue('say "hi" \\')).toBe('"say \\"hi\\" \\\\"');
    expect(() => quoteParameterValue('bad\u0000')).toThrow(TypeError);
  });

  it('round-trips through parseMediaType', () => {
    const formatted = formatMediaType({
      type: 'application',
      subtype: 'vnd.api+json',
      parameters: [
        { name: 'ext', value: 'https://a https://b' },
        { name: 'charset', value: 'utf-8' },
      ],
    });
    expect(formatted).toBe(
      'application/vnd.api+json; ext="https://a https://b"; charset=utf-8',
    );
    expect(parseMediaType(formatted)?.parameters).toEqual([
      { name: 'ext', value: 'https://a https://b' },
      { name: 'charset', value: 'utf-8' },
    ]);
  });
});
