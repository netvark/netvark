/**
 * Requests for the agreement of a declared resource's two definitions
 * (resource SPEC 11.2): a `filter` query string with sample values of the
 * member's keyset type, and the condition a list route hands
 * `@netvark/keyset-core` for what `@netvark/jsonapi-core`'s `parseQuery`
 * returned. `parseQuery` yields text, or a list for a repeated parameter
 * (jsonapi SPEC 6.8); keyset-core takes `isNull` as a boolean and the
 * list operators and array fields as lists (keyset SPEC 4.2, 4.3).
 */
import type { FilterCondition as ParsedCondition } from '@netvark/jsonapi-core';
import type {
  FieldInit,
  FilterCondition,
  Operator,
} from '@netvark/keyset-core';

import { isOperator } from '@netvark/keyset-core';

/** Two values of each keyset type in their text form, as a query string carries them. */
const SAMPLES: Readonly<Record<string, readonly [string, string]>> = {
  text: ['a%b_c', 'z'],
  integer: ['-7', '42'],
  bigint: ['9007199254740993', '9007199254740995'],
  decimal: ['12.50', '99.99'],
  float: ['1.5e3', '2.5e3'],
  boolean: ['true', 'false'],
  uuid: [
    '018f3a2b-7c4d-7e8f-9a0b-1c2d3e4f5a6b',
    '018F3A2B-7C4D-7E8F-9A0B-1C2D3E4F5A6C',
  ],
  date: ['2024-02-29', '2024-03-01'],
  time: ['12:30:00', '23:59:59.999999'],
  timestamp: ['2024-02-29 12:30:00.123456', '2024-03-01T00:00:00'],
  timestamptz: ['2024-02-29T12:30:00Z', '2024-03-01 00:00:00+02:00'],
};
const TEXT: readonly [string, string] = ['a%b_c', 'z'];
/** Operators whose keyset value is a list. */
const LISTS: ReadonlySet<string> = new Set(['in', 'nin', 'between']);

function samplesOf(field: FieldInit | undefined): readonly [string, string] {
  if (field === undefined) {
    return TEXT;
  }
  if (field.type === 'enum') {
    const [first = '', second = first] = field.values;
    return [first, second];
  }
  return SAMPLES['of' in field ? field.of : field.type] ?? TEXT;
}

function isList(field: FieldInit | undefined, op: string): boolean {
  return LISTS.has(op) || field?.type === 'array';
}

/** A `filter[name][op]` query string and the condition `parseQuery` reads from it. */
export interface FilterRequest {
  readonly query: string;
  readonly condition: ParsedCondition;
}

/** `filter[name][op]` with sample values: `true` for `isNull`, two values for a list. */
export function filterRequest(
  name: string,
  field: FieldInit | undefined,
  op: Operator,
): FilterRequest {
  const [low, high] = samplesOf(field);
  const value =
    op === 'isNull' ? 'true' : isList(field, op) ? [low, high] : low;
  const parameter = `filter[${name}][${op}]`;
  const params = new URLSearchParams();
  for (const item of typeof value === 'string' ? [value] : value) {
    params.append(parameter, item);
  }
  return {
    query: params.toString(),
    condition: { field: name, operator: op, value },
  };
}

/** A parsed condition as keyset-core takes it: lists as arrays, `isNull` as a boolean. */
export function keysetCondition(
  field: FieldInit | undefined,
  condition: ParsedCondition,
): FilterCondition {
  const { field: name, operator, value } = condition;
  if (!isOperator(operator)) {
    throw new TypeError(
      `parseQuery returned an operator keyset-core lacks: ${operator}`,
    );
  }
  if (operator === 'isNull') {
    const flag = value === 'true' ? true : value === 'false' ? false : value;
    return { field: name, op: operator, value: flag };
  }
  if (isList(field, operator)) {
    return {
      field: name,
      op: operator,
      value: typeof value === 'string' ? [value] : value,
    };
  }
  return { field: name, op: operator, value };
}
