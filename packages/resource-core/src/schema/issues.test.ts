import type { ResourceIssue } from './issues';

import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  check,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { TEST_REGISTRIES } from '../test-support/definer';
import { ISSUE_KINDS } from './issue-kinds';

const declare = untypedDeclare(
  catalogOf({
    samples: table(
      'samples',
      {
        id: column({
          type: 'uuid',
          sqlType: 'uuid',
          nullable: false,
          default: { literal: null },
        }),
        body: column({ nullable: false }),
        count: column({ type: 'int4', sqlType: 'integer' }),
        score: column({ type: 'float8', sqlType: 'double precision' }),
        ratio: column({ type: 'float4', sqlType: 'real' }),
        active: column({ type: 'bool', sqlType: 'boolean' }),
        labels: column({ array: true, sqlType: 'text[]' }),
        ref: column({ type: 'uuid', sqlType: 'uuid' }),
        day: column({ type: 'date', sqlType: 'date' }),
        local_at: column({ type: 'timestamp', sqlType: 'timestamp' }),
        at: column({ type: 'timestamptz', sqlType: 'timestamptz' }),
        big: column({ type: 'int8', sqlType: 'bigint' }),
        amount: column({
          type: 'numeric',
          sqlType: 'numeric(5,2)',
          precision: 5,
          scale: 2,
        }),
        code: column({
          type: 'varchar',
          sqlType: 'character varying(3)',
          maxLength: 3,
        }),
        data: column({ type: 'jsonb', sqlType: 'jsonb' }),
        phone: column(),
        status: column(),
        handle: column(),
        rank: column({ type: 'int4', sqlType: 'integer' }),
      },
      {
        samples_body_check: check('body', {
          kind: 'length',
          min: 2,
          max: null,
        }),
        samples_status_check: check('status', {
          kind: 'enum',
          values: ['open', 'closed'],
        }),
        samples_handle_check: check('handle', {
          kind: 'pattern',
          source: '^@',
          flags: 'su',
        }),
        samples_rank_check: check('rank', {
          kind: 'range',
          min: { value: '1', inclusive: true },
          max: { value: '10', inclusive: false },
        }),
        samples_count_check: check('count', {
          kind: 'range',
          min: { value: '0', inclusive: false },
          max: { value: '100', inclusive: true },
        }),
        samples_code_check: check('code', null),
      },
    ),
  }),
  { codecs: TEST_REGISTRIES.codecs, validators: TEST_REGISTRIES.validators },
);

const Samples = declare('samples', {
  operations: ['create'],
  fields: {
    ...Object.fromEntries(
      [
        'body',
        'count',
        'score',
        'ratio',
        'active',
        'labels',
        'ref',
        'day',
        'local_at',
        'at',
        'big',
        'amount',
        'code',
        'data',
        'status',
        'handle',
        'rank',
      ].map((name) => [name, { access: 'readWrite' }]),
    ),
    phone: { access: 'readWrite', codec: 'phone' },
  },
  rules: { samples_code_check: { validator: 'room' } },
});

function only(value: object): ResourceIssue {
  const result = Samples.validate.create['~standard'].validate({
    body: 'ok',
    ...value,
  });
  expect(result.issues).toHaveLength(1);
  const [issue] = result.issues ?? [];
  if (issue === undefined) {
    throw new Error('no issue');
  }
  return issue;
}

type Row = readonly [
  input: object,
  path: ReadonlyArray<string | number>,
  code: string,
  expected: string | undefined,
  message: string,
];

