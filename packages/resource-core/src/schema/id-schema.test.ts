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

function idRow(
  label: string,
  schema: ReturnType<typeof idSchema>,
  accepts: ReadonlyArray<string>,
  refuses: ReadonlyArray<Refusal>,
): void {
  describe(label, () => {
    // The id is the text itself: `schema.id` and `validate.id` output what they take.
    it.each(accepts.map((value) => [value]))(
      'accepts %j as itself',
      (value) => {
        expect(issuesOf(schema, value)).toEqual([]);
        expect(schema.parse(value)).toBe(value);
      },
    );
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
    'float4: storable in single precision',
    idSchema(spec({ type: 'float4' }), 'refs.id'),
    ['0.1', '3.4e+38'],
    [
      ['3.5e+38', 'format', 'float'],
      ['1e-50', 'format', 'float'],
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
    'numeric(5, 2)',
    idSchema(spec({ type: 'numeric', precision: 5, scale: 2 }), 'refs.id'),
    ['1.25'],
    [['1.005', 'multipleOf', '0.01']],
  );
  idRow(
    'varchar(3)',
    idSchema(spec({ type: 'varchar', maxLength: 3 }), 'refs.id'),
    ['abc'],
    [['abcd', 'maxLength', '3']],
  );
  idRow(
    'uuid',
    idSchema(spec({ type: 'uuid' }), 'refs.id'),
    ['7C1B0C6E-2A4B-4D0B-9F3A-1E2D3C4B5A69'],
    [['7c1b0c6e', 'format', 'uuid']],
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
