/**
 * The inputs of an error object's messages (SPEC 10.3, 10.4). `field` is
 * the label, in the request's resource type, of the member the item's
 * pointer leads to: the segment after `data/attributes` or
 * `data/relationships`, or `id` for `data/id`, with `data` at the root or
 * inside an Atomic Operations operation. A member the type does not have,
 * such as the subject of an `additionalProperties` issue, came from the
 * request, so it has no label and its name is never used. `fields` labels
 * a derived code's members; `limit`, `format`, and `type` are the keyword
 * value an issue carries as `expected`; `values` labels the options an
 * `enum` issue lists.
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-fields
 * @ref https://jsonapi.org/ext/atomic/
 * @packageDocumentation
 */

import type { IssueKind } from '../schema/issue-kinds';
import type { Dictionary } from './dictionary';
import type { DerivedCode } from './message-index';
import type { Messages } from './types';

const MEMBER_PARTS: ReadonlySet<unknown> = new Set([
  'attributes',
  'relationships',
]);
const OPERATIONS = 'atomic:operations';
const OPERATION_INDEX = /^(?:0|[1-9][0-9]*)$/u;
const SEPARATOR = ', ';

type Path = ReadonlyArray<string | number>;

/** Where `data` sits in `path`: at the root, or under one Atomic Operations operation. */
function dataIndex(path: Path): number | undefined {
  if (path[0] === 'data') {
    return 0;
  }
  const [root, operation, data] = path;
  const indexed =
    typeof operation === 'number' ||
    (typeof operation === 'string' && OPERATION_INDEX.test(operation));
  return root === OPERATIONS && indexed && data === 'data' ? 2 : undefined;
}

/** The member a pointer's segments lead to: `id`, or a public field or relationship name. */
export function memberAt(path: Path | undefined): string | undefined {
  const start = path === undefined ? undefined : dataIndex(path);
  if (path === undefined || start === undefined) {
    return undefined;
  }
  const part = path[start + 1];
  const name = path[start + 2];
  if (part === 'id') {
    return 'id';
  }
  return MEMBER_PARTS.has(part) && typeof name === 'string' ? name : undefined;
}

/** The label of `member` in `type`; `id` is the JSON:API member name itself. */
export function labelFor(
  dictionary: Dictionary,
  type: string | undefined,
  member: string | undefined,
): string {
  if (member === 'id') {
    return member;
  }
  const label =
    type === undefined || member === undefined
      ? undefined
      : dictionary.labels.get(type)?.get(member);
  return label === undefined ? '' : label();
}

/** The type whose names a derived code's labels come from: the request's, when it derives the code, else the first that does. */
export function derivedType(
  derived: DerivedCode,
  requested: string | undefined,
): string | undefined {
  return requested !== undefined && derived.types.has(requested)
    ? requested
    : [...derived.types.keys()][0];
}

/** The labels of a derived code's members in `type`, joined. */
export function fieldsFor(
  dictionary: Dictionary,
  derived: DerivedCode,
  type: string | undefined,
): string {
  const members = type === undefined ? [] : (derived.types.get(type) ?? []);
  return members
    .map((member) => labelFor(dictionary, type, member))
    .filter((label) => label !== '')
    .join(SEPARATOR);
}

/** The options an `enum` issue lists in `expected` (a JSON array), each by its label when the field has one. */
export function valuesFor(
  dictionary: Dictionary,
  type: string | undefined,
  member: string | undefined,
  expected: string,
): string {
  let values: unknown;
  try {
    values = JSON.parse(expected);
  } catch {
    return expected;
  }
  if (!Array.isArray(values)) {
    return expected;
  }
  const labels =
    type === undefined || member === undefined
      ? undefined
      : dictionary.options.get(type)?.get(member);
  return values
    .map((value) => {
      const text = String(value);
      return labels?.get(text)?.() ?? text;
    })
    .join(SEPARATOR);
}

/** What the inputs of an issue kind are made from. */
export interface IssueFacts {
  readonly field: string;
  readonly expected: string;
  readonly values: () => string;
}

type Validation = Messages['validation'];

/** The detail of each issue kind, from its message and its inputs. */
const ISSUE_DETAILS: {
  readonly [K in IssueKind]: (
    validation: Validation,
    facts: IssueFacts,
  ) => string;
} = {
  required: (validation, { field }) => validation.required({ field }),
  type: (validation, { field, expected }) =>
    validation.type({ field, type: expected }),
  format: (validation, { field, expected }) =>
    validation.format({ field, format: expected }),
  minLength: (validation, { field, expected }) =>
    validation.minLength({ field, limit: expected }),
  maxLength: (validation, { field, expected }) =>
    validation.maxLength({ field, limit: expected }),
  minimum: (validation, { field, expected }) =>
    validation.minimum({ field, limit: expected }),
  maximum: (validation, { field, expected }) =>
    validation.maximum({ field, limit: expected }),
  exclusiveMinimum: (validation, { field, expected }) =>
    validation.exclusiveMinimum({ field, limit: expected }),
  exclusiveMaximum: (validation, { field, expected }) =>
    validation.exclusiveMaximum({ field, limit: expected }),
  multipleOf: (validation, { field, expected }) =>
    validation.multipleOf({ field, limit: expected }),
  enum: (validation, { field, values }) =>
    validation.enum({ field, values: values() }),
  pattern: (validation, { field }) => validation.pattern({ field }),
  additionalProperties: (validation, { field }) =>
    validation.additionalProperties({ field }),
};

/** The detail of an issue of `kind`, from its kind's message. */
export function issueDetail(
  dictionary: Dictionary,
  kind: IssueKind,
  facts: IssueFacts,
): string {
  return ISSUE_DETAILS[kind](dictionary.messages.validation, facts);
}