/** One case per row of SPEC 6.4, each `expected` and message included. */
const ROWS: ReadonlyArray<Row> = [
  [
    { body: undefined },
    ['body'],
    'required',
    undefined,
    'A value is required.',
  ],
  [{ body: null }, ['body'], 'required', undefined, 'A value is required.'],
  [{ body: 5 }, ['body'], 'type', 'string', 'Must be a string.'],
  [{ count: '5' }, ['count'], 'type', 'integer', 'Must be an integer.'],
  [{ count: 1.5 }, ['count'], 'type', 'integer', 'Must be an integer.'],
  [{ score: '1' }, ['score'], 'type', 'number', 'Must be a number.'],
  [{ active: 'yes' }, ['active'], 'type', 'boolean', 'Must be a boolean.'],
  [{ labels: 'a' }, ['labels'], 'type', 'array', 'Must be an array.'],
  [{ labels: [null] }, ['labels', 0], 'type', 'string', 'Must be a string.'],
  [{ ref: 'x' }, ['ref'], 'format', 'uuid', 'Must be a UUID.'],
  [
    { day: '2026-02-30' },
    ['day'],
    'format',
    'date',
    'Must be a date (YYYY-MM-DD).',
  ],
  [
    { at: '2026-01-05T09:00:00' },
    ['at'],
    'format',
    'date-time',
    'Must be a date and time with an offset (RFC 3339).',
  ],
  [
    { localAt: '2026-01-05T09:00:00Z' },
    ['localAt'],
    'format',
    'date-time-local',
    'Must be a date and time without an offset (RFC 3339).',
  ],
  [
    { big: '1.0' },
    ['big'],
    'format',
    'int64',
    'Must be an integer written as a string.',
  ],
  [
    { amount: '1e2' },
    ['amount'],
    'format',
    'decimal',
    'Must be a decimal number written as a string.',
  ],
  [
    { ratio: 1e39 },
    ['ratio'],
    'format',
    'float',
    'Must be a number single precision can hold.',
  ],
  [
    { body: 'a\u0000b' },
    ['body'],
    'format',
    'text',
    'Must be text without U+0000 or unpaired surrogates.',
  ],
  [
    { data: { a: undefined } },
    ['data', 'a'],
    'format',
    'json',
    'Must be a JSON value.',
  ],
  [
    { phone: '0301234' },
    ['phone'],
    'format',
    'phone',
    'Must be a valid phone.',
  ],
  [{ body: 'a' }, ['body'], 'minLength', '2', 'Must be at least 2 characters.'],
  [
    { code: 'abcd' },
    ['code'],
    'maxLength',
    '3',
    'Must be at most 3 characters.',
  ],
  [{ rank: 0 }, ['rank'], 'minimum', '1', 'Must be at least 1.'],
  [{ count: 101 }, ['count'], 'maximum', '100', 'Must be at most 100.'],
  [{ count: 0 }, ['count'], 'exclusiveMinimum', '0', 'Must be greater than 0.'],
  [{ rank: 10 }, ['rank'], 'exclusiveMaximum', '10', 'Must be less than 10.'],
  [
    { amount: '1.005' },
    ['amount'],
    'multipleOf',
    '0.01',
    'Must be a multiple of 0.01.',
  ],
  [
    { status: 'gone' },
    ['status'],
    'enum',
    '["open","closed"]',
    'Must be one of: open, closed.',
  ],
  [
    { handle: 'ada' },
    ['handle'],
    'pattern',
    '^@',
    'Must match the required pattern.',
  ],
  [
    { extra: 1 },
    ['extra'],
    'additionalProperties',
    undefined,
    'Is not a member of this resource.',
  ],
  [
    { code: 'x-1' },
    ['code'],
    'SAMPLES_CODE_CHECK',
    undefined,
    'The value violates a constraint.',
  ],
];

describe('issues (SPEC 6.4)', () => {
  it.each(ROWS)('%j: %j %s %s', (input, path, code, expected, message) => {
    expect(only(input)).toEqual(
      expected === undefined
        ? { message, path, code }
        : { message, path, code, expected },
    );
  });

  it('covers every issue kind', () => {
    const codes = new Set(ROWS.map(([, , code]) => code));
    expect(ISSUE_KINDS.filter((kind) => !codes.has(kind))).toEqual([]);
  });

  it('never puts the value in a message or an expected', () => {
    const secret = 'S3cr3t-value';
    for (const value of [{ body: `${secret}\u0000` }, { code: `${secret}x` }]) {
      expect(JSON.stringify(only(value))).not.toContain(secret);
    }
  });
});
