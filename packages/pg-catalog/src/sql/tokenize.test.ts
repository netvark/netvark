import { describe, expect, it } from 'vitest';

import { tokenize } from './tokenize';

function kinds(sql: string): ReadonlyArray<string> | null {
  return tokenize(sql)?.map((token) => `${token.kind}:${token.text}`) ?? null;
}

describe('tokenize: what the deparser prints (SPEC 8.2)', () => {
  it('reads a CHECK expression as PostgreSQL 14 and 18 print it', () => {
    expect(
      kinds('((char_length(name) >= 1) AND (char_length(name) <= 200))'),
    ).toEqual([
      'punctuation:(',
      'punctuation:(',
      'word:char_length',
      'punctuation:(',
      'word:name',
      'punctuation:)',
      'operator:>=',
      'number:1',
      'punctuation:)',
      'word:AND',
      'punctuation:(',
      'word:char_length',
      'punctuation:(',
      'word:name',
      'punctuation:)',
      'operator:<=',
      'number:200',
      'punctuation:)',
      'punctuation:)',
    ]);
  });

  it('keeps the case of words: the deparser prints keywords upper case and identifiers lower case', () => {
    expect(kinds('(value IS NOT NULL)')).toEqual([
      'punctuation:(',
      'word:value',
      'word:IS',
      'word:NOT',
      'word:NULL',
      'punctuation:)',
    ]);
  });

  it('unescapes doubled quotes in string constants and quoted identifiers', () => {
    expect(kinds("'it''s a \\ backslash'::text")).toEqual([
      "string:it's a \\ backslash",
      'punctuation:::',
      'word:text',
    ]);
    expect(kinds('"Order ""Lines"""')).toEqual(['identifier:Order "Lines"']);
  });

  it('reads casts, arrays, qualified names, and the operators of checks', () => {
    expect(
      kinds("(code)::text = ANY ((ARRAY['a'::character varying])::text[])"),
    ).toEqual([
      'punctuation:(',
      'word:code',
      'punctuation:)',
      'punctuation:::',
      'word:text',
      'operator:=',
      'word:ANY',
      'punctuation:(',
      'punctuation:(',
      'word:ARRAY',
      'punctuation:[',
      'string:a',
      'punctuation:::',
      'word:character',
      'word:varying',
      'punctuation:]',
      'punctuation:)',
      'punctuation:::',
      'word:text',
      'punctuation:[',
      'punctuation:]',
      'punctuation:)',
    ]);
    expect(kinds("a <> b AND c ~* 'x' AND d !~ e || f")).toContain(
      'operator:~*',
    );
    expect(kinds('audit.event_kind')).toEqual([
      'word:audit',
      'punctuation:.',
      'word:event_kind',
    ]);
  });

  it('reads numbers with fractions and exponents, leaving signs to the operators', () => {
    expect(kinds('0.0100 1e+100 42')).toEqual([
      'number:0.0100',
      'number:1e+100',
      'number:42',
    ]);
  });

  it('records UTF-16 offsets for every token', () => {
    expect(tokenize("'x'::text")).toEqual([
      { kind: 'string', text: 'x', start: 0, end: 3 },
      { kind: 'punctuation', text: '::', start: 3, end: 5 },
      { kind: 'word', text: 'text', start: 5, end: 9 },
    ]);
  });

  it('returns an empty list for empty text', () => {
    expect(tokenize('  ')).toEqual([]);
  });
});

describe('tokenize: what it rejects', () => {
  it.each([
    ["E'a\\nb'", 'an escape string constant'],
    ["B'101'::bit(3)", 'a bit string constant'],
    ["X'1F'", 'a hexadecimal bit string'],
    ["U&'d\\0061t'", 'a Unicode escape string'],
    ["N'x'", 'a national character constant'],
    ["'unterminated", 'an unterminated string'],
    ["'ends with an escaped quote''", 'a string whose last quote is escaped'],
    ['"unterminated', 'an unterminated identifier'],
    ['$1', 'a parameter'],
    ['$$body$$', 'a dollar-quoted string'],
    ['a -- comment', 'a line comment'],
    ['a /* comment */', 'a block comment'],
    ['{1}', 'characters outside the token set'],
  ])('rejects %s (%s)', (sql) => {
    expect(tokenize(sql)).toBeNull();
  });

  it('keeps a word that merely precedes a quote after a space', () => {
    expect(kinds("x 'a'")).toEqual(['word:x', 'string:a']);
  });
});
