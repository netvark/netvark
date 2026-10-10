/**
 * Helpers for asserting what a resource validator returns: the issues as
 * `{ code, path, expected }`, or the output of a value it accepts. Not
 * published with the package.
 * @packageDocumentation
 */
import type { ResourceIssue } from '../schema/issues';
import type { ResourceValidator } from '../schema/validate';

/** An issue without its message, which `issues.test.ts` pins separately. */
export type IssueSummary = Pick<ResourceIssue, 'code' | 'expected' | 'path'>;

/** An issue as `{ code, path }`, with `expected` when it has one. */
export function summarize(issue: ResourceIssue): IssueSummary {
  const { code, expected, path } = issue;
  return expected === undefined ? { code, path } : { code, expected, path };
}

/** The issues `validator` reports for `value`, `[]` when it accepts it. */
export function issuesOf(
  validator: ResourceValidator,
  value: unknown,
): ReadonlyArray<IssueSummary> {
  const result = validator['~standard'].validate(value);
  return (result.issues ?? []).map((issue) => summarize(issue));
}

/** The output of a value `validator` accepts; fails with the issues otherwise. */
export function outputOf(
  validator: ResourceValidator,
  value: unknown,
): unknown {
  const result = validator['~standard'].validate(value);
  if (result.issues !== undefined) {
    throw new Error(`rejected: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
}
