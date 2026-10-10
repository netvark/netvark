import type { SqlNode } from '../sql/nodes';
import type { CheckSubject } from './subject';

import { describe, expect, it } from 'vitest';

import { parseExpression } from '../sql/parse';
import {
  BPCHAR,
  CITEXT,
  FLOAT4,
  FLOAT8,
  INT2,
  INT4,
  INT8,
  MOOD,
  NUMERIC,
  TEXT,
  TEXT_ARRAY,
  VARCHAR,
  column,
  nondeterministic,
  value,
  viaDomain,
} from '../test-support/subjects';
import {
  isEnum,
  isSubject,
  isTextual,
  numericFamily,
  subjectType,
} from './subject';

function node(sql: string): SqlNode {
  const parsed = parseExpression(sql);
  if (parsed === null) {
    throw new Error(`the test expression does not parse: ${sql}`);
  }
  return parsed;
}

describe('isSubject and subjectType: S of SPEC 8.3', () => {
  it.each<[string, CheckSubject, string, string | null]>([
    ['an uncast text column', column('tx', TEXT), 'tx', 'text'],
    ['a quoted column', column('tx', TEXT), '"tx"', 'text'],
    [
      'an uncast varchar column',
      column('vc', VARCHAR),
      'vc',
      'character varying',
    ],
    [
      'a varchar column cast to text',
      column('vc', VARCHAR),
      '(vc)::text',
      'text',
    ],
    [
      'casts in a chain',
      column('tx', TEXT),
      '((tx)::character varying)::text',
      'text',
    ],
    ['an uncast domain column', column('dt', viaDomain(TEXT)), 'dt', null],
    [
      'a domain column cast to text',
      column('dt', viaDomain(TEXT)),
      '(dt)::text',
      'text',
    ],
    [
      'a domain column cast to its base',
      column('dn', viaDomain(NUMERIC)),
      '(dn)::numeric',
      'numeric',
    ],
    ['VALUE', value(INT4), 'VALUE', 'integer'],
    [
      'VALUE of a domain over a domain',
      value(viaDomain(TEXT)),
      '(VALUE)::text',
      'text',
    ],
  ])('%s', (_title, subject, sql, type) => {
    expect(isSubject(node(sql), subject)).toBe(true);
    expect(subjectType(node(sql), subject)).toBe(type);
  });

  it.each<[string, CheckSubject, string]>([
    ['another column', column('tx', TEXT), 'other'],
    ['a cast to another type', column('i4', INT4), '(i4)::numeric'],
    [
      'a cast with a modifier',
      column('vc', VARCHAR),
      '(vc)::character varying(5)',
    ],
    ['a name the deparser would quote, unquoted', column('Tx', TEXT), 'Tx'],
    ['a name with $, unquoted', column('a$b', TEXT), 'a$b'],
    ['value in lower case for a domain', value(TEXT), 'value'],
    ['a quoted "VALUE" for a domain', value(TEXT), '"VALUE"'],
    [
      'VALUE for a column named VALUE, which prints quoted',
      column('VALUE', TEXT),
      'VALUE',
    ],
    ['a function of the subject', column('tx', TEXT), 'lower(tx)'],
  ])('%s is not the subject', (_title, subject, sql) => {
    expect(isSubject(node(sql), subject)).toBe(false);
    expect(subjectType(node(sql), subject)).toBeNull();
  });
});

describe('applicability (SPEC 8.1)', () => {
  it.each<[string, CheckSubject, boolean]>([
    ['text', column('x', TEXT), true],
    ['varchar', column('x', VARCHAR), true],
    ['a text domain', column('x', viaDomain(TEXT)), true],
    [
      'a nondeterministic collation',
      column('x', nondeterministic(TEXT)),
      false,
    ],
    ['citext', column('x', CITEXT), false],
    ['bpchar', column('x', BPCHAR), false],
    ['text[]', column('x', TEXT_ARRAY), false],
    ['an enum', column('x', MOOD), false],
  ])('isTextual: %s', (_title, subject, textual) => {
    expect(isTextual(subject)).toBe(textual);
  });

  it.each<[string, CheckSubject, boolean]>([
    ['an enum', column('x', MOOD), true],
    ['an enum array', column('x', { ...MOOD, array: true }), false],
    ['text', column('x', TEXT), false],
  ])('isEnum: %s', (_title, subject, enumerated) => {
    expect(isEnum(subject)).toBe(enumerated);
  });

  it.each<[string, CheckSubject, string | null]>([
    ['smallint', column('x', INT2), 'integer'],
    ['integer', column('x', INT4), 'integer'],
    ['bigint', column('x', INT8), 'integer'],
    ['numeric', column('x', NUMERIC), 'numeric'],
    ['float8', column('x', FLOAT8), 'float'],
    ['float4', column('x', FLOAT4), null],
    ['text', column('x', TEXT), null],
    ['an integer array', column('x', { ...INT4, array: true }), null],
    [
      'a type named int4 in another schema',
      column('x', { ...INT4, baseSchema: 'public' }),
      null,
    ],
  ])('numericFamily: %s', (_title, subject, family) => {
    expect(numericFamily(subject)).toBe(family);
  });
});
