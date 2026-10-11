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
import { WIRE_FORMATS } from '../wire/formats';
import { raise } from './raise';
import { checkRange, NUMBER_COMPARE } from './range-check';
import { levelSchema } from './value-schema';

/** The forms a primary key or a foreign key may take (`isIdentifierColumn`). */
type IdKind = 'text' | 'number' | 'decimal' | 'string' | 'boolean' | 'enum';
type IdForm = Extract<ValueForm, { readonly kind: IdKind }>;
type FormOf<TKind extends IdKind> = Extract<IdForm, { readonly kind: TKind }>;

/** The two texts a `bool` key's id takes (SPEC 3.4). */
export const BOOLEAN_IDS: readonly ['true', 'false'] = Object.freeze([
  'true',
  'false',
] as const);

/** The number types, whose ids travel as text (SPEC 3.4). */
type NumberType = 'int2' | 'int4' | 'float4' | 'float8';

/** Whether an id's text is the canonical spelling of a value of the number type. */
function isNumberId(text: string, type: NumberType): boolean {
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

function numberIdSchema(spec: ValueSpec, type: NumberType): z.ZodType {
  const compare = NUMBER_COMPARE[type];
  return z.string().check((payload) => {
    if (!isNumberId(payload.value, type)) {
      raise(
        payload,
        { kind: 'format', expected: WIRE_FORMATS[type] },
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
  boolean: () => z.enum(BOOLEAN_IDS),
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
export function idSchema(spec: ValueSpec, path: string): z.ZodType<string> {
  if (!isIdForm(spec.form)) {
    throw new TypeError(
      `${path}: a ${spec.form.kind} value cannot carry a resource id`,
    );
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: every id form's schema parses a string to that same string (SPEC 3.4, id-schema.test.ts), which the value schemas it reuses do not state in their types
  return schemaOf(spec, spec.form) as z.ZodType<string>;
}
