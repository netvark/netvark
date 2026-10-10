/**
 * Helpers for the schema tests: a wire form's schema from a type record,
 * and a parse reported as `ResourceIssue`s with the value as the member.
 */
import type { $ZodType } from 'zod/v4/core';

import type { TypeRecord } from '../schema/value-form';
import type { IssueSummary } from './validation';

import { safeParse } from 'zod/v4/core';

import { toResourceIssues } from '../schema/issues';
import { baseSpec } from '../schema/value-form';
import { levelSchema } from '../schema/value-schema';
import { summarize } from './validation';

/** The schema of a base type's wire form, without nullability or validators. */
export function wireSchema(
  record: Partial<TypeRecord> & Pick<TypeRecord, 'type'>,
): $ZodType {
  const spec = baseSpec({
    typeKind: 'base',
    array: false,
    maxLength: null,
    precision: null,
    scale: null,
    ...record,
  });
  if (spec === undefined) {
    throw new Error(`no wire form for ${record.type}`);
  }
  return levelSchema(spec, { nullable: false, validators: false });
}

/** A parse's issues as `{ code, expected, path }`, or `[]` when it succeeds. */
export function issuesOf(
  schema: $ZodType,
  value: unknown,
  integer = false,
): ReadonlyArray<IssueSummary> {
  const result = safeParse(schema, value, { reportInput: true });
  if (result.success) {
    return [];
  }
  return toResourceIssues(result.error.issues, (path) => ({
    info: { integer, integerElements: integer, codec: undefined },
    depth: path.length,
  })).map((issue) => summarize(issue));
}
