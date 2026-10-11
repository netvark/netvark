/**
 * The schema of a resource id (SPEC 3.4): JSON:API ids are strings, so an
 * id travels as its column's wire form when that form is a string, and as
 * one canonical text otherwise: an `int2` or `int4` as integer text (the
 * spelling of `int8`, within the type's range), a float as JavaScript's
 * shortest round-trip text (`String(value)`, what a server that reads the
 * column as a number writes), and a `bool` as `true` or `false`. The
 * column's rules apply to the value the text names. Where the wire form
 * takes several spellings of one value (ADR 0005), the schema outputs the
 * one the server sends, PostgreSQL's read back (`readFormOf`), so a parsed
 * id is the stored one and two parsed ids compare as text.
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-identification
 * @packageDocumentation
 */
import type { ValueForm, ValueSpec } from './value-form';

import { z } from 'zod/v4';

import {
  compareDecimals,
  exponentOfPowerOfTen,
  INTEGER_TEXT,
  scaledText,
} from '../wire/decimal';
import { isStorableReal, realText } from '../wire/floats';
import { WIRE_FORMATS } from '../wire/formats';
import { timestampReadForm, timestamptzReadForm } from '../wire/temporal';
import { paddedText } from '../wire/text';
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

/** A text in the form, spelled as the server sends the value it names. */
type ReadForm = (text: string) => string;

/** A UUID's digits as PostgreSQL prints them; RFC 9562 takes either case. */
const lowerCase: ReadForm = (text) => text.toLowerCase();

/** The read form of a `string` form's text: a date has one spelling. */
function stringReadForm(form: FormOf<'string'>): ReadForm | undefined {
  if (form.type === 'uuid') {
    return lowerCase;
  }
  if (form.type === 'timestamp') {
    return timestampReadForm;
  }
  return form.type === 'timestamptz' ? timestamptzReadForm : undefined;
}

/**
 * How the server spells the value an id in the form names (SPEC 3.4, 5.1),
 * or `undefined` where the form has one spelling: a `bpchar(n)` padded to
 * n, a `numeric(p, s)` with s fraction digits (its `multipleOf`, `10^-s`,
 * which only the type sets), a UUID in lower case, a date-time as
 * PostgreSQL prints it, and a `real` as its single-precision text. A
 * `citext`, a `numeric` without a scale, and a `bpchar` without a length
 * compare more coarsely than any spelling, and keep the one sent.
 */
function readFormOf(spec: ValueSpec, form: IdForm): ReadForm | undefined {
  const { multipleOf } = spec.limits;
  if (form.kind === 'text' && form.type === 'bpchar' && form.length !== null) {
    const { length } = form;
    return (text) => paddedText(text, length);
  }
  if (
    form.kind === 'decimal' &&
    form.type === 'numeric' &&
    multipleOf !== null
  ) {
    const scale = -exponentOfPowerOfTen(multipleOf);
    return (text) => scaledText(text, scale);
  }
  if (form.kind === 'number' && form.type === 'float4') {
    return (text) => realText(Number(text));
  }
  return form.kind === 'string' ? stringReadForm(form) : undefined;
}

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
 * The id schema of a key column whose value has `spec`: it takes an id in
 * the form and outputs the spelling the server sends. The declaration
 * checks refuse a key column without one (`isIdentifierColumn`), so `path`
 * names the column only in an error that cannot happen through
 * `declareResource`.
 */
export function idSchema(spec: ValueSpec, path: string): z.ZodType<string> {
  const { form } = spec;
  if (!isIdForm(form)) {
    throw new TypeError(
      `${path}: a ${form.kind} value cannot carry a resource id`,
    );
  }
  const schema = schemaOf(spec, form);
  const read = readFormOf(spec, form);
  // `overwrite` runs after the checks and keeps the output type; a check that failed already decided the result.
  const spelled =
    read === undefined
      ? schema
      : schema.overwrite((value) =>
          typeof value === 'string' ? read(value) : value,
        );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: every id form's schema parses a string to a string, the id as the server sends it (SPEC 3.4, id-schema.test.ts), which the value schemas it reuses do not state in their types
  return spelled as z.ZodType<string>;
}
