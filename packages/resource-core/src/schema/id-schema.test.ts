import type { TypeRecord } from './value-form';

import { describe, expect, it } from 'vitest';

import { issuesOf } from '../test-support/forms';
import { idSchema } from './id-schema';
import { baseSpec, specOf } from './value-form';
import { withRule } from './value-spec';

type Record = Partial<TypeRecord> & Pick<TypeRecord, 'type'>;
type Refusal = readonly [value: unknown, code: string, expected?: string];

function spec(record: Record) {
  const found = baseSpec({
    typeKind: 'base',
    array: false,
    maxLength: null,
    precision: null,
    scale: null,
    ...record,
  });
  if (found === undefined) {
    throw new Error(`no wire form for ${record.type}`);
  }
  return found;
}

/** An id the schema takes, alone when it outputs the text itself, else with the spelling the server sends. */
type Accepted = string | readonly [value: string, sent: string];

function idRow(
  label: string,
  schema: ReturnType<typeof idSchema>,
  accepts: ReadonlyArray<Accepted>,
  refuses: ReadonlyArray<Refusal>,
): void {
  describe(label, () => {
    it.each(
      accepts.map((accepted) =>
        typeof accepted === 'string' ? [accepted, accepted] : accepted,
      ),
    )('accepts %j as %j', (value, sent) => {
      expect(issuesOf(schema, value)).toEqual([]);
      expect(schema.parse(value)).toBe(sent);
      // The output is in the form and outputs itself: parsing an id the server sent changes nothing.
      expect(schema.parse(sent)).toBe(sent);
    });
    it.each(refuses)('refuses %j as %s %s', (value, code, expected) => {
      expect(issuesOf(schema, value)).toEqual([
        expected === undefined
          ? { code, path: [] }
          : { code, expected, path: [] },
      ]);
    });
  });
}

