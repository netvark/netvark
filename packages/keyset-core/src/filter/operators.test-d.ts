import type { FieldType, Operator } from '../definition/types';
import type { OperatorsOf } from './operators';

import { describe, expectTypeOf, it } from 'vitest';

import { operatorsFor } from './operators';

describe('OperatorsOf (SPEC 4.2)', () => {
  it('lists the operators of each row of the table, without isNull', () => {
    expectTypeOf<OperatorsOf<'boolean'>>().toEqualTypeOf<'eq' | 'ne'>();
    expectTypeOf<OperatorsOf<'uuid' | 'enum'>>().toEqualTypeOf<
      'eq' | 'ne' | 'in' | 'nin'
    >();
    expectTypeOf<OperatorsOf<'integer'>>().toEqualTypeOf<
      'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte' | 'between'
    >();
    expectTypeOf<OperatorsOf<'timestamptz'>>().toEqualTypeOf<
      OperatorsOf<'decimal'>
    >();
    expectTypeOf<OperatorsOf<'text'>>().toEqualTypeOf<
      | OperatorsOf<'integer'>
      | 'contains'
      | 'startsWith'
      | 'endsWith'
      | 'eqi'
      | 'containsi'
      | 'startsWithi'
      | 'endsWithi'
    >();
    expectTypeOf<OperatorsOf<'array'>>().toEqualTypeOf<
      'contains' | 'containedBy' | 'overlaps'
    >();
  });

  it('covers every operator but isNull, which only nullability adds', () => {
    expectTypeOf<OperatorsOf<FieldType>>().toEqualTypeOf<
      Exclude<Operator, 'isNull'>
    >();
    expectTypeOf(operatorsFor).returns.toEqualTypeOf<ReadonlySet<Operator>>();
  });
});
