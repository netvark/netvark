import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';

import { idMeta, valueMeta } from '../meta/value-meta';
import { KEY_SPECS, named, VALUE_SPECS } from '../test-support/value-specs';
import { codecSchema, withNull, wireSchema } from './value-schema';

describe('wireSchema', () => {
  it.each([
    ['varchar(3)', { type: 'string', maxLength: 3 }],
    [
      'int2',
      { type: 'integer', format: 'int16', minimum: -32_768, maximum: 32_767 },
    ],
    [
      'int8',
      { type: 'string', format: 'int64', pattern: '^(0|-?[1-9][0-9]{0,18})$' },
    ],
    [
      'numeric',
      {
        type: 'string',
        format: 'decimal',
        pattern: '^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$',
      },
    ],
    [
      'numeric(5,2)',
      {
        type: 'string',
        format: 'decimal',
        pattern: '^-?(0|[1-9][0-9]{0,2})(\\.[0-9]{1,2}0*)?$',
      },
    ],
    [
      'numeric(5,0)',
      {
        type: 'string',
        format: 'decimal',
        pattern: '^-?(0|[1-9][0-9]{0,4})(\\.0+)?$',
      },
    ],
    [
      'numeric(3,-2)',
      {
        type: 'string',
        format: 'decimal',
        pattern: '^-?(0|[1-9][0-9]{0,2}0{2})(\\.0+)?$',
      },
    ],
    [
      'numeric(2,4)',
      {
        type: 'string',
        format: 'decimal',
        pattern: '^-?0(\\.(0{2}[0-9]{1,2}0*|0+))?$',
      },
    ],
    ['float4', { type: 'number', format: 'float' }],
    ['bool', { type: 'boolean' }],
    ['uuid', { type: 'string', format: 'uuid' }],
    [
      'timestamp(0)',
      {
        type: 'string',
        format: 'date-time-local',
        pattern: '^[^.]*(\\.0+)?([Zz+-][^.]*)?$',
      },
    ],
    [
      'timestamptz',
      {
        type: 'string',
        format: 'date-time',
        pattern: '^[^.]*(\\.[0-9]{1,6}0*)?([Zz+-][^.]*)?$',
      },
    ],
    ['jsonb', {}],
    ['mood', { type: 'string', enum: ['calm', 'busy'] }],
    [
      'text with rules',
      {
        type: 'string',
        minLength: 2,
        maxLength: 5,
        allOf: [{ pattern: '^a[\\s\\S]c' }, { pattern: '[0-9]$' }],
      },
    ],
    [
      'int4 within 0 and 10',
      { type: 'integer', format: 'int32', exclusiveMinimum: 0, maximum: 10 },
    ],
    [
      'int8 above zero',
      { type: 'string', format: 'int64', pattern: '^(0|[1-9][0-9]{0,18})$' },
    ],
    [
      'numeric(5,2) within 0 and 500',
      {
        type: 'string',
        format: 'decimal',
        pattern: '^(0|[1-9][0-9]{0,2})(\\.[0-9]{1,2}0*)?$',
      },
    ],
    ['text[]', { type: 'array', items: { type: 'string' } }],
  ])('describes %s', (label, expected) => {
    expect(wireSchema(valueMeta(named(VALUE_SPECS, label)))).toEqual(expected);
  });

  it.each([
    ['an int4 key', { type: 'string', pattern: '^(0|-?[1-9][0-9]{0,9})$' }],
    [
      'an int8 key',
      { type: 'string', format: 'int64', pattern: '^(0|-?[1-9][0-9]{0,18})$' },
    ],
    [
      'a float8 key',
      {
        type: 'string',
        pattern: '^-?(0|[1-9][0-9]*)(\\.[0-9]*[1-9])?(e[+-][1-9][0-9]*)?$',
      },
    ],
    ['a bool key', { type: 'string', enum: ['true', 'false'] }],
  ])('describes the id of %s', (label, expected) => {
    expect(wireSchema(idMeta(named(KEY_SPECS, label)))).toEqual(expected);
  });
});

describe('withNull', () => {
  it('adds null to a single type and its enum, and wraps anything else', () => {
    expect(withNull({ type: 'string', enum: ['a'] })).toEqual({
      type: ['string', 'null'],
      enum: ['a', null],
    });
    expect(withNull({})).toEqual({});
    expect(withNull({ anyOf: [{ type: 'string' }] })).toEqual({
      anyOf: [{ anyOf: [{ type: 'string' }] }, { type: 'null' }],
    });
  });
});

describe('codecSchema', () => {
  it('converts the side the request or response reads, without $schema', () => {
    expect(codecSchema(z.array(z.number()).min(1), 'input')).toEqual({
      type: 'array',
      items: { type: 'number' },
      minItems: 1,
    });
    const piped = z.string().pipe(z.transform((text: string) => text.length));
    expect(codecSchema(piped, 'input')).toEqual({ type: 'string' });
    expect(codecSchema(piped, 'output')).toEqual({});
  });
});
