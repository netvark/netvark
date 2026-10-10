import type { SqlNode } from './nodes';

import { describe, expect, it } from 'vitest';

import { parseExpression } from './parse';

/** An S-expression of the tree, so expectations read at a glance. */
function show(node: SqlNode): string {
  switch (node.kind) {
    case 'or':
    case 'and': {
      return `(${node.kind} ${node.terms.map(show).join(' ')})`;
    }
    case 'binary': {
      return `(${node.operator} ${show(node.left)} ${show(node.right)})`;
    }
    case 'any': {
      return `(any ${show(node.left)} ${show(node.right)})`;
    }
    case 'nullTest': {
      return `(${node.negated ? 'notnull' : 'isnull'} ${show(node.operand)})`;
    }
    case 'call': {
      const name =
        node.schema === null ? node.name : `${node.schema}.${node.name}`;
      return `(call ${[name, ...node.args.map(show)].join(' ')})`;
    }
    case 'cast': {
      return `(:: ${show(node.operand)} <${node.type}>)`;
    }
    case 'array': {
      return `[${node.elements.map(show).join(' ')}]`;
    }
    case 'identifier': {
      return node.quoted ? `"${node.name}"` : node.name;
    }
    case 'string': {
      return `'${node.value}'`;
    }
    case 'number': {
      return node.text;
    }
    default: {
      return node satisfies never;
    }
  }
}

function nest(depth: number): string {
  return `${'('.repeat(depth)}x${')'.repeat(depth)}`;
}

function parsed(sql: string): string | null {
  const node = parseExpression(sql);
  return node === null ? null : show(node);
}

// The first group is the exact text PostgreSQL 14 and 18 deparse
// (pg_get_expr(conbin, ...)) for the CHECK named in each title.
describe('parseExpression: deparsed CHECK constraints (SPEC 8.2)', () => {
  it.each<[string, string, string]>([
    [
      'char_length(tx) between 1 and 200',
      '((char_length(tx) >= 1) AND (char_length(tx) <= 200))',
      '(and (>= (call char_length tx) 1) (<= (call char_length tx) 200))',
    ],
    [
      "text IN ('active', 'archived')",
      "(tx3 = ANY (ARRAY['active'::text, 'archived'::text]))",
      "(any tx3 [(:: 'active' <text>) (:: 'archived' <text>)])",
    ],
    [
      "varchar IN ('ab', 'cd')",
      "((vc2)::text = ANY ((ARRAY['ab'::character varying, 'cd'::character varying])::text[]))",
      "(any (:: vc2 <text>) (:: [(:: 'ab' <character varying>) (:: 'cd' <character varying>)] <text[]>))",
    ],
    [
      "tx5 is null or tx5 ~ '^https://'",
      "((tx5 IS NULL) OR (tx5 ~ '^https://'::text))",
      "(or (isnull tx5) (~ tx5 (:: '^https://' <text>)))",
    ],
    [
      'f8 < -1.5',
      "(f8 < ('-1.5'::numeric)::double precision)",
      "(< f8 (:: (:: '-1.5' <numeric>) <double precision>))",
    ],
    [
      'a quoted enum type',
      '(wm = ANY (ARRAY[\'a\'::"Weird Mood", \'b\'::"Weird Mood"]))',
      '(any wm [(:: \'a\' <"Weird Mood">) (:: \'b\' <"Weird Mood">)])',
    ],
    [
      'an enum of a schema outside the search path',
      "(lv = 'low'::other.level)",
      "(= lv (:: 'low' <other.level>))",
    ],
    [
      'a quoted column',
      '("Position" = \'x\'::text)',
      '(= "Position" (:: \'x\' <text>))',
    ],
    [
      'a domain range',
      '((VALUE >= (0)::numeric) AND (VALUE <= (100)::numeric))',
      '(and (>= VALUE (:: 0 <numeric>)) (<= VALUE (:: 100 <numeric>)))',
    ],
    ['is not null', '(nn IS NOT NULL)', '(notnull nn)'],
    [
      'a doubled quote',
      "(mo = ANY (ARRAY['happy'::mood, 'it''s'::mood]))",
      "(any mo [(:: 'happy' <mood>) (:: 'it's' <mood>)])",
    ],
    [
      'a backslash in a pattern',
      "((vc4)::text ~ '^\\+?[0-9 ]+$'::text)",
      "(~ (:: vc4 <text>) (:: '^\\+?[0-9 ]+$' <text>))",
    ],
    [
      'array_length(ar, 1) < 5',
      '(array_length(ar, 1) < 5)',
      '(< (call array_length ar 1) 5)',
    ],
  ])('%s', (_title, sql, tree) => {
    expect(parsed(sql)).toBe(tree);
  });
});

