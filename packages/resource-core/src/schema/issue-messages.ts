/**
 * The English message of each issue (SPEC 6.4): constant per kind and
 * parameter, never holding request data. The parameter is the keyword's
 * value (`expected`), which comes from the catalog or the declaration.
 * `defineMessages` localizes the same issues by kind (SPEC 10).
 * @packageDocumentation
 */
import type { IssueKind, Violation } from './issue-kinds';

const TYPES: Readonly<Record<string, string>> = {
  string: 'a string',
  integer: 'an integer',
  number: 'a number',
  boolean: 'a boolean',
  array: 'an array',
  object: 'an object',
};

const FORMATS: Readonly<Record<string, string>> = {
  uuid: 'a UUID',
  date: 'a date (YYYY-MM-DD)',
  'date-time': 'a date and time with an offset (RFC 3339)',
  'date-time-local': 'a date and time without an offset (RFC 3339)',
  int16: 'an integer written as a string',
  int32: 'an integer written as a string',
  int64: 'an integer written as a string',
  decimal: 'a decimal number written as a string',
  float: 'a number single precision can hold',
  double: 'a number written as a string',
  text: 'text without U+0000 or unpaired surrogates',
  json: 'a JSON value',
};

/** The message of an issue a validator raises with its constraint's code. */
export const CONSTRAINT_MESSAGE = 'The value violates a constraint.';

function characters(limit: string | undefined): string {
  return limit === '1' ? '1 character' : `${limit ?? ''} characters`;
}

/** The message of an `enum` issue: the allowed values, or their labels. */
export function enumMessage(values: ReadonlyArray<string>): string {
  return values.length > 0
    ? `Must be one of: ${values.join(', ')}.`
    : 'No value is allowed.';
}

function optionsOf(expected: string | undefined): string {
  const values: unknown = JSON.parse(expected ?? '[]');
  return enumMessage(Array.isArray(values) ? values.map(String) : []);
}

const MESSAGES: Readonly<
  Record<IssueKind, (expected: string | undefined) => string>
> = {
  required: () => 'A value is required.',
  type: (expected) => `Must be ${TYPES[expected ?? ''] ?? 'another type'}.`,
  format: (expected) =>
    `Must be ${FORMATS[expected ?? ''] ?? `a valid ${expected ?? 'value'}`}.`,
  minLength: (expected) => `Must be at least ${characters(expected)}.`,
  maxLength: (expected) => `Must be at most ${characters(expected)}.`,
  minimum: (expected) => `Must be at least ${expected ?? ''}.`,
  maximum: (expected) => `Must be at most ${expected ?? ''}.`,
  exclusiveMinimum: (expected) => `Must be greater than ${expected ?? ''}.`,
  exclusiveMaximum: (expected) => `Must be less than ${expected ?? ''}.`,
  multipleOf: (expected) => `Must be a multiple of ${expected ?? ''}.`,
  enum: optionsOf,
  pattern: () => 'Must match the required pattern.',
  additionalProperties: () => 'Is not a member of this resource.',
};

/** The English message of a violation. */
export function issueMessage(violation: Violation): string {
  return MESSAGES[violation.kind](violation.expected);
}
