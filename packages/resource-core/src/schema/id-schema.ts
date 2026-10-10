/**
 * The schema of a resource id (SPEC 3.4): JSON:API ids are strings, so an
 * id travels as its column's wire form when that form is a string, and as
 * one canonical text otherwise: an `int2` or `int4` as integer text (the
 * spelling of `int8`, within the type's range), a float as JavaScript's
 * shortest round-trip text (`String(value)`, what a server that reads the
 * column as a number writes), and a `bool` as `true` or `false`. The
 * column's rules apply to the value the text names.
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-identification
 * @packageDocumentation
 */
import type { ValueForm, ValueSpec } from './value-form';

import { z } from 'zod/v4';

import { compareDecimals, INTEGER_TEXT } from '../wire/decimal';
import { isStorableReal } from '../wire/floats';
import { raise } from './raise';
import { checkRange, NUMBER_COMPARE } from './range-check';
import { levelSchema } from './value-schema';

/** The forms a primary key or a foreign key may take (`isIdentifierColumn`). */
type IdKind = 'text' | 'number' | 'decimal' | 'string' | 'boolean' | 'enum';
type IdForm = Extract<ValueForm, { readonly kind: IdKind }>;
type FormOf<TKind extends IdKind> = Extract<IdForm, { readonly kind: TKind }>;

/** The format an id reports for each number type: OpenAPI's names for the value it carries. */
const NUMBER_FORMATS = {
  int2: 'int16',
  int4: 'int32',
  float4: 'float',
  float8: 'double',
} as const;

/** Whether an id's text is the canonical spelling of a value of the number type. */
function isNumberId(text: string, type: keyof typeof NUMBER_FORMATS): boolean {
  if (type === 'int2' || type === 'int4') {
    return INTEGER_TEXT.test(text);
  }
  const value = Number(text);
  return (
    Number.isFinite(value) &&
    String(value) === text &&
    (type === 'float8' || isStorableReal(value))
  );
}

function numberIdSchema(
  spec: ValueSpec,
  type: keyof typeof NUMBER_FORMATS,
): z.ZodType {
  const compare = NUMBER_COMPARE[type];
  return z.string().check((payload) => {
    if (!isNumberId(payload.value, type)) {
      raise(
        payload,
        { kind: 'format', expected: NUMBER_FORMATS[type] },
        { abort: true },
      );
      return;
    }
    checkRange(
      payload,
      spec.limits,
      type === 'int2' || type === 'int4'
        ? compareDecimals
        : (text, bound) => compare(Number(text), bound),
    );
  });
}

const ID_SCHEMAS: {
  readonly [K in IdKind]: (spec: ValueSpec, form: FormOf<K>) => z.ZodType;
} = {
  text: (spec) => levelSchema(spec, { nullable: false, validators: false }),
  decimal: (spec) => levelSchema(spec, { nullable: false, validators: false }),
  string: (spec) => levelSchema(spec, { nullable: false, validators: false }),
  enum: (spec) => levelSchema(spec, { nullable: false, validators: false }),
  number: (spec, form) => numberIdSchema(spec, form.type),
  boolean: () => z.enum(['true', 'false']),
};

function isIdForm(form: ValueForm): form is IdForm {
  return Object.hasOwn(ID_SCHEMAS, form.kind);
}

function schemaOf<TKind extends IdKind>(
  spec: ValueSpec,
  form: FormOf<TKind>,
): z.ZodType {
  const build: (spec: ValueSpec, form: FormOf<TKind>) => z.ZodType =
    ID_SCHEMAS[form.kind];
  return build(spec, form);
}

/**
 * The id schema of a key column whose value has `spec`. The declaration
 * checks refuse a key column without one (`isIdentifierColumn`), so `path`
 * names the column only in an error that cannot happen through
 * `declareResource`.
 */
export function idSchema(spec: ValueSpec, path: string): z.ZodType {
  if (!isIdForm(spec.form)) {
    throw new TypeError(
      `${path}: a ${spec.form.kind} value cannot carry a resource id`,
    );
  }
  return schemaOf(spec, spec.form);
}
