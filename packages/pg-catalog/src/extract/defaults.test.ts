import type { DefaultBase } from './defaults';

import { describe, expect, it } from 'vitest';

import { defaultLiteral } from './defaults';

function builtin(name: string, spelling: string): DefaultBase {
  return { schema: 'pg_catalog', name, spelling };
}

const int2 = builtin('int2', 'smallint');
const int4 = builtin('int4', 'integer');
const int8 = builtin('int8', 'bigint');
const numeric = builtin('numeric', 'numeric');
const float4 = builtin('float4', 'real');
const float8 = builtin('float8', 'double precision');
const bool = builtin('bool', 'boolean');
const text = builtin('text', 'text');
const varchar = builtin('varchar', 'character varying');

// Every expression below is the exact text PostgreSQL 14 and 18 deparse for
// the default named in the case title (pg_get_expr(adbin, adrelid)).
describe('defaultLiteral: the forms get_const_expr prints (SPEC 7.3)', () => {
  it.each<[string, string, DefaultBase, string]>([
    ['numeric default 0', '0', numeric, '0'],
    ['float8 default 1', '1', float8, '1'],
    ['smallint default 3', '3', int2, '3'],
    ['domain over integer, default 7', '7', int4, '7'],
    [
      'numeric(10,2) default 1.555, which stores 1.56 as the input function would',
      '1.555',
      numeric,
      '1.555',
    ],
    ['real default 0.1', '0.1', float4, '0.1'],
    ['boolean default true', 'true', bool, 'true'],
    ['boolean default false', 'false', bool, 'false'],
    ['float8 default -0.5', "'-0.5'::numeric", float8, '-0.5'],
    ['bigint default -3', "'-3'::integer", int8, '-3'],
    ['integer default -3', "'-3'::integer", int4, '-3'],
    ['numeric default -3', "'-3'::integer", numeric, '-3'],
    ['bigint default 9999999999', "'9999999999'::bigint", int8, '9999999999'],
    ['numeric default 1e3', "'1000'::numeric", numeric, '1000'],
    ['varchar(10) default abc', "'abc'::character varying", varchar, 'abc'],
    ['domain over text, default a@b', "'a@b'::text", text, 'a@b'],
    [
      'text with a quote and a backslash',
      "'it''s a \\ backslash'::text",
      text,
      "it's a \\ backslash",
    ],
    ['text[] default {}', "'{}'::text[]", builtin('_text', 'text[]'), '{}'],
    [
      'an enum',
      "'happy'::mood",
      { schema: 'public', name: 'mood', spelling: 'mood' },
      'happy',
    ],
    [
      'an enum array',
      "'{happy}'::mood[]",
      { schema: 'public', name: '_mood', spelling: 'mood[]' },
      '{happy}',
    ],
    [
      'timestamptz under TimeZone UTC',
      "'2024-01-01 10:00:00+00'::timestamp with time zone",
      builtin('timestamptz', 'timestamp with time zone'),
      '2024-01-01 10:00:00+00',
    ],
    ['jsonb', '\'{"a": 1}\'::jsonb', builtin('jsonb', 'jsonb'), '{"a": 1}'],
    [
      'interval under IntervalStyle postgres',
      "'1 day 02:00:00'::interval",
      builtin('interval', 'interval'),
      '1 day 02:00:00',
    ],
    [
      'char(3), labeled bpchar rather than character',
      "'ab'::bpchar",
      builtin('bpchar', 'bpchar'),
      'ab',
    ],
    [
      'bit(3), whose label the deparser quotes',
      '\'101\'::"bit"',
      builtin('bit', '"bit"'),
      '101',
    ],
    [
      'int4range',
      "'[1,5)'::int4range",
      builtin('int4range', 'int4range'),
      '[1,5)',
    ],
    ['NaN on numeric', "'NaN'::numeric", numeric, 'NaN'],
  ])('%s', (_title, expression, base, literal) => {
    expect(defaultLiteral(expression, base)).toBe(literal);
  });
});

describe('defaultLiteral: what gives null', () => {
  it.each<[string, string, DefaultBase]>([
    ['integer default 1.5: the hidden cast stores 2', '1.5', int4],
    [
      'integer default -1.5 written as a numeric constant',
      "'-1.5'::numeric",
      int4,
    ],
    ['a boolean constant on a non-boolean column', 'true', int4],
    [
      'a number on a type outside the numeric family (money)',
      '0',
      builtin('money', 'money'),
    ],
    ['a cast label that is not the base type', "'abc'::text", varchar],
    [
      'an integral constant on a text column, converted by a hidden cast',
      "'-3'::integer",
      text,
    ],
    [
      'interval day: the label carries a modifier the base spelling lacks',
      "'1 day'::interval day",
      builtin('interval', 'interval'),
    ],
    [
      'an integer on a user type that shadows int4',
      '1',
      { schema: 'public', name: 'int4', spelling: 'int4' },
    ],
    ['a function call', 'gen_random_uuid()', builtin('uuid', 'uuid')],
    [
      'CURRENT_TIMESTAMP',
      'CURRENT_TIMESTAMP',
      builtin('timestamptz', 'timestamp with time zone'),
    ],
    ['a sequence default', "nextval('contacts_id_seq'::regclass)", int4],
    ['an array constructor', 'ARRAY[1, 2]', builtin('_int4', 'integer[]')],
    ['a COLLATE clause', '(\'a\'::text COLLATE "C")', text],
    ['an operator after the constant', "('x'::text || 'y'::text)", text],
    ['an expression after the cast', "'1'::integer + 1", int4],
    ['text the tokenizer rejects', "E'x'", text],
  ])('%s', (_title, expression, base) => {
    expect(defaultLiteral(expression, base)).toBeNull();
  });
});
