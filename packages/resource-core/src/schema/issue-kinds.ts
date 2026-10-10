/**
 * The issue kinds of SPEC 6.4 (ADR 0007): the JSON Schema validation
 * keywords that express the same constraint, so the OpenAPI document and
 * the issues name it alike. The vocabulary is resource-core's, so a Zod
 * release cannot rename it.
 * @ref https://json-schema.org/draft/2020-12/json-schema-validation#section-6
 * @packageDocumentation
 */

/** A kind of schema issue; a validator's issue carries its constraint's code instead. */
export type IssueKind =
  | 'required'
  | 'type'
  | 'format'
  | 'minLength'
  | 'maxLength'
  | 'minimum'
  | 'maximum'
  | 'exclusiveMinimum'
  | 'exclusiveMaximum'
  | 'multipleOf'
  | 'enum'
  | 'pattern'
  | 'additionalProperties';

/** The thirteen kinds, in the order of SPEC 6.4. */
export const ISSUE_KINDS: ReadonlyArray<IssueKind> = Object.freeze([
  'required',
  'type',
  'format',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'enum',
  'pattern',
  'additionalProperties',
]);

/** Why a value fails: an issue kind and the keyword's value as text, where it has one. */
export interface Violation {
  readonly kind: IssueKind;
  readonly expected?: string | undefined;
}
