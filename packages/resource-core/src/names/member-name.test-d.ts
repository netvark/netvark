import type { MEMBER_NAME_CASES } from '../test-support/member-name-cases';
import type {
  IsMemberName,
  MemberNameProblem,
  TypeNameProblem,
} from './member-name';

import { describe, expectTypeOf, it } from 'vitest';

type Case = (typeof MEMBER_NAME_CASES)[number];

/** A case `IsMemberName` gets wrong. */
type Mismatch<TCase> = TCase extends readonly [
  infer TName extends string,
  infer TValid,
]
  ? IsMemberName<TName> extends TValid
    ? never
    : TCase
  : never;

describe('IsMemberName, the type-level twin of isMemberName (SPEC 4.2)', () => {
  it('matches isMemberName on every case of the table', () => {
    expectTypeOf<Case>().not.toBeNever();
    expectTypeOf<Mismatch<Case>>().toBeNever();
  });

  it('leaves a name typed only as string to the runtime', () => {
    expectTypeOf<IsMemberName<string>>().toEqualTypeOf<true>();
  });
});

describe('MemberNameProblem and TypeNameProblem (SPEC 4.2)', () => {
  it('states the runtime reasons', () => {
    expectTypeOf<
      MemberNameProblem<'lid'>
    >().toEqualTypeOf<'is a member of every resource object'>();
    expectTypeOf<
      MemberNameProblem<'prototype'>
    >().toEqualTypeOf<'is a member of Object.prototype'>();
    expectTypeOf<
      MemberNameProblem<'_Tmp'>
    >().toEqualTypeOf<'is not a JSON:API member name'>();
    expectTypeOf<MemberNameProblem<'createdAt'>>().toBeNever();
    expectTypeOf<TypeNameProblem<'type'>>().toBeNever();
    expectTypeOf<
      TypeNameProblem<'constructor'>
    >().toEqualTypeOf<'is a member of Object.prototype'>();
  });
});
