import type { ColumnType } from '../../wire/column-type';
import type { OracleVerdict } from './types';

/**
 * How a write schema, a read schema, and the database disagree (SPEC 7.3,
 * 15.3): each branch of the comparison, a refusal as a report shows it, and
 * the read form a value outside the wire leaves to the adapter.
 */
import { describe, expect, it } from 'vitest';

import { readDisagreement, refusal, writeDisagreement } from './verdict';

const NUMERIC: ColumnType = { base: 'numeric', enum: false, array: false };
const ACCEPTED = { accepted: true, givesBack: () => true };
const REFUSED = {
  accepted: false,
  givesBack: (back: unknown) => back === '1.005',
};

function stored(text: string | null): OracleVerdict {
  return { accepted: true, stored: [text] };
}

const REFUSAL: OracleVerdict = {
  accepted: false,
  code: '23514',
  constraint: 'positive',
};

function positive(back: unknown): boolean {
  return typeof back === 'string' && !back.startsWith('-');
}

describe('refusal', () => {
  it('names the SQLSTATE and the constraint when there is one', () => {
    expect(
      refusal({ accepted: false, code: '23514', constraint: 'positive' }),
    ).toBe('23514 positive');
    expect(refusal({ accepted: false, code: '22003', constraint: null })).toBe(
      '22003',
    );
  });
});

describe('writeDisagreement', () => {
  it.each([
    [
      'an accepted value stored as sent',
      '1.5',
      ACCEPTED,
      '1.50',
      stored('1.50'),
      undefined,
    ],
    [
      'an accepted value refused',
      '1.5',
      ACCEPTED,
      undefined,
      REFUSAL,
      'the schema accepts it; the database refuses it (23514 positive)',
    ],
    [
      'an accepted value stored changed',
      '1.005',
      ACCEPTED,
      '1.01',
      stored('1.01'),
      'the schema accepts it; the database stores 1.01',
    ],
    [
      'an accepted value stored outside the read form',
      '1',
      ACCEPTED,
      'NaN',
      stored('NaN'),
      'the schema accepts it; the database stores NaN',
    ],
    ['a refused value refused', '-1', REFUSED, undefined, REFUSAL, undefined],
    [
      'a refused value stored changed',
      '1.005',
      { ...REFUSED, givesBack: () => false },
      '1.01',
      stored('1.01'),
      undefined,
    ],
    [
      'a refused value stored as sent',
      '1.005',
      REFUSED,
      '1.005',
      stored('1.005'),
      'the schema refuses it; the database stores it as sent',
    ],
    [
      'null stored as NULL when the schema takes null',
      null,
      ACCEPTED,
      null,
      stored(null),
      undefined,
    ],
    [
      'null stored as NULL when the schema refuses null',
      null,
      REFUSED,
      null,
      stored(null),
      'the schema refuses it; the database stores NULL',
    ],
    [
      'a value stored as NULL',
      '1',
      ACCEPTED,
      null,
      stored(null),
      'the schema accepts it; the database stores NULL',
    ],
  ])('judges %s', (_, sent, write, text, verdict, problem) => {
    expect(writeDisagreement(sent, write, text, verdict, NUMERIC)).toBe(
      problem,
    );
  });
});

describe('readDisagreement', () => {
  it('refuses a stored value the read schema refuses', () => {
    expect(readDisagreement('-1', NUMERIC, positive)).toBe(
      'the database stores -1, which the read schema refuses',
    );
  });

  it('leaves a refusal, NULL, and a value outside the read form alone', () => {
    expect(readDisagreement('1', NUMERIC, positive)).toBeUndefined();
    expect(readDisagreement(undefined, NUMERIC, positive)).toBeUndefined();
    expect(readDisagreement(null, NUMERIC, positive)).toBeUndefined();
    expect(readDisagreement('NaN', NUMERIC, () => false)).toBeUndefined();
  });
});
