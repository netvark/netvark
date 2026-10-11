/**
 * A member's keyset type (SPEC 11.2): what `@netvark/keyset-core` filters
 * and sorts it as. It is read from the member's value spec, where domains
 * are already followed to their base type and `enum` rules already read,
 * so a text column with an `enum` rule filters as an enum. `json`, `jsonb`,
 * and codec values have none, since keyset-core has no type for them; nor
 * do arrays of enums, since its arrays hold no enum, nor an enum without
 * values (no labels, or rules whose values do not meet), since its enums
 * need values.
 * @ref https://github.com/netvark/netvark/blob/main/docs/keyset/SPEC.md (sections 3.1 and 4.2)
 * @packageDocumentation
 */
import type {
  ArrayElementType,
  Collation,
  FieldType,
  ScalarFieldType,
} from '@netvark/keyset-core';

import type { ValueSpec } from '../schema/value-form';

/** A member as keyset-core types a field: its type, an enum's values, an array's element, and its collation. */
export interface KeysetType {
  readonly type: FieldType;
  /** The labels or the rule's values of an `enum`; `null` for any other type. */
  readonly values: ReadonlyArray<string> | null;
  /** The element type of an `array`; `null` for any other type. */
  readonly of: ArrayElementType | null;
  /** `insensitive` for `citext`, which compares case-insensitively in the database. */
  readonly collation: Collation;
}

interface ScalarKeyset extends KeysetType {
  readonly type: ScalarFieldType;
}

/** The keyset type of each base type of SPEC 5.1 other than text, `bool`, and JSON. */
const SCALARS: ReadonlyMap<string, ArrayElementType> = new Map<
  string,
  ArrayElementType
>([
  ['int2', 'integer'],
  ['int4', 'integer'],
  ['int8', 'bigint'],
  ['numeric', 'decimal'],
  ['float4', 'float'],
  ['float8', 'float'],
  ['uuid', 'uuid'],
  ['date', 'date'],
  ['timestamp', 'timestamp'],
  ['timestamptz', 'timestamptz'],
]);

function scalar(type: ScalarFieldType): ScalarKeyset {
  return { type, values: null, of: null, collation: 'default' };
}

function scalarOf(spec: ValueSpec): ScalarKeyset | undefined {
  const { form, options } = spec;
  if (options !== null && (form.kind === 'enum' || form.kind === 'text')) {
    return options.length === 0
      ? undefined
      : { type: 'enum', values: options, of: null, collation: 'default' };
  }
  if (form.kind === 'text') {
    return {
      ...scalar('text'),
      collation: form.type === 'citext' ? 'insensitive' : 'default',
    };
  }
  if (form.kind === 'boolean') {
    return scalar('boolean');
  }
  const type = 'type' in form ? SCALARS.get(form.type) : undefined;
  return type === undefined ? undefined : scalar(type);
}

/** The keyset type of a member's value, or `undefined` when it can be neither filtered nor sorted. */
export function keysetTypeOf(spec: ValueSpec): KeysetType | undefined {
  if (spec.form.kind !== 'array') {
    return scalarOf(spec);
  }
  const element = scalarOf(spec.form.element);
  if (element === undefined || element.type === 'enum') {
    return undefined;
  }
  return {
    type: 'array',
    values: null,
    of: element.type,
    collation: 'default',
  };
}
