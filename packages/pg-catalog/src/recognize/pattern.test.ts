import type { SqlSession } from '../target/session';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openPglite } from '../target/pglite';
import { openThrowawayDatabase } from '../target/server';
import { useSession } from '../target/session';
import { translatePattern } from './pattern';

/** Patterns inside SPEC 8.4, from real CHECKs and from the grammar's corners. */
const ACCEPTED: ReadonlyArray<string> = [
  '^https://',
  '^\\+?[0-9 ]+$',
  '^\\+[1-9][0-9]{6,14}$',
  '^[a-z]+$',
  '^[a-z0-9-]+$',
  '^[-a-z]+$',
  '^[^-]+$',
  '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
  '^[A-Z]{2}$',
  '^#[0-9a-fA-F]{6}$',
  '^(?:[a-z]+-)*[a-z]+$',
  '^(ab|cd)+?x{2,5}?$',
  'a|',
  '|a',
  '()',
  'x{0}',
  'x{255}',
  '.*',
  '^$',
  '\\/',
  '[\\]]',
  '[\\-]',
  '[\\^]',
  '[-]',
  '[--]',
  '[a-]',
  '^日本+$',
  '^𝒳.$',
  '',
];

/** Input that exercises newlines, code points, dashes, and the bracket edges. */
const INPUTS: ReadonlyArray<string> = [
  '',
  'a',
  'A',
  'ab',
  'abc',
  'a-b',
  'ab-cd',
  '-',
  ']',
  '^',
  '/',
  'x',
  'xx',
  'xxxxx',
  'abxx',
  'cdabxxx',
  'https://example.com',
  '+12 34',
  '+14155552671',
  '+1234567',
  '+123456',
  '+1234567890123456',
  '+0123456789',
  '12a',
  'DE',
  '#00ffAA',
  'user.name+tag@example.co',
  'a\nb',
  'x\ny',
  '日本本',
  '𝒳a',
  '𝒳\n',
  ' ',
];

function nest(depth: number): string {
  return `${'('.repeat(depth)}a${')'.repeat(depth)}`;
}

describe('translatePattern: the subset (SPEC 8.4)', () => {
  it.each(ACCEPTED)(
    'keeps %j unchanged, and it compiles with su',
    (pattern) => {
      expect(translatePattern(pattern)).toBe(pattern);
      expect(() => new RegExp(pattern, 'su')).not.toThrow();
    },
  );

  it.each<[string, string]>([
    ['a class escape', '^\\d+$'],
    ['a word escape', '\\w'],
    ['a space escape', '\\s'],
    ['a constraint escape', '\\bword'],
    ['a PostgreSQL word start', '\\mword'],
    ['a back reference', '(a)\\1'],
    ['a hex escape', '\\x41'],
    ['a code point escape', '\\u0041'],
    ['an escaped dash outside a bracket', 'a\\-b'],
    ['a dangling escape', 'a\\'],
    ['a lookahead', 'a(?=b)'],
    ['a negative lookahead', 'a(?!b)'],
    ['a lookbehind', '(?<=a)b'],
    ['an embedded option', '(?i)a'],
    ['a director', '***:a'],
    ['a POSIX class', '[[:alpha:]]'],
    ['a collating element', '[[.a.]]'],
    ['an equivalence class', '[[=a=]]'],
    ['a ] first, a literal only in PostgreSQL', '[]a]'],
    ['a ] first after ^', '[^]a]'],
    ['an empty bracket', '[]'],
    ['an empty negated bracket', '[^]'],
    ['a dash between ranges, an error in PostgreSQL', '[a-z-0]'],
    ['a reversed range', '[z-a]'],
    ['a range across letter cases', '[a-Z]'],
    ['a range from digits to letters', '[0-z]'],
    ['a caret inside a bracket', '[a^]'],
    ['an open bracket inside a bracket', '[a[]'],
    ['an unterminated bracket', '[a-z'],
    ['a bound above 255', 'x{256}'],
    ['a reversed bound', 'x{2,1}'],
    ['a bound without a minimum', 'x{,2}'],
    ['an open brace', 'x{'],
    ['a close brace', 'x}'],
    ['a bound with a space', 'x{1, 2}'],
    ['a bound with nothing to repeat', '{2}'],
    ['a quantified anchor', '^*'],
    ['a quantified end anchor', '$+'],
    ['two quantifiers', 'a**'],
    ['two bounds', 'a{2}{3}'],
    ['a quantifier after a lazy one', 'a*??'],
    ['a leading quantifier', '*a'],
    ['a quantifier after |', 'a|*'],
    ['a quantifier first in a group', '(*a)'],
    ['an unbalanced )', 'a)'],
    ['an unbalanced (', '(a'],
    ['an unbalanced ]', ']'],
  ])('rejects %s', (_title, pattern) => {
    expect(translatePattern(pattern)).toBeNull();
  });

  it('caps group nesting', () => {
    expect(translatePattern(nest(60))).toBe(nest(60));
    expect(translatePattern(nest(100))).toBeNull();
  });
});

const MATCHES_SQL = `select coalesce(json_agg(s.value ~ $2 order by s.position), '[]'::json)::text as data
from unnest($1::text[]) with ordinality as s(value, position)`;

/** Whether PostgreSQL matches each input against `pattern`, in order. */
async function postgresMatches(
  session: SqlSession,
  pattern: string,
): Promise<ReadonlyArray<boolean>> {
  const [row] = await session.query<{ data: string }>(MATCHES_SQL, [
    INPUTS,
    pattern,
  ]);
  return JSON.parse(row?.data ?? 'null') as ReadonlyArray<boolean>;
}

function javascriptMatches(pattern: string): ReadonlyArray<boolean> {
  const expression = new RegExp(pattern, 'su');
  return INPUTS.map((input) => expression.test(input));
}

describe('translatePattern: PostgreSQL 18 agrees on every accepted pattern', () => {
  let session: SqlSession;

  beforeAll(async () => {
    session = await openPglite([]);
  });

  afterAll(async () => {
    await session.close();
  });

  it.each(ACCEPTED)('%j matches the same input in both', async (pattern) => {
    expect(await postgresMatches(session, pattern)).toEqual(
      javascriptMatches(pattern),
    );
  });
});

describe.skipIf(process.env['CATALOG_PG_URL'] === undefined)(
  'translatePattern on a PostgreSQL server',
  () => {
    it('agrees with JavaScript on every accepted pattern', async () => {
      const url = process.env['CATALOG_PG_URL'] ?? '';
      await useSession(await openThrowawayDatabase(url), async (server) => {
        for (const pattern of ACCEPTED) {
          expect(await postgresMatches(server, pattern), pattern).toEqual(
            javascriptMatches(pattern),
          );
        }
      });
    });
  },
);