describe('resource ids in the wire form of their column (SPEC 3.4)', () => {
  idRow(
    'int4: integer text within the type',
    idSchema(spec({ type: 'int4' }), 'refs.id'),
    ['0', '7', '-2147483648', '2147483647'],
    [
      ['05', 'format', 'int32'],
      ['-0', 'format', 'int32'],
      ['+5', 'format', 'int32'],
      ['5.0', 'format', 'int32'],
      ['2147483648', 'maximum', '2147483647'],
      [5, 'type', 'string'],
    ],
  );
  idRow(
    'int2',
    idSchema(spec({ type: 'int2' }), 'refs.id'),
    ['32767'],
    [
      ['32768', 'maximum', '32767'],
      ['x', 'format', 'int16'],
    ],
  );
  idRow(
    'int4 with a range rule',
    idSchema(
      withRule(
        spec({ type: 'int4' }),
        { kind: 'range', min: { value: '0', inclusive: false }, max: null },
        'refs.id',
      ),
      'refs.id',
    ),
    ['1'],
    [['0', 'exclusiveMinimum', '0']],
  );
  idRow(
    "float8: JavaScript's shortest round-trip text",
    idSchema(spec({ type: 'float8' }), 'refs.id'),
    ['1.5', '-0.25', '1e+21', '5e-324'],
    [
      ['1.50', 'format', 'double'],
      ['1e21', 'format', 'double'],
      ['-0', 'format', 'double'],
      ['NaN', 'format', 'double'],
      ['Infinity', 'format', 'double'],
    ],
  );
  idRow(
    'float4: storable in single precision, output as PostgreSQL prints the float32',
    idSchema(spec({ type: 'float4' }), 'refs.id'),
    [
      '0.1',
      '0.3',
      ['3.4e+38', '3.4e+38'],
      ['0.30000000000000004', '0.3'],
      ['16777217', '16777216'],
      ['3.4028234663852886e+38', '3.4028235e+38'],
      ['1.401298464324817e-45', '1e-45'],
    ],
    [
      ['3.5e+38', 'format', 'float'],
      ['1e-50', 'format', 'float'],
      ['0.30', 'format', 'float'],
    ],
  );
  idRow(
    'float8 with a range rule: the number the text names meets the bound',
    idSchema(
      withRule(
        spec({ type: 'float8' }),
        { kind: 'range', min: { value: '0', inclusive: false }, max: null },
        'refs.id',
      ),
      'refs.id',
    ),
    ['5e-324', '1.5'],
    [
      ['0', 'exclusiveMinimum', '0'],
      ['-1.5', 'exclusiveMinimum', '0'],
    ],
  );
  idRow(
    'bool',
    idSchema(spec({ type: 'bool' }), 'refs.id'),
    ['true', 'false'],
    [['yes', 'enum', '["true","false"]']],
  );
  idRow(
    'int8 and numeric keep their own forms',
    idSchema(spec({ type: 'int8' }), 'refs.id'),
    ['9223372036854775807'],
    [['9223372036854775808', 'maximum', '9223372036854775807']],
  );
  idRow(
    'numeric(5, 2): output with two fraction digits, as PostgreSQL prints it',
    idSchema(spec({ type: 'numeric', precision: 5, scale: 2 }), 'refs.id'),
    [
      '1.25',
      ['1.5', '1.50'],
      ['1', '1.00'],
      ['1.500', '1.50'],
      ['-0.5', '-0.50'],
    ],
    [
      ['1.005', 'multipleOf', '0.01'],
      ['01.5', 'format', 'decimal'],
    ],
  );
  idRow(
    'numeric(5, 0) and numeric(3, -2): output without a fraction',
    idSchema(spec({ type: 'numeric', precision: 5, scale: 0 }), 'refs.id'),
    ['12', ['12.0', '12']],
    [['12.5', 'multipleOf', '1']],
  );
  idRow(
    'numeric(3, -2)',
    idSchema(spec({ type: 'numeric', precision: 3, scale: -2 }), 'refs.id'),
    ['1200', ['1200.00', '1200']],
    [['1250', 'multipleOf', '100']],
  );
  idRow(
    'numeric without a scale keeps the digits sent, as PostgreSQL does',
    idSchema(spec({ type: 'numeric' }), 'refs.id'),
    ['1', '1.0', '1.00'],
    [['+1', 'format', 'decimal']],
  );
  idRow(
    'varchar(3)',
    idSchema(spec({ type: 'varchar', maxLength: 3 }), 'refs.id'),
    ['abc'],
    [['abcd', 'maxLength', '3']],
  );
  idRow(
    'bpchar(4): output padded to four code points',
    idSchema(spec({ type: 'bpchar', maxLength: 4 }), 'refs.id'),
    ['abcd', ['ab', 'ab  '], ['a ', 'a   '], ['\u{1F44D}', '\u{1F44D}   ']],
    [['abcde', 'maxLength', '4']],
  );
  idRow(
    'bpchar without a length and citext keep the text sent',
    idSchema(spec({ type: 'bpchar' }), 'refs.id'),
    ['a ', 'a'],
    [],
  );
  idRow(
    'citext',
    idSchema(spec({ type: 'citext' }), 'refs.id'),
    ['ABC', 'abc'],
    [],
  );
  idRow(
    'uuid: either case, as RFC 9562 allows, output in lower case',
    idSchema(spec({ type: 'uuid' }), 'refs.id'),
    [
      '7c1b0c6e-2a4b-4d0b-9f3a-1e2d3c4b5a69',
      [
        '7C1B0C6E-2A4B-4D0B-9F3A-1E2D3C4B5A69',
        '7c1b0c6e-2a4b-4d0b-9f3a-1e2d3c4b5a69',
      ],
      [
        '7c1B0c6E-2a4b-4D0b-9f3A-1e2d3c4b5a69',
        '7c1b0c6e-2a4b-4d0b-9f3a-1e2d3c4b5a69',
      ],
    ],
    [
      ['7c1b0c6e', 'format', 'uuid'],
      ['7c1b0c6e2a4b4d0b9f3a1e2d3c4b5a69', 'format', 'uuid'],
      ['{7c1b0c6e-2a4b-4d0b-9f3a-1e2d3c4b5a69}', 'format', 'uuid'],
    ],
  );
  idRow(
    'timestamp(3): output as PostgreSQL prints it',
    idSchema(spec({ type: 'timestamp', precision: 3 }), 'refs.id'),
    [
      '2024-01-31T10:20:30.5',
      ['2024-01-31T10:20:30.500', '2024-01-31T10:20:30.5'],
      ['2024-01-31t10:20:30.000000', '2024-01-31T10:20:30'],
    ],
    [
      ['2024-01-31T10:20:30.0005', 'format', 'date-time-local'],
      ['2024-01-31T10:20:30Z', 'format', 'date-time-local'],
    ],
  );
  idRow(
    'timestamptz: output as the instant in UTC with Z',
    idSchema(spec({ type: 'timestamptz' }), 'refs.id'),
    [
      '2024-01-31T10:20:30Z',
      ['2024-01-31T12:20:30+02:00', '2024-01-31T10:20:30Z'],
      ['2024-01-31T00:20:30.50+02:00', '2024-01-30T22:20:30.5Z'],
      ['2024-12-31T23:30:00-01:00', '2025-01-01T00:30:00Z'],
      ['2024-01-31t10:20:30z', '2024-01-31T10:20:30Z'],
    ],
    [
      ['2024-01-31T10:20:30', 'format', 'date-time'],
      ['9999-12-31T23:30:00-01:00', 'format', 'date-time'],
    ],
  );
  idRow(
    'date',
    idSchema(spec({ type: 'date' }), 'refs.id'),
    ['2024-02-29'],
    [['2026-02-29', 'format', 'date']],
  );
  idRow(
    'an enum',
    idSchema(
      { ...specOf({ kind: 'enum', type: 'phone_kind' }), options: ['mobile'] },
      'refs.id',
    ),
    ['mobile'],
    [['pager', 'enum', '["mobile"]']],
  );

  it('refuses a form that cannot carry an id, which the declaration checks never let through', () => {
    expect(() => idSchema(spec({ type: 'jsonb' }), 'refs.payload')).toThrow(
      'refs.payload: a json value cannot carry a resource id',
    );
  });
});
