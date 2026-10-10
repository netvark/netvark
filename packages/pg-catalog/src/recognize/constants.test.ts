import type { SqlNode } from '../sql/nodes';
import type { RangeConstant } from './constants';

import { describe, expect, it } from 'vitest';

import { parseExpression } from '../sql/parse';
import { lengthConstant, rangeConstant, stringConstant } from './constants';

function node(sql: string): SqlNode {
  const parsed = parseExpression(sql);
  if (parsed === null) {
    throw new Error(`the test expression does not parse: ${sql}`);
  }
  return parsed;
}

function integer(value: string): RangeConstant {
  return { value, family: 'integer' };
}
function numeric(value: string): RangeConstant {
  return { value, family: 'numeric' };
}
function float(value: string): RangeConstant {
  return { value, family: 'float' };
}

const ZEROS = '0'.repeat(400);

describe('rangeConstant: L of SPEC 8.3', () => {
  it.each<[string, string, RangeConstant | null]>([
    ['a bare integer is an integer', '5', integer('5')],
    [
      'a bare integer beyond int4 is a bigint',
      '3000000000',
      integer('3000000000'),
    ],
    [
      'a bare integer beyond int8 is numeric',
      '10000000000000000000',
      numeric('10000000000000000000'),
    ],
    ['a bare fraction is numeric', '0.5', numeric('0.5')],
    ['an exponent, which the deparser never prints bare', '1e5', null],
    ['a quoted negative integer', "'-10'::integer", integer('-10')],
    ['a quoted smallint', "'5'::smallint", integer('5')],
    [
      'the smallest bigint',
      "'-9223372036854775808'::bigint",
      integer('-9223372036854775808'),
    ],
    ['a quoted integer out of range', "'3000000000'::integer", null],
    ['a quoted fraction as an integer', "'1.5'::integer", null],
    ['a quoted numeric', "'-0.25'::numeric", numeric('-0.25')],
    ['a quoted double', "'0.5'::double precision", float('0.5')],
    ['a double in exponent form', "'1e+20'::double precision", null],
    ['NaN', "'NaN'::double precision", null],
    ['Infinity', "'Infinity'::numeric", null],
    ['a real, which rounds to single precision', "'1.5'::real", null],
    ['a quoted number cast to text', "'5'::text", null],
    ['(0)::numeric', '(0)::numeric', numeric('0')],
    ['(5)::bigint', '(5)::bigint', integer('5')],
    ['(1.5)::double precision', '(1.5)::double precision', float('1.5')],
    [
      "('-1.5'::numeric)::double precision",
      "('-1.5'::numeric)::double precision",
      float('-1.5'),
    ],
    ['(5.0)::integer keeps the integer text', '(5.0)::integer', integer('5')],
    [
      "('-0.0'::numeric)::integer is zero",
      "('-0.0'::numeric)::integer",
      integer('0'),
    ],
    ['(1.5)::integer rounds', '(1.5)::integer', null],
    [
      'an int8 that overflows int4 on every row',
      "('3000000000'::bigint)::integer",
      null,
    ],
    ['(40000)::smallint overflows', '(40000)::smallint', null],
    [
      "('-32768'::integer)::smallint fits",
      "('-32768'::integer)::smallint",
      integer('-32768'),
    ],
    ['a double overflow', `('1${ZEROS}'::numeric)::double precision`, null],
    ['a double underflow', `('0.${ZEROS}1'::numeric)::double precision`, null],
    [
      'zero as a double',
      "('0.000'::numeric)::double precision",
      float('0.000'),
    ],
    [
      'float8 to numeric keeps 15 digits',
      "('1.5'::double precision)::numeric",
      null,
    ],
    ['float8 to an integer rounds', "('2'::double precision)::integer", null],
    ['a cast with a modifier rounds', '(5.55)::numeric(3,1)', null],
    ['a cast to text', '(5)::text', null],
    ['a column', 'x', null],
  ])('%s', (_title, sql, constant) => {
    expect(rangeConstant(node(sql))).toEqual(constant);
  });

  it('walks a long cast chain without recursion', () => {
    expect(rangeConstant(node(`5${'::numeric'.repeat(10_000)}`))).toEqual(
      numeric('5'),
    );
  });
});

describe('lengthConstant: N of SPEC 8.3', () => {
  it.each<[string, number | null]>([
    ['5', 5],
    ['0', 0],
    ['9007199254740991', 9_007_199_254_740_991],
    ['9007199254740993', null],
    ['1.5', null],
    ["'5'::integer", null],
    ['(5)::bigint', null],
  ])('%s', (sql, bound) => {
    expect(lengthConstant(node(sql))).toBe(bound);
  });
});

describe('stringConstant', () => {
  const labels = new Set(['text', 'character varying']);

  it.each<[string, string | null]>([
    ["'a'::text", 'a'],
    ["'it''s'::character varying", "it's"],
    ["''::text", ''],
    ["'a'::character varying(1)", null],
    ["'a'::bpchar", null],
    ['(5)::text', null],
    ["'a'", null],
  ])('%s', (sql, text) => {
    expect(stringConstant(node(sql), labels)).toBe(text);
  });
});
