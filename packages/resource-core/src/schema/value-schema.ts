/**
 * A value spec as a Zod schema (SPEC 6.1): the wire form, the folded
 * limits, the options and patterns, then, where the caller asks for them,
 * `.nullable()` and the validators. Built with classic Zod, so the
 * composed schemas have `.parse`, `.safeParse`, and `.pick`; a codec's or
 * validator's schema may come from either flavor, since both share Zod
 * Core. A check that finds a value outside its wire form aborts, so no
 * later check compares a malformed value; rule checks continue, so every
 * failed rule is reported.
 * @ref https://zod.dev/packages/core
 * @packageDocumentation
 */
import type { $ZodType } from 'zod/v4/core';

import type { ValidatorUse, ValueForm, ValueSpec } from './value-form';

import { z } from 'zod/v4';
import { safeParse } from 'zod/v4/core';

import { isStorableReal } from '../wire/floats';
import { jsonViolation } from '../wire/json';
import { isStorableText, TEXT_FORMAT } from '../wire/text';
import { decimalSchema } from './decimal-schema';
import { raise, raiseCode } from './raise';
import { checkRange, NUMBER_COMPARE } from './range-check';
import { stringFormSchema } from './string-forms';

/** What a level of a value runs besides its form and limits. */
export interface LevelOptions {
  readonly nullable: boolean;
  readonly validators: boolean;
}

function textSchema(spec: ValueSpec): z.ZodType {
  const { minLength, maxLength, patterns } = spec.limits;
  let schema = z.string().check((payload) => {
    if (!isStorableText(payload.value)) {
      raise(payload, TEXT_FORMAT, { abort: true });
    }
  });
  if (minLength !== null) {
    schema = schema.min(minLength);
  }
  if (maxLength !== null) {
    schema = schema.max(maxLength);
  }
  const { options } = spec;
  if (options !== null) {
    schema = schema.check((payload) => {
      if (!options.includes(payload.value)) {
        raise(
          payload,
          { kind: 'enum', expected: JSON.stringify(options) },
          { abort: false },
        );
      }
    });
  }
  for (const source of patterns) {
    // The flags of catalog SPEC 8.4; without `g` or `y`, `test` keeps no state.
    const pattern = new RegExp(source, 'su');
    schema = schema.check((payload) => {
      if (!pattern.test(payload.value)) {
        raise(payload, { kind: 'pattern', expected: source }, { abort: false });
      }
    });
  }
  return schema;
}

function numberSchema(
  spec: ValueSpec,
  type: keyof typeof NUMBER_COMPARE,
): z.ZodType {
  const compare = NUMBER_COMPARE[type];
  return z.number().check((payload) => {
    if (
      (type === 'int2' || type === 'int4') &&
      !Number.isInteger(payload.value)
    ) {
      raise(payload, { kind: 'type', expected: 'integer' }, { abort: true });
      return;
    }
    if (type === 'float4' && !isStorableReal(payload.value)) {
      raise(payload, { kind: 'format', expected: 'float' }, { abort: true });
      return;
    }
    checkRange(payload, spec.limits, compare);
  });
}

function jsonSchema(jsonb: boolean): z.ZodType {
  return z.unknown().check((payload) => {
    if (payload.value === undefined || payload.value === null) {
      raise(payload, { kind: 'required' }, { abort: true });
      return;
    }
    const found = jsonViolation(payload.value, jsonb);
    if (found !== undefined) {
      raise(payload, found.violation, { abort: true, path: found.path });
    }
  });
}

function enumSchema(options: ReadonlyArray<string>): z.ZodType {
  const [first, ...rest] = options;
  if (first !== undefined) {
    return z.enum([first, ...rest]);
  }
  return z.string().check((payload) => {
    raise(payload, { kind: 'enum', expected: '[]' }, { abort: true });
  });
}

/** A schema with classic Zod's methods: a codec's schema may come from Zod Mini or Zod Core. */
function classic(schema: $ZodType): z.ZodType {
  return schema instanceof z.ZodType ? schema : z.lazy(() => schema);
}

type FormOf<TKind extends ValueForm['kind']> = Extract<
  ValueForm,
  { readonly kind: TKind }
>;

/** Each form's schema, by kind. */
const FORM_SCHEMAS: {
  readonly [K in ValueForm['kind']]: (
    spec: ValueSpec,
    form: FormOf<K>,
    validators: boolean,
  ) => z.ZodType;
} = {
  text: (spec) => textSchema(spec),
  number: (spec, form) => numberSchema(spec, form.type),
  decimal: (spec, form) => decimalSchema(spec, form.type),
  string: (_spec, form) => stringFormSchema(form),
  boolean: () => z.boolean(),
  json: (_spec, form) => jsonSchema(form.type === 'jsonb'),
  enum: (spec) => enumSchema(spec.options ?? []),
  array: (_spec, form, validators) =>
    z.array(levelSchema(form.element, { nullable: false, validators })),
  codec: (_spec, form) => classic(form.codec.schema),
};

function formSchema<TKind extends ValueForm['kind']>(
  spec: ValueSpec,
  form: FormOf<TKind>,
  validators: boolean,
): z.ZodType {
  const build: (
    spec: ValueSpec,
    form: FormOf<TKind>,
    validators: boolean,
  ) => z.ZodType = FORM_SCHEMAS[form.kind];
  return build(spec, form, validators);
}

/**
 * Runs each validator on what the steps before it accepted, `null`
 * included (SPEC 6.1 step 5), reading the validator's input from the
 * parsed value with `read`: the value itself, or a linkage's id (SPEC 7.2).
 */
export function withValidators(
  schema: z.ZodType,
  uses: ReadonlyArray<ValidatorUse>,
  read: (value: unknown) => unknown = (value) => value,
): z.ZodType {
  if (uses.length === 0) {
    return schema;
  }
  return schema.check((payload) => {
    if (payload.issues.length > 0) {
      return;
    }
    const input = read(payload.value);
    for (const use of uses) {
      if (!safeParse(use.validator.schema, input).success) {
        raiseCode(payload, use.code);
      }
    }
  });
}

/** The schema of one level of a value: the whole value, or an array's elements. */
export function levelSchema(spec: ValueSpec, options: LevelOptions): z.ZodType {
  const base = formSchema(spec, spec.form, options.validators);
  const nullable = options.nullable ? base.nullable() : base;
  return options.validators
    ? withValidators(nullable, spec.validators)
    : nullable;
}