describe('parseExpression: precedence and grouping', () => {
  it.each<[string, string]>([
    ["a ~ 'x' = b", "(= (~ a 'x') b)"],
    ["a ~ 'x' ~ 'y'", "(~ (~ a 'x') 'y')"],
    ['a = b IS NULL', '(isnull (= a b))'],
    ['a IS NULL IS NOT NULL', '(notnull (isnull a))'],
    ['a OR b AND c', '(or a (and b c))'],
    ['((a OR b) OR c)', '(or a b c)'],
    ['(a AND (b AND c))', '(and a b c)'],
    ['(a OR (b AND c)) AND d', '(and (or a (and b c)) d)'],
    ['x::a::b', '(:: (:: x <a>) <b>)'],
    ['pg_catalog.char_length(x) > 0', '(> (call pg_catalog.char_length x) 0)'],
    ['"S".f()', '(call S.f)'],
    ['now()', '(call now)'],
    ['ARRAY[]::text[]', '(:: [] <text[]>)'],
    ['array[1, 2]', '[1 2]'],
    ['x = any (y)', '(any x y)'],
  ])('%s', (sql, tree) => {
    expect(parsed(sql)).toBe(tree);
  });
});

describe('parseExpression: type spellings as format_type prints them', () => {
  it.each<string>([
    'character varying',
    'character varying(10)[]',
    'double precision',
    'timestamp(3) with time zone',
    'time without time zone',
    'interval day to second(3)',
    'numeric(5,-2)',
    'bit varying(5)',
    '"char"',
    'other."Mixed Case"',
    'text[][]',
  ])('%s', (type) => {
    expect(parsed(`x::${type}`)).toBe(`(:: x <${type}>)`);
  });
});

describe('parseExpression: input outside SPEC 8.2 gives null', () => {
  it.each<[string, string]>([
    ['NOT', '(NOT (nn IS NULL))'],
    ['<> ALL', "(nin <> ALL (ARRAY['a'::text, 'b'::text]))"],
    ['<> ANY', "(nin <> ANY (ARRAY['a'::text]))"],
    ['COLLATE', '(col ~ (\'^a\'::text COLLATE "C"))'],
    ['chained comparisons', 'x < 1 < 2'],
    ['IS TRUE', 'x IS TRUE'],
    ['IS DISTINCT FROM', 'x IS DISTINCT FROM y'],
    ['CASE', 'CASE WHEN x THEN 1 END'],
    ['a subscript', '(x)[1]'],
    ['unary minus', '(x > -5)'],
    ['a NULL constant', 'x = NULL::text'],
    ['a boolean constant', '(x = true)'],
    ['OPERATOR()', "(x OPERATOR(pg_catalog.~) 'a'::text)"],
    ['a qualified column', 't.x > 0'],
    ['a qualifier before a string', "f.'a'"],
    ['an empty expression', ''],
    ['an open parenthesis', '((x)'],
    ['a stray parenthesis', '(x))'],
    ['an escape string', "x ~ E'\\\\d'"],
    ['a missing type', 'x::'],
    ['a type that is a parenthesis', 'x::('],
    ['an open modifier', 'x::numeric(5,'],
    ['a modifier that is not a number', 'x::numeric(a)'],
    ['ARRAY without brackets', 'ARRAY(1)'],
    ['a missing argument', 'f(,)'],
    ['two operators', 'x = = y'],
    ['an operator outside the tree', 'x + 1 > 2'],
    ['a trailing word', 'x IS NULL y'],
    ['a dangling OR', 'x OR'],
    ['ANY without parentheses', 'x = ANY y'],
  ])('%s', (_title, sql) => {
    expect(parseExpression(sql)).toBeNull();
  });

  it('caps nesting so deep input cannot exhaust the stack', () => {
    expect(parsed(nest(60))).toBe('x');
    expect(parseExpression(nest(100))).toBeNull();
    expect(parseExpression(`${'f('.repeat(10_000)}x`)).toBeNull();
  });

  it('never throws on token soup', () => {
    const pieces = [
      '(',
      ')',
      '[',
      ']',
      ',',
      '.',
      '::',
      'x',
      '"Q"',
      "'s'",
      '1',
      '2.5',
      'AND',
      'OR',
      'NOT',
      'IS',
      'NULL',
      'ANY',
      'ARRAY',
      '=',
      '<>',
      '<',
      '~',
      'text',
      'character',
      'varying',
      '-',
      '+',
    ];
    // A fixed linear congruential generator keeps the run reproducible.
    let seed = 7;
    const next = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed;
    };
    for (let run = 0; run < 3000; run += 1) {
      const length = next() % 12;
      const sql = Array.from(
        { length },
        () => pieces[next() % pieces.length],
      ).join(' ');
      expect(() => parseExpression(sql)).not.toThrow();
    }
  });
});
