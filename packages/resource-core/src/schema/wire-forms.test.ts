import { describe } from 'vitest';

import { formRow as row } from '../test-support/form-row';

describe('text types (SPEC 5.1, 5.2)', () => {
  row(
    { type: 'text' },
    ['', 'a', '\u{1F600}', 'tab\there', 'ünïcödé'],
    [
      ['a\u0000b', 'format', 'text'],
      ['a\uD800b', 'format', 'text'],
      ['\uDC00', 'format', 'text'],
      [5, 'type', 'string'],
      [null, 'required'],
      [undefined, 'required'],
    ],
  );
  row(
    { type: 'varchar', maxLength: 1 },
    ['a', '\u{1F600}', ''],
    [
      ['ab', 'maxLength', '1'],
      // varchar(n) truncates excess spaces silently; the wire form refuses them.
      ['a ', 'maxLength', '1'],
    ],
  );
  row(
    { type: 'bpchar', maxLength: 4 },
    ['ab', 'abcd'],
    [['abcde', 'maxLength', '4']],
  );
  row({ type: 'citext' }, ['Ada'], [['\u0000', 'format', 'text']]);
  row({ type: 'extensions.citext' }, ['Ada'], [[1, 'type', 'string']]);
});

describe('integers (SPEC 5.1, 5.3)', () => {
  row(
    { type: 'int2' },
    [-32768, 0, -0, 32767],
    [
      [32768, 'maximum', '32767'],
      [-32769, 'minimum', '-32768'],
      [1.5, 'type', 'integer'],
      ['5', 'type', 'integer'],
      [Number.POSITIVE_INFINITY, 'type', 'integer'],
      [Number.NaN, 'type', 'integer'],
    ],
    true,
  );
  row(
    { type: 'int4' },
    [-2147483648, 2147483647],
    [
      [2147483648, 'maximum', '2147483647'],
      [-2147483649, 'minimum', '-2147483648'],
    ],
    true,
  );
  row(
    { type: 'int8' },
    ['0', '9223372036854775807', '-9223372036854775808'],
    [
      ['9223372036854775808', 'maximum', '9223372036854775807'],
      ['-9223372036854775809', 'minimum', '-9223372036854775808'],
      // PostgreSQL reads each as the same number; the wire form keeps one spelling.
      ['-0', 'format', 'int64'],
      ['+5', 'format', 'int64'],
      ['007', 'format', 'int64'],
      [' 5', 'format', 'int64'],
      ['1e3', 'format', 'int64'],
      ['1.0', 'format', 'int64'],
      [5, 'type', 'string'],
    ],
  );
});

describe('numeric (SPEC 5.1, 5.2, 5.3)', () => {
  row(
    { type: 'numeric' },
    ['0', '-0.5', '1.50', '9'.repeat(131072), `0.${'1'.repeat(16383)}`],
    [
      [`1${'0'.repeat(131072)}`, 'format', 'decimal'],
      // numeric input counts trailing zeros: 16384 written digits overflow.
      [`0.${'1'.repeat(16383)}0`, 'format', 'decimal'],
      // PostgreSQL stores a zero without its sign: `-0.00` prints `0.00`.
      ['-0', 'format', 'decimal'],
      ['-0.00', 'format', 'decimal'],
      ['.5', 'format', 'decimal'],
      ['5.', 'format', 'decimal'],
      ['1e5', 'format', 'decimal'],
      ['NaN', 'format', 'decimal'],
      [1.5, 'type', 'string'],
    ],
  );
  row(
    { type: 'numeric', precision: 5, scale: 2 },
    ['999.99', '-999.99', '1.5', '1.500', '0'],
    [
      // numeric(5,2) rounds 1.005 to 1.01; the wire form refuses the digit it would lose.
      ['1.005', 'multipleOf', '0.01'],
      ['1000', 'exclusiveMaximum', '1000'],
      ['-1000', 'exclusiveMinimum', '-1000'],
      ['999.995', 'multipleOf', '0.01'],
    ],
  );
  // PostgreSQL 15 allows a negative scale and a scale above the precision.
  row(
    { type: 'numeric', precision: 2, scale: -3 },
    ['12000', '99000', '-99000', '0'],
    [
      ['1500', 'multipleOf', '1000'],
      ['99500', 'multipleOf', '1000'],
      ['100000', 'exclusiveMaximum', '100000'],
    ],
  );
  row(
    { type: 'numeric', precision: 3, scale: 5 },
    ['0.00999', '-0.00999', '0'],
    [
      ['0.01', 'exclusiveMaximum', '0.01'],
      ['0.000001', 'multipleOf', '0.00001'],
    ],
  );
});

describe('floats (SPEC 5.1, 5.2)', () => {
  row(
    { type: 'float4' },
    [0, -0, 0.1, 1e-45, 3.4e38, -3.4e38],
    [
      [3.5e38, 'format', 'float'],
      [1e-50, 'format', 'float'],
      [-1e-50, 'format', 'float'],
    ],
  );
  row(
    { type: 'float8' },
    [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, -0],
    [
      [Number.POSITIVE_INFINITY, 'type', 'number'],
      [Number.NaN, 'type', 'number'],
      ['1', 'type', 'number'],
    ],
  );
});
