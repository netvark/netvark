import type { FieldLimits } from '../meta/types';

import { describe, expect, it } from 'vitest';

import { formPattern } from './form-pattern';

const NONE: FieldLimits = {
  minLength: null,
  maxLength: null,
  minimum: null,
  exclusiveMinimum: null,
  maximum: null,
  exclusiveMaximum: null,
  multipleOf: null,
  patterns: [],
};
const INT8 = {
  minimum: '-9223372036854775808',
  maximum: '9223372036854775807',
};
const INT4 = { minimum: '-2147483648', maximum: '2147483647' };
const INT2 = { minimum: '-32768', maximum: '32767' };

/**
 * `10^exponent` as decimal text. Floating-point `10 ** -4` is
 * `0.00009999999999999999` in V8 before Node.js 24, so the limits are
 * written out digit by digit.
 */
function powerOfTenText(exponent: number): string {
  return exponent >= 0
    ? `1${'0'.repeat(exponent)}`
    : `0.${'0'.repeat(-exponent - 1)}1`;
}

function numeric(precision: number, scale: number): Partial<FieldLimits> {
  const bound = powerOfTenText(precision - scale);
  return {
    exclusiveMinimum: `-${bound}`,
    exclusiveMaximum: bound,
    multipleOf: powerOfTenText(-scale),
  };
}

const DATE_TIMES = ['2024-02-29T12:00:00', '2024-02-29t12:00:00Z'] as const;

interface Case {
  readonly format: string | null;
  readonly fractionDigits?: number;
  readonly limits?: Partial<FieldLimits>;
  readonly accepted: ReadonlyArray<string>;
  readonly refused: ReadonlyArray<string>;
}

const CASES: ReadonlyArray<readonly [string, Case]> = [
  [
    'numeric',
    {
      format: 'decimal',
      accepted: ['0', '-12.5', `${'9'.repeat(40)}.000001`],
      refused: ['01', '1.', '.5', '+1', '1e5'],
    },
  ],
  [
    'numeric(5,2)',
    {
      format: 'decimal',
      limits: numeric(5, 2),
      accepted: ['999.99', '-999.99', '0.5', '1.50', '1.500', '0'],
      refused: ['1000', '-1000', '1000.00', '0.001', '9999'],
    },
  ],
  [
    'numeric(3,-2)',
    {
      format: 'decimal',
      limits: numeric(3, -2),
      accepted: ['99900', '-100', '0', '500.0'],
      refused: ['100000', '150', '5'],
    },
  ],
  [
    'numeric(2,4)',
    {
      format: 'decimal',
      limits: numeric(2, 4),
      accepted: ['0.0099', '-0.001', '0.00990', '0', '0.0', '0.00'],
      refused: ['0.01', '0.1', '1', '0.00001'],
    },
  ],
  [
    'numeric(2,2)',
    {
      format: 'decimal',
      limits: numeric(2, 2),
      accepted: ['0.99', '0.990', '-0.5', '0'],
      refused: ['1', '1.00', '0.999'],
    },
  ],
  [
    'numeric(5,2) within 0 and 500',
    {
      format: 'decimal',
      limits: {
        ...numeric(5, 2),
        exclusiveMinimum: null,
        exclusiveMaximum: null,
        minimum: '0',
        maximum: '500',
      },
      accepted: ['500', '499.99', '999.99', '0'],
      refused: ['-1', '1000', '-0.5'],
    },
  ],
  [
    'numeric(6,2) within -1000 and 1000',
    {
      format: 'decimal',
      limits: { minimum: '-1000', maximum: '1000', multipleOf: '0.01' },
      accepted: ['1000', '-1000', '1000.00', '9999.99'],
      refused: ['10000', '1000.001'],
    },
  ],
  [
    'numeric above -1000 and at most 1000',
    {
      format: 'decimal',
      limits: { exclusiveMinimum: '-1000', maximum: '1000' },
      accepted: ['1000', '-999.5'],
      refused: ['10000'],
    },
  ],
  [
    'numeric at least -1000 and below 1000',
    {
      format: 'decimal',
      limits: { minimum: '-1000', exclusiveMaximum: '1000' },
      accepted: ['-1000', '999.5'],
      refused: ['-10000'],
    },
  ],
  [
    'numeric at most 10',
    {
      format: 'decimal',
      limits: { maximum: '10' },
      accepted: ['-99999999999', '99999999999'],
      refused: ['1.2.3'],
    },
  ],
  [
    'int8',
    {
      format: 'int64',
      limits: INT8,
      accepted: ['9223372036854775807', '-9223372036854775808', '0'],
      refused: ['-0', '10000000000000000000', '01', '1.0'],
    },
  ],
  [
    'int8 above zero',
    {
      format: 'int64',
      limits: { ...INT8, minimum: null, exclusiveMinimum: '0' },
      accepted: ['1', '9223372036854775807'],
      refused: ['-1'],
    },
  ],
  [
    'an int4 id',
    {
      format: 'int32',
      limits: INT4,
      accepted: ['2147483647', '-2147483648'],
      refused: ['99999999999', '-0'],
    },
  ],
  [
    'an int2 id',
    {
      format: 'int16',
      limits: INT2,
      accepted: ['32767', '-32768', '99999'],
      refused: ['100000'],
    },
  ],
  [
    'a float id',
    {
      format: 'double',
      accepted: ['1.5', '-0.1', '1e+21', '1.5e-7', '0', '123'],
      refused: ['1.50', '01', '1E5', '1e5', 'NaN', 'Infinity', '.5', '1.'],
    },
  ],
  [
    'timestamptz',
    {
      format: 'date-time',
      fractionDigits: 6,
      accepted: [
        '2024-02-29T12:00:00Z',
        '2024-02-29T12:00:00.123456+02:00',
        '2024-02-29T12:00:00.1234560-01:00',
      ],
      refused: ['2024-02-29T12:00:00.1234567Z'],
    },
  ],
  [
    'timestamptz(3)',
    {
      format: 'date-time',
      fractionDigits: 3,
      accepted: ['2024-02-29T12:00:00.123Z', '2024-02-29T12:00:00.1230z'],
      refused: ['2024-02-29T12:00:00.1234Z'],
    },
  ],
  [
    'timestamp(0)',
    {
      format: 'date-time-local',
      fractionDigits: 0,
      accepted: [...DATE_TIMES, '2024-02-29T12:00:00.000'],
      refused: ['2024-02-29T12:00:00.5', '2024-02-29T12:00:00.05+01:00'],
    },
  ],
];

describe('formPattern', () => {
  it.each(CASES)(
    'describes the text of %s',
    (_, { format, fractionDigits, limits, accepted, refused }) => {
      const pattern = formPattern({
        format,
        fractionDigits: fractionDigits ?? null,
        limits: { ...NONE, ...limits },
      });
      expect(pattern).not.toBeNull();
      const regex = new RegExp(pattern ?? '', 'u');
      expect(accepted.filter((text) => !regex.test(text))).toEqual([]);
      expect(refused.filter((text) => regex.test(text))).toEqual([]);
    },
  );

  it.each([['uuid'], ['date'], [null]])('leaves %s to its format', (format) => {
    expect(
      formPattern({ format, fractionDigits: null, limits: NONE }),
    ).toBeNull();
  });
});
