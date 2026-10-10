/**
 * The fraction digits of `timestamp(p)` and `timestamptz(p)` (SPEC 5.1,
 * 5.2): PostgreSQL rounds a value to p digits, so the wire form refuses a
 * non-zero digit past p and keeps zeros there. The precision comes from the
 * column, from the domain that names the base type, through a domain over
 * that domain, and from an array column's element modifier; the boundary
 * fixtures follow it (SPEC 15.3).
 */
import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  column,
  domain,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { issuesOf, outputOf } from '../test-support/validation';
import { boundaryFixtures } from '../testing/boundary-fixtures';

const LOCAL = { type: 'timestamp', sqlType: 'timestamp without time zone' };
const ZONED = { type: 'timestamptz', sqlType: 'timestamp with time zone' };
const STAMP = { type: 'stamp', typeKind: 'domain', sqlType: 'stamp' } as const;

const declare = untypedDeclare(
  catalogOf(
    {
      events: table('events', {
        id: column({ type: 'uuid', sqlType: 'uuid', nullable: false }),
        plain: column(ZONED),
        whole: column({ ...ZONED, precision: 0 }),
        milli: column({ ...LOCAL, precision: 3 }),
        stamped: column(STAMP),
        late: column({ ...STAMP, type: 'late_stamp', sqlType: 'late_stamp' }),
        centis: column({ ...LOCAL, array: true, precision: 2 }),
      }),
    },
    {
      stamp: domain('stamp', { ...LOCAL, precision: 3 }),
      late_stamp: domain('late_stamp', STAMP),
    },
  ),
);

const Events = declare('events', {
  operations: ['update'],
  fields: {
    plain: { access: 'readWrite' },
    whole: { access: 'readWrite' },
    milli: { access: 'readWrite' },
    stamped: { access: 'readWrite' },
    late: { access: 'readWrite' },
    centis: { access: 'readWrite' },
  },
});

const issues = (value: object) => issuesOf(Events.validate.update, value);
const LOCAL_FORMAT = { code: 'format', expected: 'date-time-local' };
const ZONED_FORMAT = { code: 'format', expected: 'date-time' };

describe('the fraction digits of timestamp(p) (SPEC 5.1, 5.2)', () => {
  it('takes p digits from the column, a domain, a domain over it, and an array element', () => {
    const value = {
      plain: '2024-02-29T12:00:00.123456Z',
      whole: '2024-02-29T12:00:00Z',
      milli: '2024-02-29T12:00:00.123',
      stamped: '2024-02-29T12:00:00.123',
      late: '2024-02-29T12:00:00.123',
      centis: ['2024-02-29T12:00:00.12'],
    };
    expect(outputOf(Events.validate.update, value)).toEqual(value);
  });

  it('refuses a non-zero digit past p, which PostgreSQL would round away', () => {
    expect(
      issues({
        plain: '2024-02-29T12:00:00.1234567Z',
        whole: '2024-02-29T12:00:00.5Z',
        milli: '2024-02-29T12:00:00.1234',
        stamped: '2024-02-29T12:00:00.0001',
        late: '2024-02-29T12:00:00.1231',
        centis: ['2024-02-29T12:00:00.12', '2024-02-29T12:00:00.125'],
      }),
    ).toEqual([
      { ...ZONED_FORMAT, path: ['plain'] },
      { ...ZONED_FORMAT, path: ['whole'] },
      { ...LOCAL_FORMAT, path: ['milli'] },
      { ...LOCAL_FORMAT, path: ['stamped'] },
      { ...LOCAL_FORMAT, path: ['late'] },
      { ...LOCAL_FORMAT, path: ['centis', 1] },
    ]);
  });

  it('takes zeros past p up to six digits, which keep the instant', () => {
    // What Date.prototype.toISOString writes for a whole second.
    expect(issues({ whole: '2024-02-29T12:00:00.000Z' })).toEqual([]);
    expect(issues({ milli: '2024-02-29T12:00:00.120000' })).toEqual([]);
    expect(issues({ milli: '2024-02-29T12:00:00.1200000' })).toEqual([
      { ...LOCAL_FORMAT, path: ['milli'] },
    ]);
  });

  it('refuses the last microsecond where p rounds it into the year 10000', () => {
    expect(issues({ milli: '9999-12-31T23:59:59.999' })).toEqual([]);
    expect(issues({ milli: '9999-12-31T23:59:59.999999' })).toEqual([
      { ...LOCAL_FORMAT, path: ['milli'] },
    ]);
    expect(issues({ whole: '9999-12-31T23:59:59.5Z' })).toEqual([
      { ...ZONED_FORMAT, path: ['whole'] },
    ]);
  });
});

describe('boundary fixtures at the precision (SPEC 15.3)', () => {
  const { fields } = boundaryFixtures(Events);
  const labelled = (name: string, prefix: string) =>
    (fields[name] ?? [])
      .filter(({ label }) => label.startsWith(prefix))
      .map(({ value, label }) => [label, value]);

  it('probes p digits, one more, zeros past p, and the last instant at p', () => {
    expect(labelled('milli', 'fraction digits')).toEqual([
      ['fraction digits 3', '2024-02-29T12:00:00.123'],
      ['fraction digits 3, plus one', '2024-02-29T12:00:00.1234'],
      ['fraction digits 3, zeros past it', '2024-02-29T12:00:00.123000'],
      ['fraction digits 3, the last instant', '9999-12-31T23:59:59.999'],
    ]);
    expect(labelled('whole', 'fraction digits')).toEqual([
      ['fraction digits 0', '2024-02-29T12:00:00Z'],
      ['fraction digits 0, plus one', '2024-02-29T12:00:00.1Z'],
      ['fraction digits 0, zeros past it', '2024-02-29T12:00:00.000000Z'],
      ['fraction digits 0, the last instant', '9999-12-31T23:59:59Z'],
    ]);
    expect(labelled('late', 'fraction digits 3')).toHaveLength(4);
    expect(labelled('centis', 'an element: fraction digits 2')).toEqual([
      ['an element: fraction digits 2', ['2024-02-29T12:00:00.12']],
      ['an element: fraction digits 2, plus one', ['2024-02-29T12:00:00.123']],
      [
        'an element: fraction digits 2, zeros past it',
        ['2024-02-29T12:00:00.120000'],
      ],
      [
        'an element: fraction digits 2, the last instant',
        ['9999-12-31T23:59:59.99'],
      ],
    ]);
  });

  it('meets the fixed fixtures at six digits, each value once', () => {
    expect(labelled('plain', 'fraction digits')).toEqual([
      ['fraction digits 6', '2024-02-29T12:00:00.123456Z'],
    ]);
  });

  it('is accepted by the schema exactly where PostgreSQL keeps the value', () => {
    const verdicts = (fields['milli'] ?? [])
      .filter(({ label }) => label.startsWith('fraction digits'))
      .map(({ value, label }) => [
        label,
        issues({ milli: value }).length === 0,
      ]);
    expect(verdicts).toEqual([
      ['fraction digits 3', true],
      ['fraction digits 3, plus one', false],
      ['fraction digits 3, zeros past it', true],
      ['fraction digits 3, the last instant', true],
    ]);
  });
});
