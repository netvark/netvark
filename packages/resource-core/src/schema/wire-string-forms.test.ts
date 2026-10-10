import { describe, expect, it } from 'vitest';

import { formRow as row } from '../test-support/form-row';
import { issuesOf, wireSchema } from '../test-support/forms';

describe('booleans and uuids (SPEC 5.1)', () => {
  row(
    { type: 'bool' },
    [true, false],
    [
      ['true', 'type', 'boolean'],
      [1, 'type', 'boolean'],
    ],
  );
  row(
    { type: 'uuid' },
    [
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11',
    ],
    [
      ['{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}', 'format', 'uuid'],
      ['a0eebc999c0b4ef8bb6d6bb9bd380a11', 'format', 'uuid'],
      ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a1g', 'format', 'uuid'],
    ],
  );
});

describe('dates and times (SPEC 5.1, 5.2)', () => {
  row(
    { type: 'date' },
    ['2000-02-29', '0001-01-01', '9999-12-31'],
    [
      ['2100-02-29', 'format', 'date'],
      ['0000-01-01', 'format', 'date'],
      ['10000-01-01', 'format', 'date'],
      ['2020-1-1', 'format', 'date'],
      ['2020-01-32', 'format', 'date'],
      ['infinity', 'format', 'date'],
      ['2020-01-01T00:00:00', 'format', 'date'],
    ],
  );
  row(
    { type: 'timestamp' },
    [
      '2020-01-01T06:15:00',
      '2020-01-01t06:15:00.123456',
      '9999-12-31T23:59:59.999999',
    ],
    [
      ['2020-01-01T06:15', 'format', 'date-time-local'],
      // timestamp silently drops an offset.
      ['2020-01-01T06:15:00+02:00', 'format', 'date-time-local'],
      ['2020-01-01T06:15:00Z', 'format', 'date-time-local'],
      // Both roll over to the next minute or day.
      ['2020-12-31T23:59:60', 'format', 'date-time-local'],
      ['2020-12-31T24:00:00', 'format', 'date-time-local'],
      // A seventh fraction digit is rounded.
      ['2020-01-01T06:15:00.1234567', 'format', 'date-time-local'],
      ['2020-01-01 06:15:00', 'format', 'date-time-local'],
    ],
  );
  row(
    { type: 'timestamptz' },
    [
      '2020-01-01T06:15:00Z',
      '2020-01-01t06:15:00z',
      '2020-01-01T06:15:00.5+15:59',
      '2020-01-01T06:15:00-15:59',
      '2020-01-01T06:15:00-00:00',
      '0001-01-01T00:00:00Z',
      '0001-01-01T01:00:00+01:00',
      '9999-12-31T23:59:59.999999Z',
      '9999-12-31T21:59:59-02:00',
    ],
    [
      ['2020-01-01T06:15:00', 'format', 'date-time'],
      ['2020-01-01T06:15:00+16:00', 'format', 'date-time'],
      ['2020-01-01T06:15:00+01:00:30', 'format', 'date-time'],
      // 1 BC and the year 10000 in UTC, the read form.
      ['0001-01-01T00:00:00+01:00', 'format', 'date-time'],
      ['9999-12-31T23:00:00-02:00', 'format', 'date-time'],
      ['2020-01-01T06:15:00.1234567Z', 'format', 'date-time'],
    ],
  );
  // p rounds the fraction: a non-zero digit past it changes the value, zeros do not.
  row(
    { type: 'timestamp', precision: 3 },
    [
      '2020-01-01T06:15:00',
      '2020-01-01T06:15:00.123',
      '2020-01-01T06:15:00.120000',
      '9999-12-31T23:59:59.999',
    ],
    [
      ['2020-01-01T06:15:00.1234', 'format', 'date-time-local'],
      ['2020-01-01T06:15:00.000001', 'format', 'date-time-local'],
      // Rounds into the year 10000.
      ['9999-12-31T23:59:59.9995', 'format', 'date-time-local'],
      // Seven digits, though the seventh is a zero.
      ['2020-01-01T06:15:00.1230000', 'format', 'date-time-local'],
    ],
  );
  row(
    { type: 'timestamptz', precision: 0 },
    [
      '2020-01-01T06:15:00Z',
      '2020-01-01T06:15:00.000Z',
      '2020-01-01T06:15:00.000000+02:00',
    ],
    [
      ['2020-01-01T06:15:00.5Z', 'format', 'date-time'],
      ['9999-12-31T23:59:59.5Z', 'format', 'date-time'],
    ],
  );
});

describe('json and jsonb (SPEC 5.1, 5.2)', () => {
  const parsed: unknown = JSON.parse('{"__proto__": 1}');
  row(
    { type: 'json' },
    [{}, [], 'x', 0, false, { a: null }, [null], parsed, 'a\u0000', '\uD800'],
    [
      // null is SQL NULL, which nullability decides.
      [null, 'required'],
      [Number.NaN, 'format', 'json'],
      [new Date(0), 'format', 'json'],
    ],
  );
  row(
    { type: 'jsonb' },
    [{ k: '\u{1F600}' }, parsed],
    [
      ['a\u0000', 'format', 'text'],
      ['\uD800', 'format', 'text'],
    ],
  );

  it('points into the value at the first violation', () => {
    const schema = wireSchema({ type: 'jsonb' });
    expect(issuesOf(schema, { a: [1, { b: 'x\u0000' }] })).toEqual([
      { code: 'format', expected: 'text', path: ['a', 1, 'b'] },
    ]);
    expect(issuesOf(schema, { 'k\u0000': 1 })).toEqual([
      { code: 'format', expected: 'text', path: ['k\u0000'] },
    ]);
    expect(issuesOf(wireSchema({ type: 'json' }), [1, undefined])).toEqual([
      { code: 'format', expected: 'json', path: [1] },
    ]);
  });

  it('walks a deeply nested value without overflowing the stack', () => {
    let value: unknown = 'leaf';
    for (let depth = 0; depth < 100_000; depth += 1) {
      value = [value];
    }
    expect(issuesOf(wireSchema({ type: 'jsonb' }), value)).toEqual([]);
  });
});
