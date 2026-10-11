/**
 * Validators of CHECKs over several columns (SPEC 3.5, 6.2, 7.2). Each
 * runs on an object of the CHECK's members keyed by public name, a field
 * as its parsed value and a relationship as its id or `null`, and only
 * when every member is present in the input and parsed without an issue;
 * otherwise the database decides (SPEC 9.5). A CHECK with a column that is
 * not a member can never have every member present, so it gets no check.
 * A rejection raises one issue per member, carrying the constraint's code,
 * as the database's rejection of the same CHECK points at each member.
 * @ref https://zod.dev/api#when
 * @packageDocumentation
 */
import type { $ZodCheck, $ZodRawIssue, ParsePayload } from 'zod/v4/core';

import type { SpecSource } from './field-spec';
import type { ValidatorUse } from './value-form';

import { z } from 'zod/v4';
import { safeParse } from 'zod/v4/core';

import { isRecord, ownValue } from '../internal/object';
import { deriveCode } from '../names/code';
import { CONSTRAINT_MESSAGE } from './issue-messages';
import { PARAMS_KEY } from './raise';

/** A member of a multi-column CHECK: its public name and where an object holds it. */
export interface CheckMember {
  readonly name: string;
  readonly kind: 'field' | 'relationship';
}

/** A multi-column CHECK whose validator the declaration names. */
export interface MultiColumnCheck {
  readonly constraint: string;
  readonly use: ValidatorUse;
  readonly members: ReadonlyArray<CheckMember>;
}

/** Where an object holds a member: its path from the object, and how to read the validator's input there. */
export interface MemberLocation {
  readonly path: ReadonlyArray<string>;
  readonly read: (value: unknown) => unknown;
}

/** The multi-column CHECKs with a declared validator and only member columns. */
export function multiColumnChecks(
  source: SpecSource,
): ReadonlyArray<MultiColumnCheck> {
  const { declaration, names, context } = source;
  const checks: Array<MultiColumnCheck> = [];
  for (const [constraint, definition] of Object.entries(
    source.tableDef.constraints,
  )) {
    const validatorName = ownValue(
      declaration.rules ?? {},
      constraint,
    )?.validator;
    const validator =
      validatorName === undefined
        ? undefined
        : ownValue(context.validators, validatorName);
    if (
      definition.kind !== 'check' ||
      definition.columns.length < 2 ||
      validatorName === undefined ||
      validator === undefined
    ) {
      continue;
    }
    const members = definition.columns.map(
      (column): CheckMember | undefined => {
        const name = names.columns.get(column);
        if (name === undefined) {
          return undefined;
        }
        return {
          name,
          kind: names.fields.has(name) ? 'field' : 'relationship',
        };
      },
    );
    if (members.every((member) => member !== undefined)) {
      checks.push({
        constraint,
        use: {
          name: validatorName,
          validator,
          code: names.rules.get(constraint) ?? deriveCode(constraint),
          check: { domain: null, constraint },
        },
        members,
      });
    }
  }
  return checks;
}

function valueAt(root: unknown, path: ReadonlyArray<string>): unknown {
  let value = root;
  for (const key of path) {
    value = isRecord(value) ? ownValue(value, key) : undefined;
  }
  return value;
}

/**
 * Whether a multi-column CHECK raised the issue. Readiness ignores such
 * issues: a member another CHECK rejected still parsed, and each CHECK must
 * hold on its own, so every failing one is reported, where the database
 * reports only the first it finds.
 */
function raisedByCheck(issue: $ZodRawIssue): boolean {
  const params: unknown =
    issue.code === 'custom' ? issue.params?.[PARAMS_KEY] : undefined;
  return typeof params === 'object' && params !== null && 'check' in params;
}

function startsWith(
  path: ReadonlyArray<PropertyKey>,
  prefix: ReadonlyArray<string>,
): boolean {
  return prefix.every((key, index) => path[index] === key);
}

/**
 * The refinements of one CHECK on an object: one per member, each raising
 * the constraint's code at that member. The validator runs once per parse;
 * the members' refinements share its verdict.
 */
export function checkRefinements(
  check: MultiColumnCheck,
  locate: (member: CheckMember) => MemberLocation,
): ReadonlyArray<$ZodCheck<object>> {
  const locations = check.members.map((member) => ({
    member,
    location: locate(member),
  }));
  const verdicts = new WeakMap<object, boolean>();
  const ready = (payload: ParsePayload): boolean =>
    locations.every(
      ({ location }) =>
        valueAt(payload.value, location.path) !== undefined &&
        !payload.issues.some(
          (issue) =>
            !raisedByCheck(issue) &&
            startsWith(issue.path ?? [], location.path),
        ),
    );
  const accepts = (value: object): boolean => {
    const known = verdicts.get(value);
    if (known !== undefined) {
      return known;
    }
    const input = Object.fromEntries(
      locations.map(({ member, location }) => [
        member.name,
        location.read(valueAt(value, location.path)),
      ]),
    );
    const verdict = safeParse(check.use.validator.schema, input).success;
    verdicts.set(value, verdict);
    return verdict;
  };
  return locations.map(({ location }) =>
    z.refine<object>(accepts, {
      when: ready,
      path: [...location.path],
      message: CONSTRAINT_MESSAGE,
      params: { [PARAMS_KEY]: { code: check.use.code, check: true } },
    }),
  );
}
