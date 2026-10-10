/**
 * A value's metadata (SPEC 8): its wire type, format, fraction digits,
 * bounds, and options, read from the value spec its schema is built from
 * (SPEC 6.1), so the metadata states what the schema enforces. An id is a
 * string that names a value of its key (SPEC 3.4): a `bool` key's id is
 * `true` or `false`, and any other key's takes the key's bounds and
 * options, as `id-schema.ts` applies them.
 * @packageDocumentation
 */
import type { Bound, Limits } from '../schema/limits';
import type { ValueForm, ValueSpec } from '../schema/value-form';
import type { FieldLimits, ItemMeta, WireType } from './types';

import { BOOLEAN_IDS } from '../schema/id-schema';
import { WIRE_FORMATS } from '../wire/formats';

/** The wire type, format, fraction digits, bounds, options, and elements of a value. */
export interface ValueMeta {
  readonly wire: WireType;
  readonly format: string | null;
  readonly fractionDigits: number | null;
  readonly limits: FieldLimits;
  readonly options: ReadonlyArray<string> | null;
  readonly items: ItemMeta | null;
}

/** The wire type of each form but `number`, whose type tells `integer` from `number` (SPEC 5.1). */
const WIRE: {
  readonly [K in Exclude<ValueForm['kind'], 'number'>]: WireType;
} = {
  text: 'string',
  decimal: 'string',
  string: 'string',
  enum: 'string',
  boolean: 'boolean',
  json: 'any',
  array: 'array',
  codec: 'any',
};

function wireOf(form: ValueForm): WireType {
  if (form.kind === 'number') {
    return form.type === 'int2' || form.type === 'int4' ? 'integer' : 'number';
  }
  return WIRE[form.kind];
}

function formatOf(form: ValueForm): string | null {
  return form.kind === 'number' ||
    form.kind === 'decimal' ||
    form.kind === 'string'
    ? WIRE_FORMATS[form.type]
    : null;
}

function fractionDigitsOf(form: ValueForm): number | null {
  return form.kind === 'string' && 'fractionDigits' in form
    ? form.fractionDigits
    : null;
}

/** A bound's value when its inclusiveness is `inclusive`. */
function boundValue(bound: Bound | null, inclusive: boolean): string | null {
  return bound?.inclusive === inclusive ? bound.value : null;
}

/** The folded limits under JSON Schema's keyword names. */
function fieldLimits(limits: Limits): FieldLimits {
  const { lower, upper } = limits;
  return Object.freeze({
    minLength: limits.minLength,
    maxLength: limits.maxLength,
    minimum: boundValue(lower, true),
    exclusiveMinimum: boundValue(lower, false),
    maximum: boundValue(upper, true),
    exclusiveMaximum: boundValue(upper, false),
    multipleOf: limits.multipleOf,
    patterns: Object.freeze([...limits.patterns]),
  });
}

/** A copy, since an enum's labels are the catalog's own array. */
function optionsOf(
  options: ReadonlyArray<string> | null,
): ReadonlyArray<string> | null {
  return options === null ? null : Object.freeze([...options]);
}

/**
 * An element's wire type. `levelOf` builds an array only over a scalar with
 * a wire form, and a JSON column's array needs a codec (SPEC 5.1), so the
 * throw narrows the type and never runs through `declareResource`.
 */
function elementWire(form: ValueForm): ItemMeta['wire'] {
  const wire = wireOf(form);
  if (wire === 'array' || wire === 'any') {
    throw new TypeError(`an array element cannot be a ${form.kind} value`);
  }
  return wire;
}

function itemMeta(element: ValueSpec): ItemMeta {
  const { form } = element;
  return Object.freeze({
    wire: elementWire(form),
    format: formatOf(form),
    fractionDigits: fractionDigitsOf(form),
    limits: fieldLimits(element.limits),
    options: optionsOf(element.options),
  });
}

/** The metadata of a value whose spec is `spec`. */
export function valueMeta(spec: ValueSpec): ValueMeta {
  const { form } = spec;
  return {
    wire: wireOf(form),
    format: formatOf(form),
    fractionDigits: fractionDigitsOf(form),
    limits: fieldLimits(spec.limits),
    options: optionsOf(spec.options),
    items: form.kind === 'array' ? itemMeta(form.element) : null,
  };
}

/** The metadata of an id that names a value whose spec is `spec`. */
export function idMeta(spec: ValueSpec): ValueMeta {
  const meta = valueMeta(spec);
  return {
    ...meta,
    wire: 'string',
    options: spec.form.kind === 'boolean' ? BOOLEAN_IDS : meta.options,
  };
}
