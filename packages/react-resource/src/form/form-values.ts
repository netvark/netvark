/**
 * The values a form starts from (resource SPEC 20.3): on create, each
 * scalar member's literal display default (SPEC 8) or blank, and on
 * update, the record's value as the member's input edits it. An array
 * starts as `[]` and a JSON or codec value as `undefined` on create,
 * whatever their defaults, which apply when the member is left alone.
 * @packageDocumentation
 */
import type { FieldMeta } from '@netvark/resource-core';

import type { FieldDescriptor } from '../fields/fields-of';
import type { FormOperation, FormRecord } from './form-types';
import type { ValueKind } from './value-kind';

import { isRecord, ownValue } from '../internal/object';
import { blankOf, valueKind } from './value-kind';

const CALLER = 'resourceForm';

/** A member the form holds: its descriptor, the kind of its value, and the value the form started from. */
export interface HeldMember {
  readonly descriptor: FieldDescriptor;
  readonly meta: FieldMeta;
  readonly kind: ValueKind;
  /** What the write compares the member's value to. */
  readonly start: unknown;
}

/**
 * A member's display default as its input edits it: a boolean's literal
 * is `true` or `false`, the only spellings PostgreSQL's deparser gives a
 * boolean constant.
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/ruleutils.c (`get_const_expr`, `BOOLOID`)
 */
function createStart(meta: FieldMeta, kind: ValueKind): unknown {
  const literal = meta.default?.literal ?? null;
  if (literal === null || kind === 'array' || kind === 'any') {
    return blankOf(kind);
  }
  return kind === 'boolean' ? literal === 'true' : literal;
}

/** The scalar JSON values a record holds, as their texts: a string as it is, a number or a boolean by `String`. */
function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;
}

/** A scalar's text, `null` as blank. */
function textOf(value: unknown): string | undefined {
  return value === null ? '' : scalarText(value);
}

/** An array's elements as texts, `null` as `[]`. */
function elementsOf(value: unknown): ReadonlyArray<string> | undefined {
  if (value === null) {
    return Object.freeze([]);
  }
  const texts = Array.isArray(value)
    ? value.map((element: unknown) => scalarText(element))
    : [undefined];
  return texts.every((text) => text !== undefined)
    ? Object.freeze(texts)
    : undefined;
}

/** How the record's value of each kind becomes the value its input edits; `undefined` when it is no value of the kind. */
const READERS: Readonly<Record<ValueKind, (value: unknown) => unknown>> = {
  text: textOf,
  number: textOf,
  boolean: (value) =>
    value === null || typeof value === 'boolean' ? value : undefined,
  array: elementsOf,
  any: (value) => value,
};

/** A relationship's id: its linkage's or its included record's, blank when it is `null`. */
function idOf(name: string, value: unknown): string {
  if (value === null) {
    return '';
  }
  const id = isRecord(value) ? ownValue(value, 'id') : undefined;
  if (typeof id !== 'string') {
    throw new TypeError(
      `${CALLER}: the record's ${name} is neither linkage nor a record`,
    );
  }
  return id;
}

function updateStart(
  meta: FieldMeta,
  kind: ValueKind,
  record: FormRecord,
): unknown {
  if (meta.access === 'write') {
    return blankOf(kind);
  }
  const value = ownValue(record, meta.name);
  if (value === undefined) {
    throw new TypeError(
      `${CALLER}: the record has no ${meta.name}, which the form holds`,
    );
  }
  if (meta.kind === 'relationship') {
    return idOf(meta.name, value);
  }
  const start = READERS[kind](value);
  if (start === undefined) {
    throw new TypeError(
      `${CALLER}: the record's ${meta.name} is not the value its type reads`,
    );
  }
  return start;
}

/** The member `descriptor` describes, started for `operation`, from `record` on update. */
export function heldMember(
  descriptor: FieldDescriptor,
  operation: FormOperation,
  record: FormRecord | undefined,
): HeldMember {
  const { meta } = descriptor;
  const kind = valueKind(meta);
  const start =
    record === undefined
      ? createStart(meta, kind)
      : updateStart(meta, kind, record);
  return {
    descriptor: Object.freeze({
      ...descriptor,
      required: operation === 'create' && meta.required,
    }),
    meta,
    kind,
    start,
  };
}

/** The value `values` hold for `member`; a member they leave out stays where it started. */
export function valueIn(values: unknown, member: HeldMember): unknown {
  const name = member.descriptor.name;
  return isRecord(values) && Object.hasOwn(values, name)
    ? values[name]
    : member.start;
}
